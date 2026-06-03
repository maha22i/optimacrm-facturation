import { getDevisById } from './devis.service.js';
import { query } from '../../config/database.js';
import { bucket, isFirebaseReady } from '../../config/firebase.js';
import puppeteer from 'puppeteer';

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

/** Même logique que le front : import Excel sans insertion de devis_lignes */
function lignesPourPdf(devisData) {
  const lignes = devisData.lignes || [];
  if (lignes.length > 0) return lignes;

  const ht = parseFloat(devisData.montant_ht_apres_remise ?? devisData.montant_ht ?? 0);
  const ttc = parseFloat(devisData.montant_ttc ?? 0);
  if (ht <= 0 && ttc <= 0) return [];

  const parts = [devisData.type_produit, devisData.situation_affaire, devisData.objet]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const designation = parts.length
    ? parts.join(' — ')
    : 'Montant (import Excel — aucune ligne de détail enregistrée)';

  const extras = [devisData.ordre_service, devisData.provenance]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const description_detaillee = extras.length ? extras.join('\n') : null;

  const tva = parseFloat(devisData.montant_tva ?? 0);
  let taux = 20;
  if (ht > 0 && tva >= 0) {
    const implied = (tva / ht) * 100;
    const allowed = [0, 5.5, 10, 20];
    taux = allowed.reduce((best, t) => (Math.abs(t - implied) < Math.abs(best - implied) ? t : best), 20);
  }

  return [{
    type: 'PRODUIT',
    ordre: 0,
    reference: null,
    designation,
    description_detaillee,
    unite: 'unité',
    quantite: 1,
    prix_unitaire_ht: ht,
    remise_ligne_type: 'POURCENTAGE',
    remise_ligne_valeur: 0,
    taux_tva: taux,
    montant_ht: ht,
    montant_tva: parseFloat(devisData.montant_tva ?? 0),
    montant_ttc: ttc,
    est_optionnel: false,
    catalogue_id: null,
  }];
}

function generateDevisHTML(devisData, lignes, societe, logoBase64) {
  const d = devisData;
  const s = societe || {};
  const client = d.client || {};

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-height:110px;max-width:260px;object-fit:contain;">`
    : `<div style="font-size:18px;font-weight:700;color:#6B46C1;">${escapeHtml(s.raison_sociale) || 'OptimaCRM'}</div>`;

  const dateValidite = d.date_validite || (() => {
    const dt = new Date(d.date_creation || Date.now());
    dt.setDate(dt.getDate() + 30);
    return dt.toISOString().split('T')[0];
  })();

  const buildLignesHtml = () => {
    let html = '';
    const sortedLignes = [...lignes].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    sortedLignes.forEach((l, idx) => {
      if (l.type === 'SAUT_DE_LIGNE') {
        html += `<tr><td colspan="6" style="padding:4px 0;border:none;"></td></tr>`;
        return;
      }
      if (l.type === 'COMMENTAIRE') {
        html += `<tr><td colspan="6" style="padding:8px 12px;background:#f9f7ff;font-style:italic;color:#6b7280;font-size:9px;border-bottom:1px solid #f3f0ff;">${escapeHtml(l.designation)}</td></tr>`;
        return;
      }
      if (l.type === 'SOUS_TOTAL') {
        html += `<tr style="background:#f9f7ff;">
          <td colspan="5" style="padding:8px 12px;font-weight:600;text-align:right;font-size:10px;color:#1a1a2e;border-bottom:1px solid #ede9fe;">Sous-total</td>
          <td style="padding:8px 12px;font-weight:600;text-align:right;font-size:10px;color:#1a1a2e;border-bottom:1px solid #ede9fe;">${formatMontant(l.montant_ht)}</td>
        </tr>`;
        return;
      }

      const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafafa';
      let designation = `<span style="font-weight:600;font-size:10px;color:#1a1a2e;">${escapeHtml(l.designation)}</span>`;
      if (l.description_detaillee) {
        const desc = escapeHtml(l.description_detaillee).replace(/\n/g, '<br>');
        designation += `<br><span style="font-size:9px;color:#6b7280;font-style:italic;">${desc}</span>`;
      }
      if (l.est_optionnel) {
        designation += `<br><span style="font-size:8px;color:#9ca3af;font-style:italic;">(Option)</span>`;
      }

      const remPct = parseFloat(l.remise_ligne_valeur) || 0;
      let remStr = '';
      if (remPct > 0) {
        remStr = l.remise_ligne_type === 'POURCENTAGE'
          ? `<span style="color:#dc2626;font-weight:600;">-${remPct}%</span>`
          : `<span style="color:#dc2626;font-weight:600;">-${formatMontant(remPct)}</span>`;
      }

      html += `<tr style="background:${rowBg};">
        <td style="padding:8px 10px;font-size:9px;font-weight:600;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#4b5563;">${escapeHtml(l.reference) || ''}</td>
        <td style="padding:8px 10px;vertical-align:top;border-bottom:1px solid #f3f0ff;">${designation}</td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${formatQte(l.quantite)}${l.unite ? ' ' + escapeHtml(l.unite) : ''}</td>
        <td style="padding:8px 10px;text-align:right;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${formatPU(l.prix_unitaire_ht)}</td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;">${remStr}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;font-size:10px;vertical-align:top;border-bottom:1px solid #f3f0ff;color:#1a1a2e;">${formatMontant(l.montant_ht)}</td>
      </tr>`;
    });
    return html;
  };

  const adrFact = d.adresse_facturation;
  const clientName = client.raison_sociale || d.nom_client_libre || '';

  const clientAdresseHtml = adrFact
    ? `${escapeHtml(adrFact.ligne1 || '')}${adrFact.ligne2 ? '<br>' + escapeHtml(adrFact.ligne2) : ''}<br>${escapeHtml([adrFact.code_postal, adrFact.ville].filter(Boolean).join(' '))}`
    : '';

  const mentionsDevis = s.mentions_devis ||
    'Devis valable 30 jours à compter de sa date d\'émission.';

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

  const conditionsPaiementLabel = {
    COMPTANT: 'Comptant', '15_JOURS': '15 jours', '30_JOURS': '30 jours',
    '45_JOURS_FIN_MOIS': '45 jours fin de mois', '60_JOURS': '60 jours',
  }[d.conditions_paiement] || d.conditions_paiement || '';

  const modePaiementLabel = {
    VIREMENT: 'Virement bancaire', PRELEVEMENT_SEPA: 'Prélèvement SEPA',
    CHEQUE: 'Chèque', CARTE: 'Carte bancaire', ESPECES: 'Espèces',
  }[d.mode_paiement] || d.mode_paiement || '';

  const tvaRate = 20;

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
        <div style="font-size:22px;font-weight:700;color:#6B46C1;letter-spacing:3px;margin-bottom:8px;text-transform:uppercase;">DEVIS</div>
        <table style="margin-left:auto;font-size:10px;line-height:1.9;">
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;white-space:nowrap;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">DEVIS N°</td>
            <td style="font-weight:700;color:#6B46C1;white-space:nowrap;font-size:11px;">${escapeHtml(d.numero_devis)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">DATE</td>
            <td style="color:#1a1a2e;">${formatDate(d.date_emission || d.date_creation)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">VALIDITÉ</td>
            <td style="color:#1a1a2e;">${formatDate(dateValidite)}</td>
          </tr>
          ${client.numero_client ? `<tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">CODE CLIENT</td>
            <td style="color:#1a1a2e;">${escapeHtml(client.numero_client)}</td>
          </tr>` : ''}
          ${d.commercial || d.commercial_id ? `<tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">COMMERCIAL</td>
            <td style="color:#1a1a2e;">${escapeHtml(d.commercial || '')}</td>
          </tr>` : ''}
          ${d.reference_client ? `<tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">RÉF. CLIENT</td>
            <td style="color:#1a1a2e;">${escapeHtml(d.reference_client)}</td>
          </tr>` : ''}
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
        <div style="font-size:9px;font-weight:700;color:#6B46C1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ede9fe;">Adresse du client</div>
        <div style="font-weight:600;font-size:11px;margin-bottom:2px;color:#1a1a2e;">${escapeHtml(clientName)}</div>
        <div style="color:#4b5563;font-size:10px;line-height:1.6;">
          ${clientAdresseHtml}
        </div>
        ${client.email_principal ? `<div style="color:#6b7280;font-size:9px;margin-top:3px;">${escapeHtml(client.email_principal)}</div>` : ''}
      </td>
      <td style="width:4%;"></td>
      <td style="width:48%;vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:#6B46C1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ede9fe;">Adresse de facturation</div>
        <div style="font-weight:600;font-size:12px;margin-bottom:2px;color:#1a1a2e;">${escapeHtml(clientName)}</div>
        <div style="color:#4b5563;font-size:10px;line-height:1.6;">
          ${clientAdresseHtml}
        </div>
        ${client.tva_intracommunautaire ? `<div style="color:#6b7280;font-size:9px;margin-top:3px;">TVA N° ${escapeHtml(client.tva_intracommunautaire)}</div>` : ''}
      </td>
    </tr>
  </table>

  <!-- OBJET -->
  ${d.objet ? `<div style="background:#f5f3ff;border-left:3px solid #6B46C1;padding:6px 10px;margin-bottom:6mm;font-size:10px;color:#6B46C1;border-radius:0 4px 4px 0;">
    <strong>Objet :</strong> ${escapeHtml(d.objet)}
  </div>` : ''}

  <!-- TABLEAU DES LIGNES -->
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

  <!-- TOTAUX -->
  <table style="width:100%;margin-bottom:4mm;">
    <tr>
      <td style="width:48%;vertical-align:top;padding-right:4mm;">
        <table style="font-size:9px;color:#4b5563;margin-bottom:4mm;">
          <tr><td style="padding:2px 0;">Taux TVA</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${tvaRate}%</td></tr>
          ${conditionsPaiementLabel ? `<tr><td style="padding:2px 0;">Paiement</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${escapeHtml(conditionsPaiementLabel)}</td></tr>` : ''}
          ${modePaiementLabel ? `<tr><td style="padding:2px 0;">Mode</td><td style="padding:2px 0 2px 10px;font-weight:600;color:#1a1a2e;">${escapeHtml(modePaiementLabel)}</td></tr>` : ''}
        </table>
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
        <table style="width:100%;font-size:10px;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 10px;color:#6b7280;">Hors Taxe</td>
            <td style="padding:6px 10px;text-align:right;font-weight:600;color:#1a1a2e;">${formatMontant(d.montant_ht)}</td>
          </tr>
          ${parseFloat(d.montant_remise) > 0 ? `<tr>
            <td style="padding:6px 10px;color:#dc2626;">Remise${d.remise_globale_type === 'POURCENTAGE' ? ` (${d.remise_globale_valeur}%)` : ''}</td>
            <td style="padding:6px 10px;text-align:right;color:#dc2626;">-${formatMontant(d.montant_remise)}</td>
          </tr>` : ''}
          <tr style="background:#f9fafb;">
            <td style="padding:6px 10px;color:#6b7280;">TVA ${tvaRate}%</td>
            <td style="padding:6px 10px;text-align:right;color:#1a1a2e;">${formatMontant(d.montant_tva)}</td>
          </tr>
          <tr style="background:#ede9fe;">
            <td style="padding:7px 10px;font-weight:700;font-size:12px;color:#6B46C1;">TTC</td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:12px;color:#6B46C1;">${formatMontant(d.montant_ttc)}</td>
          </tr>
          <tr style="background:linear-gradient(135deg,#6B46C1,#7C3AED);">
            <td style="padding:9px 10px;font-weight:700;font-size:14px;color:#ffffff;border-radius:0 0 0 4px;">NET À PAYER</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;font-size:14px;color:#ffffff;border-radius:0 0 4px 0;">${formatMontant(d.montant_ttc)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- MESSAGE CLIENT -->
  ${d.message_client ? `<div style="margin-top:4mm;padding:6px 10px;background:#f5f3ff;border-left:3px solid #6B46C1;font-size:9px;color:#4b5563;border-radius:0 4px 4px 0;">${escapeHtml(d.message_client)}</div>` : ''}

</div>

  <!-- PIED DE PAGE SOCIÉTÉ -->
  <div style="padding-top:6mm;margin-top:auto;">
    <div style="height:1px;background:linear-gradient(90deg,#6B46C1,#7C3AED,#A78BFA);margin-bottom:4mm;"></div>
    <div style="text-align:center;line-height:1.7;">
      <div style="font-weight:700;font-size:9px;color:#6B46C1;">${escapeHtml(societeFooterLine1)}</div>
      <div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine2)}</div>
      ${societeFooterLine3 ? `<div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine3)}</div>` : ''}
    </div>
  </div>

  <!-- MENTIONS LÉGALES -->
  <div style="margin-top:5mm;font-size:7.5px;color:#9ca3af;font-style:italic;line-height:1.5;">
    ${escapeHtml(mentionsDevis).replace(/\n/g, '<br>')}
  </div>

</div>
</body>
</html>`;
}

export { generateDevisHTML as generateDevisPdfHtml };

export async function generateDevisPdf(devisId) {
  const devisData = await getDevisById(devisId);
  const societe = await getSocieteConfig();

  let logoBase64 = null;
  if (societe.logo_url) {
    logoBase64 = await fetchLogoAsBase64(societe.logo_url);
  }

  const html = generateDevisHTML(
    devisData,
    lignesPourPdf(devisData),
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
    return { pdf: Buffer.from(pdfBuffer), html, devis: devisData };
  } finally {
    if (browser) await browser.close();
  }
}
