export const PARC_FIELD_GROUPS = [
  {
    group: 'Identification',
    icon: '🔍',
    fields: [
      {
        key: 'numero_serie',
        label: 'Numéro de série',
        required: true,
        type: 'text',
        synonyms: [
          'numéro de série', 'numero de serie', 'n° série', 'n° serie',
          'num série', 'num serie', 'serial', 'serial number', 'sn',
          'numéro série', 'numero serie', 'matricule machine',
        ],
      },
      {
        key: 'matricule',
        label: 'Matricule',
        required: false,
        type: 'text',
        synonyms: ['matricule', 'id machine', 'identifiant machine', 'code machine'],
      },
      {
        key: 'designation',
        label: 'Désignation',
        required: true,
        type: 'text',
        synonyms: [
          'désignation', 'designation', 'nom', 'libellé', 'libelle',
          'description', 'nom modèle', 'nom modele',
        ],
      },
      {
        key: 'marque',
        label: 'Marque',
        required: false,
        type: 'text',
        synonyms: ['marque', 'fabricant', 'constructeur', 'brand'],
      },
      {
        key: 'modele',
        label: 'Modèle',
        required: false,
        type: 'text',
        synonyms: ['modèle', 'modele', 'model', 'ref modèle', 'ref modele'],
      },
      {
        key: 'categorie',
        label: 'Catégorie',
        required: false,
        type: 'text',
        synonyms: ['catégorie', 'categorie', 'type', 'type équipement', 'type equipement', 'famille'],
      },
      {
        key: 'reference_produit',
        label: 'Référence produit',
        required: false,
        type: 'text',
        synonyms: ['référence produit', 'reference produit', 'ref produit', 'ref catalogue'],
      },
    ],
  },
  {
    group: 'Affectation',
    icon: '📍',
    fields: [
      {
        key: 'code_client',
        label: 'Code client',
        required: false,
        type: 'lookup',
        synonyms: ['code client', 'ref client', 'référence client', 'reference client', 'id client'],
      },
      {
        key: 'nom_client',
        label: 'Nom client',
        required: false,
        type: 'text',
        synonyms: ['nom client', 'client', 'raison sociale', 'société', 'societe'],
      },
      {
        key: 'site_installation',
        label: 'Site d\'installation',
        required: false,
        type: 'text',
        synonyms: ['site installation', 'site', 'adresse', 'lieu', 'emplacement', 'localisation'],
      },
      {
        key: 'numero_contrat',
        label: 'Numéro contrat',
        required: false,
        type: 'text',
        synonyms: ['numéro contrat', 'numero contrat', 'n° contrat', 'contrat', 'ref contrat'],
      },
    ],
  },
  {
    group: 'Dates',
    icon: '📅',
    fields: [
      {
        key: 'date_installation',
        label: 'Date d\'installation',
        required: false,
        type: 'date',
        synonyms: ['date installation', 'date mise en service', 'installation', 'date déploiement'],
      },
      {
        key: 'date_fin_garantie',
        label: 'Date fin garantie',
        required: false,
        type: 'date',
        synonyms: ['date fin garantie', 'fin garantie', 'garantie', 'expiration garantie'],
      },
    ],
  },
  {
    group: 'Statut',
    icon: '📊',
    fields: [
      {
        key: 'statut',
        label: 'Statut',
        required: false,
        type: 'text',
        synonyms: ['statut', 'état', 'etat', 'status'],
      },
    ],
  },
  {
    group: 'Notes',
    icon: '📝',
    fields: [
      {
        key: 'notes',
        label: 'Notes',
        required: false,
        type: 'text',
        synonyms: ['notes', 'commentaire', 'remarque', 'observation', 'commentaires'],
      },
    ],
  },
];

export const RELEVES_FIELD_GROUPS = [
  {
    group: 'Identification',
    icon: '🔍',
    fields: [
      {
        key: 'numero_serie',
        label: 'Numéro de série',
        required: true,
        type: 'text',
        synonyms: [
          'numéro de série', 'numero de serie', 'n° série', 'n° serie',
          'num série', 'num serie', 'serial', 'sn', 'numéro série', 'numero serie',
        ],
      },
    ],
  },
  {
    group: 'Période',
    icon: '📅',
    fields: [
      {
        key: 'date_releve',
        label: 'Date du relevé',
        required: false,
        type: 'date',
        synonyms: ['date relevé', 'date releve', 'date', 'date de fin', 'date fin', 'date fin période'],
      },
      {
        key: 'date_debut_periode',
        label: 'Date début période',
        required: false,
        type: 'date',
        synonyms: ['date début', 'date debut', 'date de début', 'date début période', 'début période'],
      },
    ],
  },
  {
    group: 'Compteurs',
    icon: '🔢',
    fields: [
      {
        key: 'compteur_nb',
        label: 'Compteur N/B (Total mono)',
        required: false,
        type: 'number',
        synonyms: [
          'compteur nb', 'compteur n/b', 'compteur noir', 'compteur noir et blanc',
          'total mono', 'mono', 'nb', 'n/b', 'noir blanc', 'total n/b',
        ],
      },
      {
        key: 'compteur_couleur',
        label: 'Compteur Couleur (Total couleur)',
        required: false,
        type: 'number',
        synonyms: [
          'compteur couleur', 'total couleur', 'couleur', 'color', 'total color',
          'compteur color',
        ],
      },
    ],
  },
  {
    group: 'Notes',
    icon: '📝',
    fields: [
      {
        key: 'notes',
        label: 'Notes',
        required: false,
        type: 'text',
        synonyms: ['notes', 'commentaire', 'remarque', 'observation'],
      },
    ],
  },
];

export function getAllParcFields() {
  const fields = [];
  for (const group of PARC_FIELD_GROUPS) {
    for (const field of group.fields) {
      fields.push(field);
    }
  }
  return fields;
}

export function getAllRelevesFields() {
  const fields = [];
  for (const group of RELEVES_FIELD_GROUPS) {
    for (const field of group.fields) {
      fields.push(field);
    }
  }
  return fields;
}
