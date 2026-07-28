import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { encrypt } from './utils/cryptoImap.js';
import { getEmailConfig } from './services/emailIngestService.js';

/**
 * Config IMAP du tenant, SANS le mot de passe (juste un booléen password_defini).
 */
export async function getConfigSafe() {
  const config = await getEmailConfig();
  if (!config) {
    return {
      imap_host: null,
      imap_port: 993,
      imap_user: null,
      imap_tls: true,
      folder: 'INBOX',
      actif: false,
      derniere_synchro: null,
      password_defini: false,
    };
  }

  const { imap_password_encrypted, ...rest } = config;
  return { ...rest, password_defini: Boolean(imap_password_encrypted) };
}

/**
 * Upsert de la config (singleton id=1). Si le mot de passe n'est pas fourni,
 * l'existant est conservé. Le mot de passe est toujours chiffré (AES-256-GCM).
 */
export async function upsertConfig(data) {
  const existing = await getEmailConfig();

  const host = (data.imap_host ?? existing?.imap_host ?? '').trim();
  const user = (data.imap_user ?? existing?.imap_user ?? '').trim();
  const port = parseInt(data.imap_port ?? existing?.imap_port ?? 993, 10);
  const tls = data.imap_tls !== undefined ? Boolean(data.imap_tls) : (existing?.imap_tls ?? true);
  const folder = (data.folder ?? existing?.folder ?? 'INBOX').trim() || 'INBOX';
  const actif = data.actif !== undefined ? Boolean(data.actif) : (existing?.actif ?? false);

  if (!host) throw ApiError.badRequest('Hôte IMAP requis');
  if (!user) throw ApiError.badRequest('Utilisateur IMAP requis');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw ApiError.badRequest('Port IMAP invalide');
  }

  let passwordEncrypted = existing?.imap_password_encrypted || null;
  if (data.imap_password) {
    passwordEncrypted = encrypt(data.imap_password);
  }

  if (actif && !passwordEncrypted) {
    throw ApiError.badRequest('Un mot de passe est requis pour activer la synchronisation');
  }

  await query(
    `INSERT INTO tenant_email_config (imap_host, imap_port, imap_user, imap_password_encrypted, imap_tls, folder, actif, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       imap_host = EXCLUDED.imap_host,
       imap_port = EXCLUDED.imap_port,
       imap_user = EXCLUDED.imap_user,
       imap_password_encrypted = EXCLUDED.imap_password_encrypted,
       imap_tls = EXCLUDED.imap_tls,
       folder = EXCLUDED.folder,
       actif = EXCLUDED.actif,
       updated_at = NOW()`,
    [host, port, user, passwordEncrypted, tls, folder, actif],
  );

  return getConfigSafe();
}
