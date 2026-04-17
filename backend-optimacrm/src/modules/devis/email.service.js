import { generateDevisPdf } from './pdf.service.js';

export async function envoyerDevisParEmail(devisId, { destinataire, objet, corps }) {
  const { html, devis } = await generateDevisPdf(devisId);

  // TODO: Intégrer un service d'email (Nodemailer, SendGrid, etc.)
  // Pour l'instant on log l'envoi
  console.log(`[EMAIL] Envoi devis ${devis.numero_devis} à ${destinataire}`);
  console.log(`[EMAIL] Objet: ${objet}`);
  console.log(`[EMAIL] Corps: ${corps?.substring(0, 100)}...`);

  return {
    sent: true,
    destinataire,
    objet: objet || `Devis ${devis.numero_devis} — ${devis.objet}`,
    devis_id: devisId,
  };
}
