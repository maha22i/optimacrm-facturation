// ═══════════════════════════════════════════════════════════════════════════════
// Configuration centralisée des catégories de lignes par type de contrat.
// Source unique de vérité — réutilisée backend (import, validation, routes)
// et exposée via API pour le frontend.
//
// MULTI-TENANT : pour ajouter une rubrique, il suffit de l'ajouter ici.
// La contrainte CHECK SQL a été supprimée (migration 038) ; la validation
// se fait en applicatif via isValidCategorie(). Les rubriques inconnues
// ne sont PAS rejetées — elles passent en tant que "Personnalisé".
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
    'Fibre',
    'Internet',
    'Location Matériel',
    'Abonnement Divers',
    'Sécurité',
    'Services IT',
    'Service Astreinte IPBX',
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
export const ABONNEMENT_TYPES = ['Telephonie', 'Informatique'];

export function getCategoriesForType(typeContrat) {
  return CONTRAT_CATEGORIES[typeContrat] || CONTRAT_CATEGORIES.Copieur;
}

export function isAbonnementType(typeContrat) {
  return ABONNEMENT_TYPES.includes(typeContrat);
}

/**
 * Vérifie si une catégorie est connue pour un type. Les catégories inconnues
 * ne sont PAS rejetées — elles sont acceptées tel quel pour supporter les
 * rubriques personnalisées des tenants.
 */
export function isValidCategorie(categorie, typeContrat) {
  if (!categorie) return true;
  const cats = getCategoriesForType(typeContrat);
  return cats.some(c => c.toLowerCase() === categorie.toLowerCase()) || true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mapping colonnes *_HT → catégorie de rubrique par type de contrat.
// Utilisé par l'import "colonnes de rubriques" (1 ligne = 1 contrat).
// Extensible sans toucher au parseur : ajouter une entrée ici suffit.
// ═══════════════════════════════════════════════════════════════════════════════

export const RUBRIQUE_COLUMNS = {
  Telephonie: [
    { columnSuffixes: ['forfait_fixe_ht', 'forfait_fixe', 'forfait fixe ht', 'forfait fixe'], categorie: 'Forfait Fixe' },
    { columnSuffixes: ['forfait_mobile_ht', 'forfait_mobile', 'forfait mobile ht', 'forfait mobile'], categorie: 'Forfait Mobile' },
    { columnSuffixes: ['fibre_ht', 'fibre'], categorie: 'Fibre' },
    { columnSuffixes: ['internet_ht', 'internet', 'lien internet', 'lien acces internet'], categorie: 'Internet' },
    { columnSuffixes: ['location_materiel_ht', 'location_materiel', 'location materiel ht', 'location materiel'], categorie: 'Location Matériel' },
    { columnSuffixes: ['abonnement_divers_ht', 'abonnement_divers', 'abonnement divers ht', 'abonnement divers'], categorie: 'Abonnement Divers' },
    { columnSuffixes: ['securite_ht', 'securite', 'sécurité ht', 'sécurité'], categorie: 'Sécurité' },
    { columnSuffixes: ['services_it_ht', 'services_it', 'services it ht', 'services it'], categorie: 'Services IT' },
    { columnSuffixes: ['service_astreinte_ipbx_ht', 'service_astreinte_ipbx', 'astreinte ipbx', 'astreinte_ipbx_ht'], categorie: 'Service Astreinte IPBX' },
  ],
  Informatique: [
    { columnSuffixes: ['videosurveillance_ht', 'video_ht', 'videosurveillance', 'video'], categorie: 'Vidéosurveillance' },
    { columnSuffixes: ['controle_acces_ht', 'ctrl_acces_ht', 'controle acces'], categorie: 'Contrôle d\'accès' },
    { columnSuffixes: ['teleassistance_ht', 'teleassistance'], categorie: 'Téléassistance' },
    { columnSuffixes: ['generateur_brouillard_ht', 'gen_brouillard_ht'], categorie: 'Générateur de brouillard' },
    { columnSuffixes: ['maintenance_serveur_ht', 'maintenance_serveur'], categorie: 'Maintenance serveur' },
    { columnSuffixes: ['cloud_ht', 'cloud'], categorie: 'Cloud' },
    { columnSuffixes: ['office_365_ht', 'office_365', 'office365'], categorie: 'Office 365' },
    { columnSuffixes: ['logiciel_ht', 'licence_ht', 'logiciel'], categorie: 'Logiciel / Licence' },
  ],
  Securite: [
    { columnSuffixes: ['videosurveillance_ht', 'video_ht'], categorie: 'Vidéosurveillance' },
    { columnSuffixes: ['controle_acces_ht', 'ctrl_acces_ht'], categorie: 'Contrôle d\'accès' },
    { columnSuffixes: ['teleassistance_ht', 'teleassistance'], categorie: 'Téléassistance' },
    { columnSuffixes: ['generateur_brouillard_ht', 'gen_brouillard_ht'], categorie: 'Générateur de brouillard' },
  ],
};

/**
 * Normalise un en-tête pour le comparer aux colonnes de rubriques.
 */
function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 _]/g, '')
    .replace(/\s+/g, '_');
}

/**
 * Détecte les colonnes de rubriques dans un jeu d'en-têtes pour un type donné.
 * Retourne un tableau [{ colIndex, categorie, originalHeader }].
 */
export function detectRubriqueColumns(headers, typeContrat) {
  const rubriques = RUBRIQUE_COLUMNS[typeContrat];
  if (!rubriques) return [];

  const detected = [];
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (!norm) continue;
    for (const rub of rubriques) {
      if (rub.columnSuffixes.some(s => normalizeHeader(s) === norm)) {
        detected.push({ colIndex: i, categorie: rub.categorie, originalHeader: headers[i] });
        break;
      }
    }
  }
  return detected;
}

/**
 * Détecte si les en-têtes correspondent au format "colonnes de rubriques"
 * (au moins 2 colonnes HT reconnues pour le type donné).
 */
export function isRubriqueColumnsFormat(headers, typeContrat) {
  return detectRubriqueColumns(headers, typeContrat).length >= 2;
}
