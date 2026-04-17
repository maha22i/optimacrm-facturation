import { getFactureById } from './facture.service.js';
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

function formatQte(val) {
  if (!val) return '';
  const n = parseFloat(val);
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPU(val) {
  if (!val) return '';
  const n = parseFloat(val);
  const dec = n < 1 && n > 0 ? 4 : 2;
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
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

// ─── Données ─────────────────────────────────────────────────────────────────

async function getSocieteConfig() {
  const { rows } = await query('SELECT * FROM societe_config WHERE id = 1');
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

// ─── Template HTML — Facture professionnelle Groupe Innov ────────────────────

function generateFactureHTML(facture, lignes, reglements, societe, logoBase64) {
  const f = facture;
  const s = societe || {};
  const titre = f.est_avoir ? 'AVOIR' : 'FACTURE';

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-height:110px;max-width:260px;object-fit:contain;">`
    : `<div style="font-size:18px;font-weight:700;color:#6B46C1;">${escapeHtml(s.raison_sociale) || 'OptimaCRM'}</div>`;

  // ── BLOC 5 — Lignes du tableau ──

  const buildLignesHtml = () => {
    let html = '';
    lignes.forEach((l, idx) => {
      if (l.type_ligne === 'SAUT_DE_LIGNE') {
        html += `<tr><td colspan="6" style="padding:4px 0;border:none;"></td></tr>`;
        return;
      }
      if (l.type_ligne === 'COMMENTAIRE') {
        html += `<tr><td colspan="6" style="padding:8px 12px;background:#f9f7ff;font-style:italic;color:#6b7280;font-size:9px;border-bottom:1px solid #f3f0ff;">${escapeHtml(l.designation)}</td></tr>`;
        return;
      }
      if (l.type_ligne === 'SOUS_TOTAL') {
        html += `<tr style="background:#f9f7ff;">
          <td colspan="5" style="padding:8px 12px;font-weight:600;text-align:right;font-size:10px;color:#1a1a2e;border-bottom:1px solid #ede9fe;">Sous-total</td>
          <td style="padding:8px 12px;font-weight:600;text-align:right;font-size:10px;color:#1a1a2e;border-bottom:1px solid #ede9fe;">${formatMontant(l.total_ht)}</td>
        </tr>`;
        return;
      }

      const isRegul = l.type_ligne?.startsWith('REGULARISATION');
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafafa';

      let designation = `<span style="font-weight:600;font-size:10px;color:#1a1a2e;">${escapeHtml(l.designation)}</span>`;
      if (l.description) {
        const desc = escapeHtml(l.description).replace(/\n/g, '<br>');
        designation += `<br><span style="font-size:9px;color:#6b7280;font-style:italic;">${desc}</span>`;
      }

      const remPct = parseFloat(l.remise_pourcentage) || 0;
      const remMont = parseFloat(l.remise_montant) || 0;
      let remStr = '';
      if (remPct > 0) remStr = `<span style="color:#dc2626;font-weight:600;">-${remPct}%</span>`;
      else if (remMont > 0) remStr = `<span style="color:#dc2626;font-weight:600;">-${formatMontant(remMont)}</span>`;

      html += `<tr style="background:${rowBg};">
        <td style="padding:8px 10px;font-size:9px;font-weight:600;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#4b5563;">${escapeHtml(l.reference) || ''}</td>
        <td style="padding:8px 10px;vertical-align:top;border-bottom:1px solid #f3f0ff;">${designation}</td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${isRegul ? '' : formatQte(l.quantite)}</td>
        <td style="padding:8px 10px;text-align:right;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${isRegul ? '' : formatPU(l.prix_unitaire)}</td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;">${remStr}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${formatMontant(l.total_ht)}</td>
      </tr>`;
    });
    return html;
  };

  // ── BLOC 7 — Règlements ──

  const buildReglementsHtml = () => {
    if (!reglements || reglements.length === 0) return '';
    const totalRegle = reglements.reduce((sum, r) => sum + parseFloat(r.montant || 0), 0);
    let html = `
    <div style="margin-top:8mm;">
      <div style="font-weight:700;font-size:9px;color:#6B46C1;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Détail des règlements</div>
      <table style="width:100%;border-collapse:collapse;font-size:9px;">
        <thead>
          <tr style="background:#f5f3ff;">
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">Date</th>
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">Mode</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600;color:#6B46C1;border-bottom:1px solid #ede9fe;">Montant</th>
          </tr>
        </thead>
        <tbody>`;
    for (const r of reglements) {
      html += `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f0ff;color:#4b5563;">${formatDate(r.date_reglement)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f0ff;color:#4b5563;">${escapeHtml(r.mode_reglement)}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f3f0ff;font-weight:600;color:#1a1a2e;">${formatMontant(r.montant)}</td>
      </tr>`;
    }
    html += `</tbody></table>
      <div style="text-align:right;font-size:9px;margin-top:4px;font-weight:600;color:#1a1a2e;">Total règlement versé : ${formatMontant(totalRegle)}</div>
    </div>`;
    return html;
  };

  // ── BLOC 4 — Info contrat ──

  const contratInfoHtml = (f.type_origine === 'Contrat' && f.numero_contrat)
    ? `<div style="background:#f5f3ff;border-left:3px solid #6B46C1;padding:6px 10px;margin-bottom:6mm;font-size:9px;color:#6B46C1;border-radius:0 4px 4px 0;">
        Concerne votre contrat n° : <strong>${escapeHtml(f.numero_contrat)}</strong>
        ${f.type_contrat ? `<br>Type : ${escapeHtml(f.type_contrat)}` : ''}
        ${f.numero_serie ? `<br>Matricule machine : ${escapeHtml(f.numero_serie)}` : ''}
        ${f.modele_machine ? `<br>Modèle : ${escapeHtml(f.modele_machine)}` : ''}
      </div>`
    : '';

  // ── BLOC 9 — Mentions légales ──

  const mentionsLegales = s.mentions_legales ||
    `RÉSERVE DE PROPRIÉTÉ :\nDe convention expresse, les marchandises fournies resteront notre propriété jusqu'au paiement effectif de l'intégralité du prix en principal et accessoire.\nLoi n°80.335 du 12 Mai 1980 JO des 12 et 13 Mai 1980.\nPour chaque facture impayée, une majoration de 40€ s'appliquera de plein droit en vertu du décret 2012.`;

  // ── BLOC 8 — Footer société ──

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

  <!-- ═══ BLOC 1 — EN-TÊTE ═══ -->
  <table style="width:100%;margin-bottom:5mm;">
    <tr>
      <td style="width:50%;vertical-align:top;">
        ${logoHtml}
      </td>
      <td style="width:50%;vertical-align:top;text-align:right;">
        <div style="font-size:22px;font-weight:700;color:#6B46C1;letter-spacing:3px;margin-bottom:8px;text-transform:uppercase;">${titre}</div>
        <table style="margin-left:auto;font-size:10px;line-height:1.9;">
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;white-space:nowrap;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">FACTURE N°</td>
            <td style="font-weight:700;color:#6B46C1;white-space:nowrap;font-size:11px;">${escapeHtml(f.numero_facture)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">DATE</td>
            <td style="color:#1a1a2e;">${formatDate(f.date_creation)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">ÉCHÉANCE</td>
            <td style="color:#1a1a2e;">${formatDate(f.date_echeance)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">CODE CLIENT</td>
            <td style="color:#1a1a2e;">${escapeHtml(f.code_client) || '—'}</td>
          </tr>
          ${f.numero_contrat ? `<tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">N° CONTRAT</td>
            <td style="color:#1a1a2e;">${escapeHtml(f.numero_contrat)}</td>
          </tr>` : ''}
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">MODE RÈGLEMENT</td>
            <td style="color:#1a1a2e;">${escapeHtml(f.mode_reglement) || '—'}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ═══ BLOC 2 — BANDE VIOLETTE ═══ -->
  <div style="height:3px;background:linear-gradient(90deg,#6B46C1,#7C3AED,#A78BFA);margin:5mm 0 8mm 0;border-radius:2px;"></div>

  <!-- ═══ BLOC 3 — ADRESSES ═══ -->
  <table style="width:100%;margin-bottom:6mm;">
    <tr>
      <td style="width:48%;vertical-align:top;padding-right:4mm;">
        <div style="font-size:9px;font-weight:700;color:#6B46C1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ede9fe;">Site concerné</div>
        <div style="font-weight:600;font-size:11px;margin-bottom:2px;color:#1a1a2e;">${escapeHtml(f.site_concerne_nom) || escapeHtml(f.client_raison_sociale) || ''}</div>
        <div style="color:#4b5563;font-size:10px;line-height:1.6;">
          ${escapeHtml(f.site_concerne_adresse) || ''}${(f.site_concerne_adresse) ? '<br>' : ''}
          ${[f.site_concerne_cp, f.site_concerne_ville].filter(Boolean).map(escapeHtml).join(' ')}
        </div>
        ${f.site_concerne_email ? `<div style="color:#6b7280;font-size:9px;margin-top:3px;">${escapeHtml(f.site_concerne_email)}</div>` : ''}
      </td>
      <td style="width:4%;"></td>
      <td style="width:48%;vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:#6B46C1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ede9fe;">Adresse de facturation</div>
        <div style="font-weight:600;font-size:12px;margin-bottom:2px;color:#1a1a2e;">${escapeHtml(f.client_raison_sociale) || ''}</div>
        <div style="color:#4b5563;font-size:10px;line-height:1.6;">
          ${escapeHtml(f.client_adresse) || ''}${(f.client_adresse) ? '<br>' : ''}
          ${[f.client_cp, f.client_ville].filter(Boolean).map(escapeHtml).join(' ')}
        </div>
        ${f.client_tva_numero ? `<div style="color:#6b7280;font-size:9px;margin-top:3px;">TVA N° ${escapeHtml(f.client_tva_numero)}</div>` : ''}
      </td>
    </tr>
  </table>

  <!-- ═══ BLOC 4 — INFO CONTRAT ═══ -->
  ${contratInfoHtml}

  <!-- ═══ BLOC 5 — TABLEAU DES LIGNES ═══ -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:5mm;">
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
  </table>

  <!-- ═══ BLOC 6 — PIED DE TABLEAU (Totaux + Domiciliation) ═══ -->
  <table style="width:100%;margin-bottom:4mm;">
    <tr>
      <td style="width:48%;vertical-align:top;padding-right:4mm;">
        <!-- FTC / ECT / TVA -->
        <table style="font-size:9px;color:#4b5563;margin-bottom:4mm;">
          ${parseFloat(f.frais_techniques) > 0 ? `<tr><td style="padding:2px 0;">FTC</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${formatMontant(f.frais_techniques)}</td></tr>` : ''}
          ${parseFloat(f.eco_contribution) > 0 ? `<tr><td style="padding:2px 0;">ECT</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${formatMontant(f.eco_contribution)}</td></tr>` : ''}
          <tr><td style="padding:2px 0;">Taux TVA</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${f.taux_tva || 20}%</td></tr>
        </table>
        <!-- Domiciliation bancaire -->
        ${(s.iban || s.bic) ? `
        <div style="border-top:1px solid #e5e7eb;padding-top:4mm;">
          <div style="font-weight:700;font-size:9px;color:#6B46C1;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.3px;">Notre domiciliation :</div>
          <div style="font-size:9px;color:#4b5563;line-height:1.7;">
            ${s.banque_nom ? `<span style="font-weight:600;color:#1a1a2e;">${escapeHtml(s.banque_nom)}</span><br>` : ''}
            ${s.iban ? `IBAN : <span style="font-weight:600;letter-spacing:0.5px;">${escapeHtml(s.iban)}</span>` : ''}
            ${s.bic ? `<br>BIC : <span style="font-weight:600;letter-spacing:0.5px;">${escapeHtml(s.bic)}</span>` : ''}
          </div>
        </div>` : ''}
      </td>
      <td style="width:52%;vertical-align:top;">
        <!-- Tableau des totaux -->
        <table style="width:100%;font-size:10px;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 10px;color:#6b7280;">Hors Taxe</td>
            <td style="padding:6px 10px;text-align:right;font-weight:600;color:#1a1a2e;">${formatMontant(f.total_ht)}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="padding:6px 10px;color:#6b7280;">TVA ${f.taux_tva || 20}%</td>
            <td style="padding:6px 10px;text-align:right;color:#1a1a2e;">${formatMontant(f.montant_tva)}</td>
          </tr>
          <tr style="background:#ede9fe;">
            <td style="padding:7px 10px;font-weight:700;font-size:12px;color:#6B46C1;">TTC</td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:12px;color:#6B46C1;">${formatMontant(f.total_ttc)}</td>
          </tr>
          <tr style="background:linear-gradient(135deg,#6B46C1,#7C3AED);">
            <td style="padding:9px 10px;font-weight:700;font-size:14px;color:#ffffff;border-radius:0 0 0 4px;">TOTAL TTC</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;font-size:14px;color:#ffffff;border-radius:0 0 4px 0;">${formatMontant(f.total_ttc)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ═══ BLOC 7 — DÉTAIL DES RÈGLEMENTS ═══ -->
  ${buildReglementsHtml()}

</div><!-- .content -->

  <!-- ═══ BLOC 8 — BANDEAU PIED DE PAGE SOCIÉTÉ ═══ -->
  <div style="padding-top:6mm;margin-top:auto;">
    <div style="height:1px;background:linear-gradient(90deg,#6B46C1,#7C3AED,#A78BFA);margin-bottom:4mm;"></div>
    <div style="text-align:center;line-height:1.7;">
      <div style="font-weight:700;font-size:9px;color:#6B46C1;">${escapeHtml(societeFooterLine1)}</div>
      <div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine2)}</div>
      ${societeFooterLine3 ? `<div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine3)}</div>` : ''}
    </div>
  </div>

  <!-- ═══ BLOC 9 — MENTIONS LÉGALES ═══ -->
  <div style="margin-top:5mm;font-size:7.5px;color:#9ca3af;font-style:italic;line-height:1.5;">
    ${escapeHtml(mentionsLegales).replace(/\n/g, '<br>')}
  </div>

</div>
</body>
</html>`;
}

// ─── Génération PDF ──────────────────────────────────────────────────────────

export async function generateFacturePdf(factureId) {
  const factureData = await getFactureById(factureId);
  const societe = await getSocieteConfig();

  let logoBase64 = null;
  if (societe.logo_url) {
    logoBase64 = await fetchLogoAsBase64(societe.logo_url);
  }

  const html = generateFactureHTML(
    factureData,
    factureData.lignes || [],
    factureData.reglements || [],
    societe,
    logoBase64,
  );

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
    return { pdf: Buffer.from(pdfBuffer), html, facture: factureData };
  } finally {
    if (browser) await browser.close();
  }
}
