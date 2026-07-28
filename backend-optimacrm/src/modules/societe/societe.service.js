import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { bucket, isFirebaseReady } from '../../config/firebase.js';
import fs from 'fs/promises';
import path from 'path';

const FIELDS = `
  id, raison_sociale, forme_juridique, siret, siren, tva_intracommunautaire,
  code_ape, capital_social, rcs_ville, numero_rcs,
  adresse_ligne1, adresse_ligne2, code_postal, ville, pays,
  telephone, email_contact, email_facturation, site_web,
  logo_url, couleur_principale, signature_email, mentions_legales, cgv,
  message_devis_defaut, message_facture_defaut,
  banque_nom, iban, bic,
  prefixe_devis, prefixe_facture, prefixe_client, prefixe_bon_commande,
  remise_a_zero_annuelle, updated_at, updated_by
`;

export async function getConfig() {
  const result = await query(`SELECT ${FIELDS} FROM societe_config LIMIT 1`);
  if (result.rows.length === 0) {
    await query('INSERT INTO societe_config DEFAULT VALUES');
    const fresh = await query(`SELECT ${FIELDS} FROM societe_config LIMIT 1`);
    return fresh.rows[0];
  }
  return result.rows[0];
}

export async function updateConfig(data, userId) {
  const fields = [
    'raison_sociale', 'forme_juridique', 'siret', 'siren', 'tva_intracommunautaire',
    'code_ape', 'capital_social', 'rcs_ville', 'numero_rcs',
    'adresse_ligne1', 'adresse_ligne2', 'code_postal', 'ville', 'pays',
    'telephone', 'email_contact', 'email_facturation', 'site_web',
    'couleur_principale', 'signature_email', 'mentions_legales', 'cgv',
    'message_devis_defaut', 'message_facture_defaut',
    'banque_nom', 'iban', 'bic',
    'prefixe_devis', 'prefixe_facture', 'prefixe_client', 'prefixe_bon_commande',
    'remise_a_zero_annuelle',
  ];

  const setClauses = [];
  const params = [];
  let i = 1;

  for (const field of fields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = $${i++}`);
      params.push(data[field] === '' ? null : data[field]);
    }
  }

  if (setClauses.length === 0) {
    throw ApiError.badRequest('Aucun champ à mettre à jour');
  }

  setClauses.push(`updated_at = NOW()`);
  setClauses.push(`updated_by = $${i++}`);
  params.push(userId);

  const result = await query(
    `UPDATE societe_config SET ${setClauses.join(', ')} RETURNING ${FIELDS}`,
    params,
  );

  return result.rows[0];
}

// ── Helpers pour supprimer l'ancien logo ────────────────────────────────────

function extractFirebasePath(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const encoded = u.pathname.split('/o/')[1]?.split('?')[0];
    if (encoded) return decodeURIComponent(encoded);
    const gcsMatch = u.pathname.match(/^\/[^/]+\/(.+)$/);
    return gcsMatch ? gcsMatch[1] : null;
  } catch {
    return url.startsWith('logos/') ? url : null;
  }
}

async function deleteOldLogo(logoUrl) {
  if (!logoUrl) return;

  if (logoUrl.startsWith('http') && isFirebaseReady()) {
    const fbPath = extractFirebasePath(logoUrl);
    if (fbPath) await bucket.file(fbPath).delete().catch(() => {});
  } else if (logoUrl.startsWith('/uploads/')) {
    const localPath = path.resolve('uploads', logoUrl.replace(/^\/uploads\//, ''));
    await fs.unlink(localPath).catch(() => {});
  }
}

// ── Upload / Delete logo ────────────────────────────────────────────────────

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.svg'];
const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export async function uploadLogo(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw ApiError.badRequest('Format non supporté. Formats acceptés : JPG, PNG, SVG');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw ApiError.badRequest('Le fichier ne doit pas dépasser 2 Mo');
  }

  const current = await query('SELECT logo_url FROM societe_config LIMIT 1');
  await deleteOldLogo(current.rows[0]?.logo_url);

  const filename = `logo-${Date.now()}${ext}`;
  let logoUrl;

  if (isFirebaseReady()) {
    const firebaseFile = bucket.file(`logos/${filename}`);
    await firebaseFile.save(file.buffer, {
      metadata: { contentType: MIME_MAP[ext] || 'application/octet-stream' },
      public: true,
    });
    logoUrl = `https://storage.googleapis.com/${bucket.name}/logos/${filename}`;
  } else {
    await fs.mkdir(path.resolve('uploads/logos'), { recursive: true });
    await fs.writeFile(path.resolve('uploads/logos', filename), file.buffer);
    logoUrl = `/uploads/logos/${filename}`;
  }

  await query('UPDATE societe_config SET logo_url = $1, updated_at = NOW()', [logoUrl]);
  return { logo_url: logoUrl };
}

export async function deleteLogo() {
  const current = await query('SELECT logo_url FROM societe_config LIMIT 1');
  await deleteOldLogo(current.rows[0]?.logo_url);
  await query('UPDATE societe_config SET logo_url = NULL, updated_at = NOW()');
}
