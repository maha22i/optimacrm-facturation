// ═══════════════════════════════════════════════════════════════════════════════
// Configuration centralisée des catégories de lignes par type de contrat.
// Source unique de vérité — réutilisée backend (import, validation, routes)
// et exposée via API pour le frontend.
// ═══════════════════════════════════════════════════════════════════════════════

export const CONTRAT_CATEGORIES = {
  Copieur: [
    'Forfait Copie N&B',
    'Forfait Copie Couleur',
    'Service Connectic',
    'Location Matériel',
    'PLC',
    'Services',
    'Autre',
    'Hors Forfait',
    'Personnalisé',
  ],
  Telephonie: [
    'Forfait Fixe',
    'Forfait Mobile',
    'Lien Internet',
    'Location Matériel',
    'Services',
    'Autre',
    'Hors Forfait',
    'Personnalisé',
  ],
  Informatique: [
    'Vidéosurveillance',
    'Contrôle d\'accès',
    'Téléassistance',
    'Générateur de brouillard',
    'Maintenance serveur',
    'Maintenance informatique',
    'Cloud',
    'Office 365',
    'Logiciel / Licence',
    'Autre',
    'Personnalisé',
  ],
  Securite: [
    'Vidéosurveillance',
    'Contrôle d\'accès',
    'Téléassistance',
    'Générateur de brouillard',
    'Autre',
    'Personnalisé',
  ],
};

export const ALL_CATEGORIES = [...new Set(Object.values(CONTRAT_CATEGORIES).flat())];

// Types de contrat facturés par abonnement (sans compteur).
// Pour ajouter un nouveau type : simplement l'ajouter ici.
export const ABONNEMENT_TYPES = ['Telephonie', 'Informatique'];

export function getCategoriesForType(typeContrat) {
  return CONTRAT_CATEGORIES[typeContrat] || CONTRAT_CATEGORIES.Copieur;
}

export function isAbonnementType(typeContrat) {
  return ABONNEMENT_TYPES.includes(typeContrat);
}
