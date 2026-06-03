import { query } from '../../config/database.js';
import { getAvoirById } from './avoir.service.js';
import puppeteer from 'puppeteer';

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function getSocieteConfig() {
  const { rows } = await query('SELECT * FROM societe_config WHERE id = 1');
  return rows[0] || {};
}

async function fetchLogoAsBase64(logoUrl) {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = logoUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'png';
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
    return `data:${mimeMap[ext] || 'image/png'};base64,${buffer.toString('base64')}`;
  } catch { return null; }
}

function generateAvoirHTML(avoir, lignes, societe, logoBase64) {
  const s = societe || {};

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-height:110px;max-width:260px;object-fit:contain;">`
    : `<div style="font-size:18px;font-weight:700;color:#6B46C1;">${escapeHtml(s.raison_sociale) || 'OptimaCRM'}</div>`;

  const buildLignesHtml = () => {
    let html = '';
    lignes.forEach((l, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafafa';
      const ht = parseFloat(l.montant_ht) || 0;
      html += `<tr style="background:${rowBg};">
        <td style="padding:8px 10px;vertical-align:top;border-bottom:1px solid #fce4ec;">
          <span style="font-weight:600;font-size:10px;color:#1a1a2e;">${escapeHtml(l.designation)}</span>
        </td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #fce4ec;color:#1a1a2e;">
          ${parseFloat(l.quantite).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="padding:8px 10px;text-align:right;font-size:10px;vertical-align:top;border-bottom:1px solid #fce4ec;color:#1a1a2e;">
          ${formatMontant(l.prix_unitaire_ht)}
        </td>
        <td style="padding:8px 10px;text-align:center;font-size:10px;vertical-align:top;border-bottom:1px solid #fce4ec;color:#1a1a2e;">
          ${l.taux_tva}%
        </td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;font-size:10px;vertical-align:top;border-bottom:1px solid #fce4ec;color:#c62828;">
          -${formatMontant(ht)}
        </td>
      </tr>`;
    });
    return html;
  };

  const societeFooterLine1 = [s.raison_sociale, s.adresse_ligne1, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(' _ ');
  const societeFooterLine2 = [s.telephone ? `Tél : ${s.telephone}` : '', s.email_contact, s.site_web].filter(Boolean).join(' _ ');

  let societeFooterLine3 = '';
  if (s.forme_juridique || s.capital_social || s.siret) {
    const parts = [];
    if (s.forme_juridique) parts.push(s.forme_juridique);
    if (s.capital_social) parts.push(`au capital de ${formatMontant(s.capital_social)}`);
    if (s.siret) parts.push(`SIRET : ${s.siret}`);
    if (s.rcs_ville) parts.push(`RCS ${s.rcs_ville}`);
    if (s.tva_intracommunautaire) parts.push(`TVA : ${s.tva_intracommunautaire}`);
    societeFooterLine3 = parts.join(' — ');
  }

  const mentionsLegales = s.mentions_legales ||
    `RÉSERVE DE PROPRIÉTÉ :\nDe convention expresse, les marchandises fournies resteront notre propriété jusqu'au paiement effectif de l'intégralité du prix en principal et accessoire.`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1a1a2e; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 12mm 14mm; position: relative; display: flex; flex-direction: column; }
  .content { flex: 1; }
</style>
</head>
<body>
<div class="page">
<div class="content">

  <table style="width:100%;margin-bottom:5mm;">
    <tr>
      <td style="width:50%;vertical-align:top;">${logoHtml}</td>
      <td style="width:50%;vertical-align:top;text-align:right;">
        <div style="font-size:22px;font-weight:700;color:#c62828;letter-spacing:3px;margin-bottom:8px;text-transform:uppercase;">AVOIR</div>
        <table style="margin-left:auto;font-size:10px;line-height:1.9;">
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">AVOIR N°</td>
            <td style="font-weight:700;color:#c62828;font-size:11px;">${escapeHtml(avoir.numero)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">DATE</td>
            <td style="color:#1a1a2e;">${formatDate(avoir.date_avoir)}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#6b7280;padding-right:10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">TYPE</td>
            <td style="color:#1a1a2e;">${avoir.type_avoir === 'TOTAL' ? 'Avoir total' : 'Avoir partiel'}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <div style="height:3px;background:linear-gradient(90deg,#c62828,#e53935,#ef9a9a);margin:5mm 0 8mm 0;border-radius:2px;"></div>

  <div style="background:#ffebee;border-left:3px solid #c62828;padding:8px 12px;margin-bottom:6mm;font-size:10px;color:#c62828;border-radius:0 4px 4px 0;">
    <strong>Avoir sur facture n° ${escapeHtml(avoir.numero_facture || '')}</strong> du ${formatDate(avoir.facture_date_creation)}
    ${avoir.motif ? `<br><span style="font-style:italic;color:#b71c1c;">Motif : ${escapeHtml(avoir.motif)}</span>` : ''}
  </div>

  <table style="width:100%;margin-bottom:6mm;">
    <tr>
      <td style="width:48%;vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:#c62828;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ffcdd2;">Client</div>
        <div style="font-weight:600;font-size:12px;margin-bottom:2px;color:#1a1a2e;">${escapeHtml(avoir.facture_client_raison_sociale || avoir.client_nom || '')}</div>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:5mm;">
    <thead>
      <tr style="background:linear-gradient(135deg,#c62828,#e53935);">
        <th style="padding:8px 10px;text-align:left;color:#ffffff;font-size:9px;font-weight:600;width:48%;text-transform:uppercase;">Désignation</th>
        <th style="padding:8px 10px;text-align:center;color:#ffffff;font-size:9px;font-weight:600;width:10%;text-transform:uppercase;">Qté</th>
        <th style="padding:8px 10px;text-align:right;color:#ffffff;font-size:9px;font-weight:600;width:15%;text-transform:uppercase;">P.U HT</th>
        <th style="padding:8px 10px;text-align:center;color:#ffffff;font-size:9px;font-weight:600;width:10%;text-transform:uppercase;">TVA</th>
        <th style="padding:8px 10px;text-align:right;color:#ffffff;font-size:9px;font-weight:600;width:17%;border-radius:0 4px 0 0;text-transform:uppercase;">Crédit HT</th>
      </tr>
    </thead>
    <tbody>${buildLignesHtml()}</tbody>
  </table>

  <table style="width:100%;margin-bottom:4mm;">
    <tr>
      <td style="width:48%;"></td>
      <td style="width:52%;vertical-align:top;">
        <table style="width:100%;font-size:10px;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 10px;color:#6b7280;">Total HT (crédit)</td>
            <td style="padding:6px 10px;text-align:right;font-weight:600;color:#c62828;">-${formatMontant(avoir.montant_ht)}</td>
          </tr>
          <tr style="background:#fff3f3;">
            <td style="padding:6px 10px;color:#6b7280;">TVA</td>
            <td style="padding:6px 10px;text-align:right;color:#c62828;">-${formatMontant(avoir.montant_tva)}</td>
          </tr>
          <tr style="background:linear-gradient(135deg,#c62828,#e53935);">
            <td style="padding:9px 10px;font-weight:700;font-size:14px;color:#ffffff;border-radius:0 0 0 4px;">TOTAL AVOIR TTC</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;font-size:14px;color:#ffffff;border-radius:0 0 4px 0;">-${formatMontant(avoir.montant_ttc)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

</div>

  <div style="padding-top:6mm;margin-top:auto;">
    <div style="height:1px;background:linear-gradient(90deg,#c62828,#e53935,#ef9a9a);margin-bottom:4mm;"></div>
    <div style="text-align:center;line-height:1.7;">
      <div style="font-weight:700;font-size:9px;color:#c62828;">${escapeHtml(societeFooterLine1)}</div>
      <div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine2)}</div>
      ${societeFooterLine3 ? `<div style="font-size:8px;color:#6b7280;">${escapeHtml(societeFooterLine3)}</div>` : ''}
    </div>
  </div>

  <div style="margin-top:5mm;font-size:7.5px;color:#9ca3af;font-style:italic;line-height:1.5;">
    ${escapeHtml(mentionsLegales).replace(/\n/g, '<br>')}
  </div>

</div>
</body>
</html>`;
}

export async function generateAvoirPdf(avoirId) {
  const avoirData = await getAvoirById(avoirId);
  const societe = await getSocieteConfig();

  let logoBase64 = null;
  if (societe.logo_url) {
    logoBase64 = await fetchLogoAsBase64(societe.logo_url);
  }

  const html = generateAvoirHTML(avoirData, avoirData.lignes || [], societe, logoBase64);

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
    return { pdf: Buffer.from(pdfBuffer), html, avoir: avoirData };
  } finally {
    if (browser) await browser.close();
  }
}
