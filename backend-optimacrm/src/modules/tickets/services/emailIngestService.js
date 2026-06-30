import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { query } from '../../../config/database.js';
import { decrypt } from '../utils/cryptoImap.js';
import { createTicketFromEmail } from '../ticket.service.js';

const LOG_PREFIX = '[EMAIL-INGEST]';
const MAX_DESCRIPTION_LENGTH = 10000;
const CONNECT_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getEmailConfig() {
  const result = await query('SELECT * FROM tenant_email_config WHERE id = 1');
  return result.rows[0] || null;
}

function buildImapClient(config, password) {
  return new ImapFlow({
    host: config.imap_host,
    port: config.imap_port,
    secure: config.imap_tls,
    auth: { user: config.imap_user, pass: password },
    logger: false,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: 60000,
  });
}

function fallbackMessageId(from, subject, date) {
  const hash = crypto
    .createHash('sha256')
    .update(`${from || ''}|${subject || ''}|${date ? new Date(date).toISOString() : ''}`)
    .digest('hex');
  return `fallback-${hash}`;
}

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildDescription(parsed) {
  let text = (parsed.text || '').trim();
  if (!text && parsed.html) text = stripHtml(parsed.html);
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    text = `${text.slice(0, MAX_DESCRIPTION_LENGTH)}\n\n[… contenu tronqué]`;
  }
  return text || null;
}

async function findClientByEmail(fromAddress) {
  if (!fromAddress) return null;

  // Rapprochement sur l'email principal du client
  const direct = await query(
    'SELECT id FROM clients WHERE LOWER(email_principal) = LOWER($1) LIMIT 1',
    [fromAddress],
  );
  if (direct.rows.length > 0) return direct.rows[0].id;

  // Fallback : email d'un contact du client
  const viaContact = await query(
    'SELECT client_id FROM client_contacts WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [fromAddress],
  );
  if (viaContact.rows.length > 0) return viaContact.rows[0].client_id;

  return null;
}

// ---------------------------------------------------------------------------
// Ingestion : boîte mail -> tickets
// ---------------------------------------------------------------------------

/**
 * Lit la boîte IMAP configurée et crée un ticket par mail non lu.
 * Le mail n'est marqué comme lu QUE si l'insertion en base a réussi.
 * @returns {{ created: number, skipped: number, errors: number }}
 */
export async function fetchAndCreateTickets() {
  const stats = { created: 0, skipped: 0, errors: 0 };

  const config = await getEmailConfig();
  if (!config || !config.actif) {
    return stats;
  }
  if (!config.imap_host || !config.imap_user || !config.imap_password_encrypted) {
    console.warn(`${LOG_PREFIX} Config IMAP incomplète, synchro ignorée`);
    return stats;
  }

  const password = decrypt(config.imap_password_encrypted);
  const client = buildImapClient(config, password);

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.folder || 'INBOX');

    try {
      const unseenUids = await client.search({ seen: false }, { uid: true });

      if (unseenUids && unseenUids.length > 0) {
        console.log(`${LOG_PREFIX} ${unseenUids.length} mail(s) non lu(s) dans ${config.folder}`);
      }

      for (const uid of unseenUids || []) {
        try {
          const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!message || !message.source) {
            stats.errors++;
            continue;
          }

          const parsed = await simpleParser(message.source);
          const fromAddress = parsed.from?.value?.[0]?.address || null;
          const fromRaw = parsed.from?.text || fromAddress || null;
          const subject = (parsed.subject || '').trim() || '(sans objet)';
          const receivedAt = parsed.date || new Date();
          const messageId =
            (parsed.messageId || '').trim() || fallbackMessageId(fromRaw, subject, receivedAt);

          // Déduplication par Message-ID
          const dup = await query(
            'SELECT 1 FROM tickets WHERE email_message_id = $1',
            [messageId],
          );
          if (dup.rows.length > 0) {
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            stats.skipped++;
            continue;
          }

          const clientId = await findClientByEmail(fromAddress);

          const ticket = await createTicketFromEmail({
            sujet: subject.slice(0, 255),
            description: buildDescription(parsed),
            client_id: clientId,
            email_message_id: messageId,
            email_from: fromRaw,
            email_received_at: receivedAt,
          });

          // Marquer lu UNIQUEMENT après insertion réussie
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          stats.created++;
          console.log(`${LOG_PREFIX} Ticket ${ticket.numero} créé depuis "${fromRaw}" — ${subject}`);
        } catch (err) {
          // Contrainte unique = course entre deux synchros : marquer lu et passer
          if (err.code === '23505') {
            try {
              await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            } catch { /* ignore */ }
            stats.skipped++;
            continue;
          }
          stats.errors++;
          console.error(`${LOG_PREFIX} Erreur sur le mail uid=${uid} :`, err.message);
        }
      }
    } finally {
      lock.release();
    }

    await query('UPDATE tenant_email_config SET derniere_synchro = NOW(), updated_at = NOW() WHERE id = 1');
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }

  return stats;
}

/**
 * Point d'entrée du scheduler. L'app est mono-instance (pas de tenant_id en
 * base) : on traite l'unique config active, avec isolation des erreurs pour
 * ne jamais faire crasher le process.
 */
export async function fetchAndCreateTicketsAllTenants() {
  try {
    const stats = await fetchAndCreateTickets();
    if (stats.created > 0 || stats.errors > 0) {
      console.log(
        `${LOG_PREFIX} Synchro terminée : ${stats.created} créé(s), ${stats.skipped} ignoré(s), ${stats.errors} erreur(s)`,
      );
    }
    return stats;
  } catch (err) {
    console.error(`${LOG_PREFIX} Échec de la synchronisation :`, err.message);
    return { created: 0, skipped: 0, errors: 1 };
  }
}

/**
 * Teste la connexion IMAP (login + sélection du folder), sans créer de ticket.
 * @param {object|null} override config partielle saisie dans le formulaire (non sauvegardée)
 */
export async function testImapConnection(override = null) {
  const stored = await getEmailConfig();

  const config = {
    imap_host: override?.imap_host ?? stored?.imap_host,
    imap_port: override?.imap_port ?? stored?.imap_port ?? 993,
    imap_user: override?.imap_user ?? stored?.imap_user,
    imap_tls: override?.imap_tls ?? stored?.imap_tls ?? true,
    folder: override?.folder ?? stored?.folder ?? 'INBOX',
  };

  if (!config.imap_host || !config.imap_user) {
    return { success: false, message: 'Hôte et utilisateur IMAP requis' };
  }

  let password = override?.imap_password || null;
  if (!password) {
    if (!stored?.imap_password_encrypted) {
      return { success: false, message: 'Aucun mot de passe défini' };
    }
    password = decrypt(stored.imap_password_encrypted);
  }

  const client = buildImapClient(config, password);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(config.folder);
    const total = mailbox.exists;
    await client.logout();
    return {
      success: true,
      message: `Connexion réussie — dossier "${config.folder}" (${total} message(s))`,
    };
  } catch (err) {
    client.close();
    return { success: false, message: `Échec de la connexion : ${err.message}` };
  }
}
