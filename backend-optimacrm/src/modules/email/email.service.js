import nodemailer from 'nodemailer';
import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ── Config CRUD ──────────────────────────────────────────────────────────────

export async function getEmailConfig() {
  const result = await query('SELECT * FROM email_config WHERE id = 1');
  if (result.rows.length === 0) {
    await query('INSERT INTO email_config (id) VALUES (1) ON CONFLICT DO NOTHING');
    const fresh = await query('SELECT * FROM email_config WHERE id = 1');
    return sanitizeConfig(fresh.rows[0]);
  }
  return sanitizeConfig(result.rows[0]);
}

export async function getEmailConfigRaw() {
  const result = await query('SELECT * FROM email_config WHERE id = 1');
  return result.rows[0] || null;
}

function sanitizeConfig(config) {
  if (!config) return config;
  const sanitized = { ...config };
  if (sanitized.smtp_password) {
    sanitized.smtp_password = '••••••••';
  }
  return sanitized;
}

export async function updateEmailConfig(data) {
  const fields = [
    'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password',
    'smtp_from_name', 'smtp_from_email', 'reply_to_email', 'signature',
    'template_facture_sujet', 'template_facture_corps',
    'template_devis_sujet', 'template_devis_corps',
  ];

  const setClauses = [];
  const params = [];
  let i = 1;

  for (const field of fields) {
    if (data[field] !== undefined) {
      if (field === 'smtp_password' && data[field] === '••••••••') continue;
      setClauses.push(`${field} = $${i++}`);
      params.push(data[field] === '' ? null : data[field]);
    }
  }

  if (setClauses.length === 0) {
    throw ApiError.badRequest('Aucun champ à mettre à jour');
  }

  const hasSmtpFields = data.smtp_host && data.smtp_user && data.smtp_password && data.smtp_password !== '••••••••';
  if (hasSmtpFields || data.est_configure !== undefined) {
    setClauses.push(`est_configure = $${i++}`);
    params.push(!!data.smtp_host && !!data.smtp_user);
  }

  setClauses.push('updated_at = NOW()');

  const result = await query(
    `UPDATE email_config SET ${setClauses.join(', ')} WHERE id = 1 RETURNING *`,
    params,
  );

  return sanitizeConfig(result.rows[0]);
}

// ── Vérification SMTP ────────────────────────────────────────────────────────

export async function verifySmtpConnection() {
  const config = await getEmailConfigRaw();
  if (!config || !config.smtp_host || !config.smtp_user) {
    throw ApiError.badRequest('Configuration SMTP incomplète. Renseignez au minimum le serveur, l\'utilisateur et le mot de passe.');
  }

  const transporter = createTransporter(config);

  try {
    await transporter.verify();
    await query(
      'UPDATE email_config SET est_configure = true, derniere_verification = NOW(), updated_at = NOW() WHERE id = 1'
    );
    return { success: true, message: 'Connexion SMTP vérifiée avec succès' };
  } catch (err) {
    await query(
      'UPDATE email_config SET est_configure = false, updated_at = NOW() WHERE id = 1'
    );
    throw ApiError.badRequest(`Échec de connexion SMTP : ${err.message}`);
  }
}

// ── Envoi test ───────────────────────────────────────────────────────────────

export async function sendTestEmail(destinataire) {
  const config = await getEmailConfigRaw();
  if (!config || !config.est_configure) {
    throw ApiError.badRequest('Le SMTP n\'est pas configuré. Vérifiez d\'abord votre connexion.');
  }

  const transporter = createTransporter(config);
  const fromName = config.smtp_from_name || 'OptimaCRM';
  const fromEmail = config.smtp_from_email || config.smtp_user;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: destinataire,
    replyTo: config.reply_to_email || fromEmail,
    subject: 'Test de configuration email — OptimaCRM',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#6B46C1;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;font-size:20px;">OptimaCRM</h1>
        </div>
        <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
          <h2 style="color:#1a1a2e;margin-top:0;">Configuration email réussie !</h2>
          <p style="color:#4b5563;">Cet email confirme que votre configuration SMTP fonctionne correctement.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:20px;">Envoyé depuis OptimaCRM le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    `,
  });

  await logEmail({
    type_document: 'test',
    destinataire,
    sujet: 'Test de configuration email',
    statut: 'envoyé',
  });

  return { success: true, message: `Email de test envoyé à ${destinataire}` };
}

// ── Envoi facture par email ──────────────────────────────────────────────────

export async function sendFactureEmail({ facture, pdfBuffer, destinataire, sujet, corps }) {
  const config = await getEmailConfigRaw();
  if (!config || !config.est_configure) {
    throw ApiError.badRequest('Le SMTP n\'est pas configuré. Configurez-le dans Paramètres > Email.');
  }

  const transporter = createTransporter(config);
  const fromName = config.smtp_from_name || 'OptimaCRM';
  const fromEmail = config.smtp_from_email || config.smtp_user;

  const signature = config.signature || '';
  const signatureHtml = signature ? `<br><br><div style="color:#6b7280;font-size:13px;white-space:pre-line;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px;">${escapeHtml(signature)}</div>` : '';

  const corpsHtml = escapeHtml(corps).replace(/\n/g, '<br>');

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: destinataire,
      replyTo: config.reply_to_email || fromEmail,
      subject: sujet,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#6B46C1;padding:16px 20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:18px;">${escapeHtml(fromName)}</h1>
          </div>
          <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
            <div style="color:#1a1a2e;font-size:14px;line-height:1.6;">${corpsHtml}</div>
            ${signatureHtml}
          </div>
          <div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px;">
            Envoyé via OptimaCRM
          </div>
        </div>
      `,
      attachments: [{
        filename: `facture-${facture.numero_facture}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    await logEmail({
      type_document: 'facture',
      document_id: facture.id,
      document_numero: facture.numero_facture,
      destinataire,
      sujet,
      statut: 'envoyé',
    });

    return { success: true };
  } catch (err) {
    await logEmail({
      type_document: 'facture',
      document_id: facture.id,
      document_numero: facture.numero_facture,
      destinataire,
      sujet,
      statut: 'erreur',
      message_erreur: err.message,
    });
    throw ApiError.badRequest(`Erreur d'envoi : ${err.message}`);
  }
}

// ── Envoi devis par email ─────────────────────────────────────────────────────

export async function sendDevisEmail({ devis, pdfBuffer, destinataire, sujet, corps }) {
  const config = await getEmailConfigRaw();
  if (!config || !config.est_configure) {
    throw ApiError.badRequest('Le SMTP n\'est pas configuré. Configurez-le dans Paramètres > Email.');
  }

  const transporter = createTransporter(config);
  const fromName = config.smtp_from_name || 'OptimaCRM';
  const fromEmail = config.smtp_from_email || config.smtp_user;

  const signature = config.signature || '';
  const signatureHtml = signature ? `<br><br><div style="color:#6b7280;font-size:13px;white-space:pre-line;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px;">${escapeHtml(signature)}</div>` : '';

  const corpsHtml = escapeHtml(corps).replace(/\n/g, '<br>');
  const numero = devis.numero_devis || String(devis.id);
  const filename = `DEVIS-${numero}.pdf`;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: destinataire,
      replyTo: config.reply_to_email || fromEmail,
      subject: sujet,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#2563EB;padding:16px 20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:18px;">${escapeHtml(fromName)}</h1>
          </div>
          <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
            <div style="color:#1a1a2e;font-size:14px;line-height:1.6;">${corpsHtml}</div>
            ${signatureHtml}
          </div>
          <div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px;">
            Envoyé via OptimaCRM
          </div>
        </div>
      `,
      attachments: [{
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    await logEmail({
      type_document: 'devis',
      document_id: devis.id,
      document_numero: devis.numero_devis,
      destinataire,
      sujet,
      statut: 'envoyé',
    });

    return { success: true };
  } catch (err) {
    await logEmail({
      type_document: 'devis',
      document_id: devis.id,
      document_numero: devis.numero_devis,
      destinataire,
      sujet,
      statut: 'erreur',
      message_erreur: err.message,
    });
    throw ApiError.badRequest(`Erreur d'envoi : ${err.message}`);
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function getRenderedTemplate(facture) {
  const config = await getEmailConfigRaw();
  const societe = await query('SELECT * FROM societe_config WHERE id = 1');
  const s = societe.rows[0] || {};

  const sujetTemplate = config?.template_facture_sujet || 'Votre facture {{numero}} - {{societe}}';
  const corpsTemplate = config?.template_facture_corps || 'Bonjour,\n\nVeuillez trouver ci-joint votre facture.';

  const vars = {
    '{{numero}}': facture.numero_facture || '',
    '{{societe}}': s.raison_sociale || '',
    '{{montant_ttc}}': formatMontant(facture.total_ttc),
    '{{montant_ht}}': formatMontant(facture.total_ht),
    '{{date_echeance}}': formatDate(facture.date_echeance),
    '{{date_creation}}': formatDate(facture.date_creation),
    '{{client}}': facture.client_raison_sociale || '',
  };

  let sujet = sujetTemplate;
  let corps = corpsTemplate;
  for (const [key, val] of Object.entries(vars)) {
    sujet = sujet.replaceAll(key, val);
    corps = corps.replaceAll(key, val);
  }

  return { sujet, corps, destinataire: facture.client_email || '' };
}

export async function getRenderedDevisTemplate(devis) {
  const config = await getEmailConfigRaw();
  const societe = await query('SELECT * FROM societe_config WHERE id = 1');
  const s = societe.rows[0] || {};

  const sujetTemplate = config?.template_devis_sujet || 'Votre devis {{numero}} - {{societe}}';
  const corpsTemplate = config?.template_devis_corps || 'Bonjour,\n\nVeuillez trouver ci-joint votre devis.';

  const clientLabel = devis.client?.raison_sociale || devis.nom_client_libre || '';
  const destinataire = devis.contact?.email || devis.client?.email_principal || '';

  const vars = {
    '{{numero}}': devis.numero_devis || '',
    '{{societe}}': s.raison_sociale || '',
    '{{montant_ttc}}': formatMontant(devis.montant_ttc),
    '{{montant_ht}}': formatMontant(devis.montant_ht),
    '{{date_validite}}': formatDate(devis.date_validite),
    '{{date_emission}}': formatDate(devis.date_emission || devis.date_creation),
    '{{client}}': clientLabel,
    '{{objet}}': devis.objet || '',
  };

  let sujet = sujetTemplate;
  let corps = corpsTemplate;
  for (const [key, val] of Object.entries(vars)) {
    sujet = sujet.replaceAll(key, val);
    corps = corps.replaceAll(key, val);
  }

  return { sujet, corps, destinataire };
}

// ── Logs ─────────────────────────────────────────────────────────────────────

export async function getEmailLogs({ page = 1, limit = 20, document_id, type_document } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (document_id) { conditions.push(`document_id = $${idx++}`); params.push(document_id); }
  if (type_document) { conditions.push(`type_document = $${idx++}`); params.push(type_document); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const countRes = await query(`SELECT COUNT(*) FROM email_logs ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  const dataRes = await query(
    `SELECT * FROM email_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    logs: dataRes.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ── Helpers privés ───────────────────────────────────────────────────────────

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: parseInt(config.smtp_port) || 587,
    secure: config.smtp_secure || false,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_password,
    },
    tls: { rejectUnauthorized: false },
  });
}

async function logEmail({ type_document, document_id, document_numero, destinataire, sujet, statut, message_erreur }) {
  await query(
    `INSERT INTO email_logs (type_document, document_id, document_numero, destinataire, sujet, statut, message_erreur)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [type_document || null, document_id || null, document_numero || null, destinataire, sujet, statut, message_erreur || null]
  );
}

function formatMontant(val) {
  if (val === null || val === undefined) return '0,00 €';
  return parseFloat(val).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
