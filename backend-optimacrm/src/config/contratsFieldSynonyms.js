export const CONTRATS_FIELD_GROUPS = [
  {
    group: 'Contrat',
    icon: '📄',
    fields: [
      {
        key: 'numero_contrat',
        label: 'Numéro contrat',
        required: true,
        type: 'text',
        synonyms: [
          'numéro contrat', 'numero contrat', 'n° contrat', 'ref contrat',
          'contrat', 'référence contrat', 'reference contrat',
        ],
      },
      {
        key: 'type_contrat',
        label: 'Type contrat',
        required: true,
        type: 'text',
        synonyms: [
          'type contrat', 'type', 'catégorie contrat', 'categorie contrat',
        ],
      },
      {
        key: 'type_facturation',
        label: 'Type facturation',
        required: false,
        type: 'text',
        synonyms: [
          'type facturation', 'type\nfacturation', 'facturation', 'mode facturation',
        ],
      },
      {
        key: 'code_client',
        label: 'Code client',
        required: true,
        type: 'lookup',
        synonyms: [
          'code client', 'code', 'ref client', 'référence client',
          'reference client', 'id client',
        ],
      },
      {
        key: 'nom_client',
        label: 'Nom du client',
        required: false,
        type: 'text',
        synonyms: [
          'nom du client', 'nom client', 'client', 'raison sociale',
        ],
      },
      {
        key: 'statut',
        label: 'Statut',
        required: false,
        type: 'text',
        synonyms: [
          'statut activité', 'statut activite', 'statut contrat', 'statut', 'état', 'etat',
        ],
      },
      {
        key: 'periodicite',
        label: 'Périodicité',
        required: false,
        type: 'text',
        synonyms: [
          'fr', 'fréquence', 'frequence', 'périodicité', 'periodicite',
        ],
      },
      {
        key: 'notes',
        label: 'Notes / Complément',
        required: false,
        type: 'text',
        synonyms: [
          'complément information', 'complement information', 'complément', 'complement',
          'notes', 'commentaire', 'observation',
        ],
      },
    ],
  },
  {
    group: 'Dates',
    icon: '📅',
    fields: [
      {
        key: 'date_signature',
        label: 'Date de signature',
        required: false,
        type: 'date',
        synonyms: [
          'date de signature', 'date signature', 'signé le', 'signe le', 'date création', 'date creation',
        ],
      },
      {
        key: 'date_installation',
        label: 'Date installation',
        required: false,
        type: 'date',
        synonyms: [
          'date installation', 'date install', 'installé le', 'installe le',
        ],
      },
      {
        key: 'date_prochaine_facture',
        label: 'Prochaine facture',
        required: false,
        type: 'date',
        synonyms: [
          'prochaine facture', 'prochaine fact', 'proch facture', 'date prochaine facture',
        ],
      },
      {
        key: 'date_renouvellement',
        label: 'Renouvellement',
        required: false,
        type: 'date',
        synonyms: [
          'renouvellement annuel', 'renouvellement', 'date renouvellement',
        ],
      },
      {
        key: 'date_echeance',
        label: 'Échéance',
        required: false,
        type: 'date',
        synonyms: [
          'échéance du contrat', 'echeance du contrat', 'echeance', 'échéance',
          'date échéance', 'date echeance', 'fin contrat',
        ],
      },
      {
        key: 'duree_contrat_mois',
        label: 'Durée contrat (mois)',
        required: false,
        type: 'integer',
        synonyms: [
          'duree contrat', 'durée contrat', 'durée', 'duree', 'engagement',
        ],
      },
    ],
  },
  {
    group: 'Financement',
    icon: '💰',
    fields: [
      {
        key: 'numero_dossier',
        label: 'N° dossier financement',
        required: false,
        type: 'text',
        synonyms: [
          'numéro dossier', 'numero dossier', 'n° dossier', 'dossier',
        ],
      },
      {
        key: 'organisme_credit',
        label: 'Organisme crédit',
        required: false,
        type: 'text',
        synonyms: [
          'organisme credit', 'organisme crédit', 'financeur', 'leaser',
        ],
      },
      {
        key: 'montant_finance',
        label: 'Montant financé',
        required: false,
        type: 'decimal',
        synonyms: [
          'montant financé', 'montant finance', 'montant leasing',
        ],
      },
      {
        key: 'loyer_ht',
        label: 'Loyer HT',
        required: false,
        type: 'decimal',
        synonyms: [
          'loyer', 'loyer ht', 'mensualité', 'mensualite', 'redevance',
        ],
      },
      {
        key: 'location_interne',
        label: 'Location interne',
        required: false,
        type: 'text',
        synonyms: [
          'location interne', 'location', 'type location',
        ],
      },
    ],
  },
  {
    group: 'Machine',
    icon: '🖨️',
    fields: [
      {
        key: 'numero_serie',
        label: 'Numéro de série',
        required: false,
        type: 'text',
        synonyms: [
          'numéro série', 'numero serie', 'n° série', 'n serie',
          'serial', 'matricule', 'numéro de série',
        ],
      },
      {
        key: 'designation_produit',
        label: 'Désignation produit',
        required: false,
        type: 'text',
        synonyms: [
          'désignation du produit', 'designation du produit', 'designation produit',
          'produit', 'désignation', 'designation', 'modèle', 'modele', 'machine',
        ],
      },
      {
        key: 'reference_produit',
        label: 'Référence produit',
        required: false,
        type: 'text',
        synonyms: [
          'référence du produit', 'reference du produit', 'reference produit', 'ref produit',
        ],
      },
    ],
  },
  {
    group: 'Tarifs copie',
    icon: '📊',
    fields: [
      {
        key: 'cout_copie_nb',
        label: 'Coût copie N&B',
        required: false,
        type: 'decimal6',
        synonyms: [
          'coût copie n / b', 'coût copie n/b', 'coût copie nb', 'cout copie nb',
          'copie nb', 'copie noir', 'cout nb', 'cc nb',
        ],
      },
      {
        key: 'cout_copie_couleur',
        label: 'Coût copie couleur',
        required: false,
        type: 'decimal6',
        synonyms: [
          'coût copie couleur', 'cout copie couleur', 'copie couleur',
          'cout couleur', 'cc couleur', 'cc coul',
        ],
      },
      {
        key: 'cout_copie_t1',
        label: 'Coût copie T1',
        required: false,
        type: 'decimal6',
        synonyms: [
          'coût copie t1', 'cout copie t1', 'palier 1', 'tier 1',
        ],
      },
      {
        key: 'cout_copie_t2',
        label: 'Coût copie T2',
        required: false,
        type: 'decimal6',
        synonyms: [
          'coût copie t2', 'cout copie t2', 'palier 2', 'tier 2',
        ],
      },
      {
        key: 'cout_copie_t3',
        label: 'Coût copie T3',
        required: false,
        type: 'decimal6',
        synonyms: [
          'coût copie t3', 'cout copie t3', 'palier 3', 'tier 3',
        ],
      },
    ],
  },
  {
    group: 'Volumes forfait',
    icon: '📦',
    fields: [
      {
        key: 'volume_forfait_nb',
        label: 'Volume forfait N&B',
        required: false,
        type: 'integer',
        synonyms: [
          'volume offert nb', 'volume nb', 'forfait nb', 'copies incluses nb', 'volume offert',
        ],
      },
      {
        key: 'volume_forfait_couleur',
        label: 'Volume forfait couleur',
        required: false,
        type: 'integer',
        synonyms: [
          'volume offert couleur', 'volume couleur', 'forfait couleur', 'copies incluses couleur',
        ],
      },
      {
        key: 'volume_forfait_t1',
        label: 'Volume forfait T1',
        required: false,
        type: 'integer',
        synonyms: [
          'volume offert t1', 'volume t1', 'pondère', 'pondere', 't1 / pondère', 'volume offert t1 / pondère',
        ],
      },
      {
        key: 'volume_forfait_t2',
        label: 'Volume forfait T2',
        required: false,
        type: 'integer',
        synonyms: [
          'volume offert t2', 'volume t2', 'autres', 't2 / autres', 'volume offert t2 / autres',
        ],
      },
    ],
  },
  {
    group: 'Services machine',
    icon: '🔧',
    fields: [
      {
        key: 'service_connectic',
        label: 'Service Connectic',
        required: false,
        type: 'decimal',
        synonyms: [
          'service connectic', 'connectic', 'service pass',
        ],
      },
      {
        key: 'service_collecteur',
        label: 'Service Collecteur',
        required: false,
        type: 'decimal',
        synonyms: [
          'service collecteur', 'collecteur', 'kpax', 'print audit',
        ],
      },
      {
        key: 'service_divers',
        label: 'Service Divers',
        required: false,
        type: 'decimal',
        synonyms: [
          'service divers', 'divers',
        ],
      },
      {
        key: 'service_autre',
        label: 'Service Autre',
        required: false,
        type: 'decimal',
        synonyms: [
          'service autre', 'autre service',
        ],
      },
    ],
  },
  {
    group: 'Dernière facturation',
    icon: '🧾',
    fields: [
      {
        key: 'derniere_facture_date',
        label: 'Date dernière facture',
        required: false,
        type: 'date',
        synonyms: [
          'dernière facture', 'derniere facture', 'date dernière facture', 'date derniere facture',
        ],
      },
      {
        key: 'derniere_facture_numero',
        label: 'N° dernière facture',
        required: false,
        type: 'text',
        synonyms: [
          'numéro facture', 'numero facture', 'n° facture',
        ],
      },
      {
        key: 'derniere_facture_montant',
        label: 'Montant HT dernière facture',
        required: false,
        type: 'decimal',
        synonyms: [
          'montant ht', 'montant dernière facture', 'montant derniere facture', 'montant',
        ],
      },
    ],
  },
  {
    group: 'Adresse (vérification)',
    icon: '📍',
    fields: [
      {
        key: 'adresse_numero',
        label: 'N° rue',
        required: false,
        type: 'text',
        synonyms: [
          'n° rue', 'numéro rue', 'num rue',
        ],
      },
      {
        key: 'adresse_voie',
        label: 'Voie',
        required: false,
        type: 'text',
        synonyms: [
          'voie', 'type voie', 'rue',
        ],
      },
      {
        key: 'adresse_complement',
        label: 'Adresse',
        required: false,
        type: 'text',
        synonyms: [
          'adresse', 'complément adresse', 'complement adresse',
        ],
      },
      {
        key: 'adresse_cp',
        label: 'Code postal',
        required: false,
        type: 'text',
        synonyms: [
          'cp', 'code postal',
        ],
      },
      {
        key: 'adresse_ville',
        label: 'Ville',
        required: false,
        type: 'text',
        synonyms: [
          'ville', 'commune',
        ],
      },
    ],
  },
];

export function getAllContratFields() {
  const fields = [];
  for (const group of CONTRATS_FIELD_GROUPS) {
    for (const field of group.fields) {
      fields.push({ ...field, group: group.group, icon: group.icon });
    }
  }
  return fields;
}
