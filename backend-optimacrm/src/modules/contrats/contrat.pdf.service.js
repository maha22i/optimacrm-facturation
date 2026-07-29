import { query } from '../../config/database.js';
import { bucket, isFirebaseReady } from '../../config/firebase.js';
import puppeteer from 'puppeteer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatMontant(val, decimales = 2) {
  if (val === null || val === undefined) return '—';
  return parseFloat(val).toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }) + ' €';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TYPE_LABELS = {
  Copieur: 'Copieur',
  Telephonie: 'Téléphonie',
  Informatique: 'Informatique',
  Securite: 'Sécurité',
};

const PERIODICITE_LABELS = {
  Mensuel: 'Mensuel',
  Bimestriel: 'Bimestriel',
  Trimestriel: 'Trimestriel',
  Semestriel: 'Semestriel',
  Annuel: 'Annuel',
};

// ─── Données ─────────────────────────────────────────────────────────────────

async function getSocieteConfig() {
  const { rows } = await query('SELECT * FROM societe_config LIMIT 1');
  return rows[0] || {};
}

async function fetchLogoAsBase64(logoUrl) {
  if (!logoUrl) return null;
  try {
    if (isFirebaseReady() && logoUrl.includes('storage.googleapis.com')) {
      const pathMatch = logoUrl.match(/\/([^/]+\/[^/]+)$/);
      const filePath = pathMatch ? pathMatch[1] : null;
      if (filePath) {
        const file = bucket.file(filePath);
        const [buffer] = await file.download();
        const ext = logoUrl.split('.').pop()?.toLowerCase() || 'png';
        const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
        const mime = mimeMap[ext] || 'image/png';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      }
    }
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = logoUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'png';
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
    const mime = mimeMap[ext] || 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

async function getContratForPdf(contratId) {
  const { rows: [contrat] } = await query(
    `SELECT c.id, c.numero_contrat, c.type_contrat, c.type_facturation, c.periodicite,
            c.date_signature, c.date_debut, c.date_echeance, c.date_renouvellement,
            c.duree_contrat_mois, c.loyer_ht, c.terme_facturation, c.ftc, c.ect,
            c.statut, c.notes, c.client_id,
            cl.raison_sociale AS client_raison_sociale,
            cl.numero_client AS client_code,
            cl.email_principal AS client_email,
            cl.telephone_principal AS client_telephone
     FROM contrats c
     JOIN clients cl ON cl.id = c.client_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [contratId],
  );
  if (!contrat) return null;

  const { rows: [adresse] } = await query(
    `SELECT ligne1, ligne2, code_postal, ville
     FROM client_adresses
     WHERE client_id = $1 AND type = 'FACTURATION' AND est_defaut = true
     LIMIT 1`,
    [contrat.client_id],
  );
  contrat.client_adresse = adresse?.ligne1 || '';
  contrat.client_cp = adresse?.code_postal || '';
  contrat.client_ville = adresse?.ville || '';

  const { rows: lignes } = await query(
    `SELECT designation, reference, quantite, prix_unitaire_ht, remise_pourcentage,
            ROUND(quantite * prix_unitaire_ht * (1 - COALESCE(remise_pourcentage, 0) / 100), 2) AS total_ht,
            categorie_ligne, inclus_abonnement
     FROM contrat_lignes WHERE contrat_id = $1 ORDER BY ordre, id`,
    [contratId],
  );
  contrat.lignes = lignes;

  const { rows: machines } = await query(
    `SELECT numero_serie, modele, marque, designation, site_installation, actif,
            cout_copie_nb, cout_copie_couleur, volume_forfait_nb, volume_forfait_couleur
     FROM contrat_machines WHERE contrat_id = $1 ORDER BY id`,
    [contratId],
  );
  contrat.machines = machines;

  return contrat;
}

// ─── Template HTML ───────────────────────────────────────────────────────────

function generateContratHTML(contrat, societe, logoBase64) {
  const c = contrat;
  const s = societe || {};

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-height:110px;max-width:260px;object-fit:contain;">`
    : `<div style="font-size:18px;font-weight:700;color:#6B46C1;">${escapeHtml(s.raison_sociale) || 'OptimaCRM'}</div>`;

  const typeLabel = TYPE_LABELS[c.type_contrat] || c.type_contrat;
  const periodiciteLabel = PERIODICITE_LABELS[c.periodicite] || c.periodicite;
  const termeLabel = c.terme_facturation === 'TAE' ? 'Terme à échoir' : 'Terme échu';

  const montantHT = c.lignes.reduce((sum, l) => sum + parseFloat(l.total_ht || 0), 0);
  const ftc = parseFloat(c.ftc) || 0;
  const ect = parseFloat(c.ect) || 0;

  // Lignes du contrat
  const buildLignesHtml = () => {
    let html = '';
    c.lignes.forEach((l, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafafa';
      const remPct = parseFloat(l.remise_pourcentage) || 0;
      let remStr = '';
      if (remPct > 0) remStr = `<span style="color:#dc2626;font-weight:600;">-${remPct}%</span>`;

      html += `<tr style="background:${rowBg};">
        <td style="padding:8px 10px;font-size:9px;font-weight:600;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#4b5563;">${escapeHtml(l.reference) || ''}</td>
        <td style="padding:8px 10px;vertical-align:top;border-bottom:1px solid #f3f0ff;">
          <span style="font-weight:600;font-size:10px;color:#1a1a2e;">${escapeHtml(l.designation)}</span>
          ${l.categorie_ligne ? `<br><span style="font-size:8px;color:#6b7280;">${escapeHtml(l.categorie_ligne)}</span>` : ''}
        </td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${parseFloat(l.quantite).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 10px;text-align:right;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${formatMontant(l.prix_unitaire_ht)}</td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;">${remStr}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${formatMontant(l.total_ht)}</td>
      </tr>`;
    });
    return html;
  };

  // Machines rattachees
  const buildMachinesHtml = () => {
    if (!c.machines || c.machines.length === 0) return '';
    let html = `
    <div style="margin-top:6mm;">
      <div style="font-weight:700;font-size:9px;color:#6B46C1;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Machines rattachées</div>
      <table style="width:100%;border-collapse:collapse;font-size:9px;">
        <thead>
          <tr style="background:#f5f3ff;">
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">N° série</th>
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">Modèle</th>
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">Site</th>
            ${c.type_contrat === 'Copieur' ? `
            <th style="padding:5px 8px;text-align:right;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">Coût NB</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">Coût Coul.</th>
            ` : ''}
          </tr>
        </thead>
        <tbody>`;
    for (const m of c.machines) {
      const statut = m.actif === false ? ' (inactive)' : '';
      html += `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f0ff;color:#1a1a2e;font-weight:600;">${escapeHtml(m.numero_serie)}${statut}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f0ff;color:#4b5563;">${escapeHtml(m.modele || m.designation || '')}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f0ff;color:#4b5563;">${escapeHtml(m.site_installation) || '—'}</td>
        ${c.type_contrat === 'Copieur' ? `
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${m.cout_copie_nb ? formatMontant(m.cout_copie_nb, 4) : '—'}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${m.cout_copie_couleur ? formatMontant(m.cout_copie_couleur, 4) : '—'}</td>
        ` : ''}
      </tr>`;
    }
    html += `</tbody></table></div>`;
    return html;
  };

  // Footer société
  const societeFooterLine1 = [
    s.raison_sociale,
    s.adresse_ligne1,
    [s.code_postal, s.ville].filter(Boolean).join(' '),
  ].filter(Boolean).join(' _ ');

  const societeFooterLine2 = [
    s.telephone ? `Tél : ${s.telephone}` : '',
    s.email_contact,
    s.site_web,
  ].filter(Boolean).join(' _ ');

  let societeFooterLine3 = '';
  if (s.forme_juridique || s.capital_social || s.rcs_ville || s.siret) {
    const parts = [];
    if (s.forme_juridique) parts.push(s.forme_juridique);
    if (s.capital_social) parts.push(`au capital de ${formatMontant(s.capital_social)}`);
    if (s.siret) parts.push(`SIRET : ${s.siret}`);
    if (s.rcs_ville) parts.push(`RCS ${s.rcs_ville}`);
    if (s.tva_intracommunautaire) parts.push(`TVA : ${s.tva_intracommunautaire}`);
    societeFooterLine3 = parts.join(' — ');
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10px;
    color: #1a1a2e;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4; margin: 0; }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 12mm 14mm;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .content { flex: 1; }
  table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="page">
<div class="content">

  <!-- EN-TÊTE -->
  <table style="width:100%;margin-bottom:5mm;">
    <tr>
      <td style="width:50%;vertical-align:top;">
        ${logoHtml}
      </td>
      <td style="width:50%;vertical-align:top;text-align:right;">
        <div style="font-size:22px;font-weight:700;color:#6B46C1;letter-spacing:3px;margin-bottom:8px;text-transform:uppercase;">CONTRAT</div>
        <table style="margin-left:auto;font-size:10px;line-height:1.9;">
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">CONTRAT N°</td>
            <td style="font-weight:700;color:#6B46C1;white-space:nowrap;font-size:11px;">${escapeHtml(c.numero_contrat)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">TYPE</td>
            <td style="color:#1a1a2e;font-weight:600;">${escapeHtml(typeLabel)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">DATE DÉBUT</td>
            <td style="color:#1a1a2e;">${formatDate(c.date_debut)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">ÉCHÉANCE</td>
            <td style="color:#1a1a2e;">${formatDate(c.date_echeance)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">CODE CLIENT</td>
            <td style="color:#1a1a2e;">${escapeHtml(c.client_code) || '—'}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- BANDE VIOLETTE -->
  <div style="height:3px;background:linear-gradient(90deg,#6B46C1,#7C3AED,#A78BFA);margin:5mm 0 8mm 0;border-radius:2px;"></div>

  <!-- ADRESSES -->
  <table style="width:100%;margin-bottom:6mm;">
    <tr>
      <td style="width:48%;vertical-align:top;padding-right:4mm;">
        <div style="font-size:9px;font-weight:700;color:#6B46C1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ede9fe;">Émetteur</div>
        <div style="font-weight:600;font-size:11px;margin-bottom:2px;color:#1a1a2e;">${escapeHtml(s.raison_sociale) || ''}</div>
        <div style="color:#4b5563;font-size:10px;line-height:1.6;">
          ${escapeHtml(s.adresse_ligne1) || ''}${s.adresse_ligne1 ? '<br>' : ''}
          ${[s.code_postal, s.ville].filter(Boolean).map(escapeHtml).join(' ')}
        </div>
        ${s.telephone ? `<div style="color:#6b7280;font-size:9px;margin-top:3px;">Tél : ${escapeHtml(s.telephone)}</div>` : ''}
      </td>
      <td style="width:4%;"></td>
      <td style="width:48%;vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:#6B46C1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ede9fe;">Client</div>
        <div style="font-weight:600;font-size:12px;margin-bottom:2px;color:#1a1a2e;">${escapeHtml(c.client_raison_sociale) || ''}</div>
        <div style="color:#4b5563;font-size:10px;line-height:1.6;">
          ${escapeHtml(c.client_adresse) || ''}${c.client_adresse ? '<br>' : ''}
          ${[c.client_cp, c.client_ville].filter(Boolean).map(escapeHtml).join(' ')}
        </div>
        ${c.client_email ? `<div style="color:#6b7280;font-size:9px;margin-top:3px;">${escapeHtml(c.client_email)}</div>` : ''}
      </td>
    </tr>
  </table>

  <!-- BLOC DÉTAILS CONTRAT -->
  <div style="background:#f5f3ff;border-left:3px solid #6B46C1;padding:8px 12px;margin-bottom:6mm;border-radius:0 4px 4px 0;font-size:9px;color:#4b5563;line-height:1.8;">
    <strong style="color:#6B46C1;">Contrat ${escapeHtml(typeLabel)}</strong> — ${escapeHtml(c.type_facturation)}
    &nbsp;|&nbsp; Périodicité : <strong>${escapeHtml(periodiciteLabel)}</strong>
    &nbsp;|&nbsp; ${escapeHtml(termeLabel)}
    &nbsp;|&nbsp; Durée : <strong>${c.duree_contrat_mois || '—'} mois</strong>
    ${c.date_signature ? `<br>Date de signature : ${formatDate(c.date_signature)}` : ''}
    ${c.date_renouvellement ? `&nbsp;|&nbsp; Renouvellement : ${formatDate(c.date_renouvellement)}` : ''}
  </div>

  <!-- TABLEAU DES LIGNES -->
  ${c.lignes.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin-bottom:5mm;">
    <thead>
      <tr style="background:linear-gradient(135deg,#6B46C1,#7C3AED);">
        <th style="padding:8px 10px;text-align:left;color:#ffffff;font-size:9px;font-weight:600;width:8%;border-radius:4px 0 0 0;text-transform:uppercase;letter-spacing:0.3px;">Réf.</th>
        <th style="padding:8px 10px;text-align:left;color:#ffffff;font-size:9px;font-weight:600;width:48%;text-transform:uppercase;letter-spacing:0.3px;">Désignation</th>
        <th style="padding:8px 10px;text-align:center;color:#ffffff;font-size:9px;font-weight:600;width:10%;text-transform:uppercase;letter-spacing:0.3px;">Qté</th>
        <th style="padding:8px 10px;text-align:right;color:#ffffff;font-size:9px;font-weight:600;width:12%;text-transform:uppercase;letter-spacing:0.3px;">P.U HT</th>
        <th style="padding:8px 10px;text-align:center;color:#ffffff;font-size:9px;font-weight:600;width:7%;text-transform:uppercase;letter-spacing:0.3px;">Rem</th>
        <th style="padding:8px 10px;text-align:right;color:#ffffff;font-size:9px;font-weight:600;width:15%;border-radius:0 4px 0 0;text-transform:uppercase;letter-spacing:0.3px;">Total HT</th>
      </tr>
    </thead>
    <tbody>
      ${buildLignesHtml()}
    </tbody>
  </table>` : ''}

  <!-- TOTAUX -->
  <table style="width:100%;margin-bottom:4mm;">
    <tr>
      <td style="width:48%;vertical-align:top;padding-right:4mm;">
        <table style="font-size:9px;color:#4b5563;">
          ${ftc > 0 ? `<tr><td style="padding:2px 0;">FTC</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${formatMontant(ftc)}</td></tr>` : ''}
          ${ect > 0 ? `<tr><td style="padding:2px 0;">ECT</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${formatMontant(ect)}</td></tr>` : ''}
          ${c.loyer_ht ? `<tr><td style="padding:2px 0;">Loyer HT</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${formatMontant(c.loyer_ht)}</td></tr>` : ''}
        </table>
      </td>
      <td style="width:52%;vertical-align:top;">
        <table style="width:100%;font-size:10px;border-collapse:collapse;">
          <tr style="background:linear-gradient(135deg,#6B46C1,#7C3AED);">
            <td style="padding:9px 10px;font-weight:700;font-size:14px;color:#ffffff;border-radius:4px 0 0 4px;">TOTAL HT</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;font-size:14px;color:#ffffff;border-radius:0 4px 4px 0;">${formatMontant(montantHT)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- MACHINES -->
  ${buildMachinesHtml()}

</div><!-- .content -->

  <!-- PIED DE PAGE SOCIÉTÉ -->
  <div style="padding-top:6mm;margin-top:auto;">
    <div style="height:1px;background:linear-gradient(90deg,#6B46C1,#7C3AED,#A78BFA);margin-bottom:4mm;"></div>
    <div style="text-align:center;line-height:1.7;">
      <div style="font-weight:700;font-size:9px;color:#6B46C1;">${escapeHtml(societeFooterLine1)}</div>
      <div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine2)}</div>
      ${societeFooterLine3 ? `<div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine3)}</div>` : ''}
    </div>
  </div>

</div>
</body>
</html>`;
}

// ─── Génération PDF ──────────────────────────────────────────────────────────

export async function generateContratPdf(contratId) {
  const contrat = await getContratForPdf(contratId);
  if (!contrat) throw new Error('Contrat non trouvé');

  const societe = await getSocieteConfig();

  let logoBase64 = null;
  if (societe.logo_url) {
    logoBase64 = await fetchLogoAsBase64(societe.logo_url);
  }

  const html = generateContratHTML(contrat, societe, logoBase64);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    return { pdf: Buffer.from(pdfBuffer), html, contrat };
  } finally {
    if (browser) await browser.close();
  }
}
