import type { DevisDetail, DevisLigne } from '@/lib/types';

/**
 * Lignes à afficher / éditer : données `devis_lignes` ou, si import Excel sans lignes,
 * une ligne de synthèse dérivée des totaux et champs import (aligné backend `lignesPourPdf`).
 */
export function lignesAfficheesPourDevis(devis: DevisDetail): DevisLigne[] {
  const lignes = devis.lignes || [];
  if (lignes.length > 0) return [...lignes].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  const ht = Number(devis.montant_ht_apres_remise ?? devis.montant_ht ?? 0);
  const ttc = Number(devis.montant_ttc ?? 0);
  if (ht <= 0 && ttc <= 0) return [];

  const parts = [devis.type_produit, devis.situation_affaire, devis.objet]
    .map(s => String(s || '').trim())
    .filter(Boolean);
  const designation = parts.length
    ? parts.join(' — ')
    : 'Montant (import Excel — aucune ligne de détail enregistrée)';

  const extras = [devis.ordre_service, devis.provenance].map(s => String(s || '').trim()).filter(Boolean);
  const description = extras.length ? extras.join('\n') : null;

  const tva = Number(devis.montant_tva ?? 0);
  let taux = 20;
  if (ht > 0 && tva >= 0) {
    const implied = (tva / ht) * 100;
    const allowed: number[] = [0, 5.5, 10, 20];
    taux = allowed.reduce((best, t) => (Math.abs(t - implied) < Math.abs(best - implied) ? t : best), 20);
  }

  return [{
    type: 'PRODUIT',
    ordre: 0,
    reference: null,
    designation,
    description_detaillee: description,
    unite: 'unité',
    quantite: 1,
    prix_unitaire_ht: ht,
    remise_ligne_type: 'POURCENTAGE',
    remise_ligne_valeur: 0,
    taux_tva: taux,
    montant_ht: ht,
    montant_tva: Number(devis.montant_tva ?? 0),
    montant_ttc: ttc,
    est_optionnel: false,
    catalogue_id: null,
  }];
}

/** Objet éditable : champ objet ou synthèse depuis l'import (validation API min. 2 car.) */
export function objetOuSyntheseImport(devis: DevisDetail): string {
  const o = devis.objet?.trim();
  if (o && o.length >= 2) return o;
  const parts = [devis.type_produit, devis.situation_affaire]
    .map(s => String(s || '').trim())
    .filter(Boolean);
  const syn = parts.join(' — ').trim();
  if (syn.length >= 2) return syn;
  return 'Synthèse import Excel';
}
