import { getDevisById } from './devis.service.js';

const CGV_DEFAULT = `En l'absence de paiement à l'échéance, des pénalités de retard au taux de 3 fois le taux légal seront appliquées, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40€ (D. 441-5 du Code de Commerce).`;

const SOCIETE = {
  nom: 'Groupe Innov',
  adresse: '14 place Georges Pompidou',
  cp: '93160',
  ville: 'Noisy le Grand',
  tel: '01 86 52 78 70',
  email: 'contact@groupe-innov.fr',
  siret: '',
  tva: '',
};

const CONDITIONS_LABELS = {
  COMPTANT: 'Comptant',
  '15_JOURS': '15 jours',
  '30_JOURS': '30 jours',
  '45_JOURS_FIN_MOIS': '45 jours fin de mois',
  '60_JOURS': '60 jours',
};

const MODE_LABELS = {
  VIREMENT: 'Virement bancaire',
  PRELEVEMENT_SEPA: 'Prélèvement SEPA',
  CHEQUE: 'Chèque',
  CARTE: 'Carte bancaire',
  ESPECES: 'Espèces',
};

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMontant(v) {
  return parseFloat(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildLignesHtml(lignes) {
  let html = '';
  for (const l of lignes) {
    if (l.type === 'SAUT_DE_LIGNE') {
      html += `<tr><td colspan="6" style="border-bottom:1px solid #e2e8f0;padding:4px 0"></td></tr>`;
      continue;
    }
    if (l.type === 'COMMENTAIRE') {
      html += `<tr><td colspan="6" style="padding:8px 12px;background:#f8fafc;font-style:italic;color:#475569;border-bottom:1px solid #e2e8f0">${l.designation || ''}</td></tr>`;
      continue;
    }
    if (l.type === 'SOUS_TOTAL') {
      html += `<tr style="background:#f1f5f9"><td colspan="5" style="padding:8px 12px;font-weight:600;text-align:right;border-bottom:1px solid #cbd5e1">Sous-total</td><td style="padding:8px 12px;font-weight:600;text-align:right;border-bottom:1px solid #cbd5e1">${formatMontant(l.montant_ht)} €</td></tr>`;
      continue;
    }

    const optLabel = l.est_optionnel ? ' <span style="color:#9ca3af;font-style:italic">(Option)</span>' : '';
    const style = l.est_optionnel ? 'font-style:italic;color:#6b7280' : '';
    const remiseStr = parseFloat(l.remise_ligne_valeur) > 0
      ? (l.remise_ligne_type === 'POURCENTAGE' ? `-${l.remise_ligne_valeur}%` : `-${formatMontant(l.remise_ligne_valeur)}€`)
      : '';

    html += `<tr style="${style}">
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${l.reference || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${l.designation || ''}${optLabel}${l.description_detaillee ? '<br><span style="font-size:11px;color:#64748b">' + l.description_detaillee + '</span>' : ''}</td>
      <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0">${l.quantite} ${l.unite || ''}</td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0">${formatMontant(l.prix_unitaire_ht)} €</td>
      <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0">${remiseStr}</td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0">${formatMontant(l.montant_ht)} €</td>
    </tr>`;
  }
  return html;
}

function buildChampsHtml(champs) {
  const visibles = champs.filter(c => c.afficher_sur_pdf);
  if (visibles.length === 0) return '';

  let html = `<div style="margin:20px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
    <div style="font-weight:600;margin-bottom:8px;color:#1e293b">Informations complémentaires</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">`;

  for (const c of visibles) {
    html += `<div><span style="color:#64748b">${c.label} :</span> <strong>${c.valeur || '-'}</strong></div>`;
  }

  html += `</div></div>`;
  return html;
}

export function generateDevisPdfHtml(devisData) {
  const d = devisData;
  const client = d.client || {};
  const adrFact = d.adresse_facturation;
  const contact = d.contact;

  const adresseClient = adrFact
    ? `${adrFact.ligne1}${adrFact.ligne2 ? '<br>' + adrFact.ligne2 : ''}<br>${adrFact.code_postal} ${adrFact.ville}<br>${adrFact.pays || 'France'}`
    : '';

  const contactStr = contact ? `${contact.prenom} ${contact.nom}${contact.fonction ? ' — ' + contact.fonction : ''}` : '';

  // TVA détail
  const lignesActives = (d.lignes || []).filter(l => !l.est_optionnel && !['COMMENTAIRE', 'SAUT_DE_LIGNE', 'SOUS_TOTAL'].includes(l.type));
  const tvaDetail = {};
  for (const l of lignesActives) {
    const t = parseFloat(l.taux_tva) || 0;
    if (!tvaDetail[t]) tvaDetail[t] = 0;
    tvaDetail[t] += parseFloat(l.montant_tva || 0);
  }

  let tvaHtml = '';
  for (const [taux, montant] of Object.entries(tvaDetail)) {
    tvaHtml += `<tr><td style="text-align:right;padding:4px 12px;color:#475569">TVA ${taux}%</td><td style="text-align:right;padding:4px 12px">${formatMontant(montant)} €</td></tr>`;
  }

  const montantRemiseGlobale = parseFloat(d.montant_remise) > 0
    ? `<tr><td style="text-align:right;padding:4px 12px;color:#dc2626">Remise${d.remise_globale_type === 'POURCENTAGE' ? ` (${d.remise_globale_valeur}%)` : ''}</td><td style="text-align:right;padding:4px 12px;color:#dc2626">-${formatMontant(d.montant_remise)} €</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:13px; color:#1e293b; }
  @page { size:A4; margin:20mm 15mm; }
</style></head>
<body style="padding:40px">

<!-- EN-TÊTE -->
<table style="width:100%;margin-bottom:30px">
<tr>
  <td style="width:50%;vertical-align:top">
    <div style="font-size:22px;font-weight:700;color:#1e40af;margin-bottom:6px">${SOCIETE.nom}</div>
    <div style="color:#475569;line-height:1.6">
      ${SOCIETE.adresse}<br>${SOCIETE.cp} ${SOCIETE.ville}<br>
      Tél : ${SOCIETE.tel}<br>${SOCIETE.email}
    </div>
  </td>
  <td style="width:50%;vertical-align:top;text-align:right">
    <div style="font-size:26px;font-weight:700;color:#1e293b;margin-bottom:12px">DEVIS</div>
    <div style="color:#475569;line-height:1.8">
      <strong>N°</strong> ${d.numero_devis}<br>
      <strong>Date :</strong> ${formatDate(d.date_emission || d.date_creation)}<br>
      <strong>Validité :</strong> ${formatDate(d.date_validite)}
      ${d.reference_client ? '<br><strong>Réf. client :</strong> ' + d.reference_client : ''}
    </div>
  </td>
</tr>
</table>

<!-- DESTINATAIRE -->
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px">
  <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">Destinataire</div>
  <div style="font-weight:600;font-size:15px">${client.raison_sociale || ''}</div>
  ${contactStr ? '<div style="color:#475569">' + contactStr + '</div>' : ''}
  ${adresseClient ? '<div style="color:#475569;margin-top:4px">' + adresseClient + '</div>' : ''}
  ${client.email_principal ? '<div style="color:#475569">' + client.email_principal + '</div>' : ''}
</div>

<!-- OBJET -->
<div style="background:#1e40af;color:white;padding:10px 16px;border-radius:6px;margin-bottom:20px;font-weight:600;font-size:14px">
  Objet : ${d.objet}
</div>

<!-- LIGNES -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<thead>
<tr style="background:#1e293b;color:white">
  <th style="padding:10px 12px;text-align:left;width:10%">Réf.</th>
  <th style="padding:10px 12px;text-align:left;width:35%">Désignation</th>
  <th style="padding:10px 12px;text-align:center;width:12%">Qté</th>
  <th style="padding:10px 12px;text-align:right;width:15%">P.U. HT</th>
  <th style="padding:10px 12px;text-align:center;width:10%">Remise</th>
  <th style="padding:10px 12px;text-align:right;width:18%">Total HT</th>
</tr>
</thead>
<tbody>
${buildLignesHtml(d.lignes || [])}
</tbody>
</table>

<!-- CHAMPS PERSO -->
${buildChampsHtml(d.champs_personnalises || [])}

<!-- TOTAUX -->
<table style="width:50%;margin-left:auto;margin-bottom:24px;border-collapse:collapse">
  <tr><td style="text-align:right;padding:4px 12px;color:#475569">Total HT</td><td style="text-align:right;padding:4px 12px">${formatMontant(d.montant_ht)} €</td></tr>
  ${montantRemiseGlobale}
  ${parseFloat(d.montant_remise) > 0 ? '<tr><td style="text-align:right;padding:4px 12px;color:#475569">Total HT net</td><td style="text-align:right;padding:4px 12px">' + formatMontant(d.montant_ht_apres_remise) + ' €</td></tr>' : ''}
  ${tvaHtml}
  <tr style="border-top:2px solid #1e40af"><td style="text-align:right;padding:10px 12px;font-weight:700;font-size:16px;color:#1e40af">Total TTC</td><td style="text-align:right;padding:10px 12px;font-weight:700;font-size:16px;color:#1e40af">${formatMontant(d.montant_ttc)} €</td></tr>
</table>

<!-- MESSAGE CLIENT -->
${d.message_client ? '<div style="padding:12px;background:#eff6ff;border-left:3px solid #1e40af;margin-bottom:16px;color:#1e293b">' + d.message_client + '</div>' : ''}

<!-- CONDITIONS PAIEMENT -->
<div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:12px">
  <strong>Conditions de paiement :</strong> ${MODE_LABELS[d.mode_paiement] || d.mode_paiement} — ${CONDITIONS_LABELS[d.conditions_paiement] || d.conditions_paiement}
</div>

<!-- CGV -->
<div style="font-size:10px;color:#94a3b8;line-height:1.5;border-top:1px solid #e2e8f0;padding-top:12px">
  ${d.conditions_generales || CGV_DEFAULT}
</div>

</body></html>`;
}

export async function generateDevisPdf(devisId) {
  const devisData = await getDevisById(devisId);
  const html = generateDevisPdfHtml(devisData);
  return { html, devis: devisData };
}
