export const CATALOGUE_FIELD_GROUPS = [
  {
    group: 'Identification',
    icon: '🏷️',
    fields: [
      {
        key: 'reference',
        label: 'Référence interne',
        required: true,
        type: 'text',
        synonyms: [
          'ref', 'référence', 'reference', 'reference interne', 'référence interne',
          'code', 'code article', 'sku', 'ref produit', 'reference produit',
          'code mercury', 'ref interne', 'code mercury / ref produit',
        ],
      },
      {
        key: 'reference_fournisseur',
        label: 'Référence fournisseur',
        required: false,
        type: 'text',
        synonyms: [
          'ref fournisseur', 'référence fournisseur', 'reference fournisseur',
          'code fournisseur', 'ref fourn', 'ref constructeur',
        ],
      },
      {
        key: 'designation',
        label: 'Désignation',
        required: true,
        type: 'text',
        synonyms: [
          'libellé', 'libelle', 'libellé du produit', 'libelle du produit',
          'nom', 'nom produit', 'désignation', 'designation', 'designation du produit',
          'description courte', 'intitulé', 'intitule',
        ],
      },
      {
        key: 'description',
        label: 'Description',
        required: false,
        type: 'text',
        synonyms: [
          'description', 'description longue', 'détail', 'detail',
          'complément', 'complement', 'complement information', 'notes',
        ],
      },
    ],
  },
  {
    group: 'Classification',
    icon: '📋',
    fields: [
      {
        key: 'categorie',
        label: 'Catégorie',
        required: false,
        type: 'text',
        synonyms: [
          'catégorie', 'categorie', 'type', 'type produit', 'type\nproduit',
          'gamme', 'segment',
        ],
      },
      {
        key: 'fournisseur',
        label: 'Fournisseur',
        required: false,
        type: 'lookup',
        synonyms: [
          'fournisseur', 'nom du fournisseur', 'nom fournisseur', 'supplier',
          'vendeur', 'distributeur',
        ],
      },
      {
        key: 'marque',
        label: 'Marque',
        required: false,
        type: 'lookup',
        synonyms: [
          'marque', 'brand', 'fabricant', 'constructeur', 'manufacturer',
        ],
      },
      {
        key: 'famille',
        label: 'Famille',
        required: false,
        type: 'lookup',
        synonyms: [
          'famille', 'sous-catégorie', 'sous categorie', 'sous-categorie',
          'group', 'groupe', 'famille produit',
        ],
      },
    ],
  },
  {
    group: 'Tarification',
    icon: '💰',
    fields: [
      {
        key: 'prix_unitaire_ht',
        label: 'Prix de vente HT',
        required: false,
        type: 'decimal',
        synonyms: [
          'prix', 'prix ht', 'prix de vente', 'prix vente', 'pu ht',
          'prix unitaire', 'tarif', 'tarif ht', 'pvht', 'p.u. ht',
        ],
      },
      {
        key: 'prix_achat',
        label: "Prix d'achat",
        required: false,
        type: 'decimal',
        synonyms: [
          'prix achat', 'pa', 'pa ht', 'cout', 'coût', 'prix revient',
          'prix de revient', 'cout achat',
        ],
      },
      {
        key: 'taux_tva',
        label: 'Taux TVA (%)',
        required: false,
        type: 'decimal',
        synonyms: ['tva', 'taux tva', 'taux', 'tax', 'taxe'],
      },
      {
        key: 'unite',
        label: 'Unité',
        required: false,
        type: 'text',
        synonyms: ['unité', 'unite', 'uom', 'unit', 'unité de mesure'],
      },
    ],
  },
  {
    group: 'Stock',
    icon: '📦',
    fields: [
      {
        key: 'stock_actuel',
        label: 'Stock actuel',
        required: false,
        type: 'integer',
        synonyms: ['stock', 'qté', 'quantité', 'qty', 'quantite', 'stock actuel', 'en stock'],
      },
      {
        key: 'stock_minimum',
        label: 'Stock minimum',
        required: false,
        type: 'integer',
        synonyms: ['stock min', 'stock minimum', 'seuil', 'seuil alerte', 'alerte stock'],
      },
    ],
  },
  {
    group: 'Copieur',
    icon: '🖨️',
    fields: [
      {
        key: 'modele',
        label: 'Modèle',
        required: false,
        type: 'text',
        synonyms: [
          'modèle', 'model', 'modele', 'model configurateur',
          'modèle configurateur', 'model config',
        ],
      },
      {
        key: 'code_barre',
        label: 'Code barre',
        required: false,
        type: 'text',
        synonyms: ['ean', 'code barre', 'barcode', 'gtin', 'code ean', 'code-barres'],
      },
    ],
  },
];

export function getAllStandardFields() {
  const fields = [];
  for (const group of CATALOGUE_FIELD_GROUPS) {
    for (const field of group.fields) {
      fields.push({ ...field, group: group.group, icon: group.icon });
    }
  }
  return fields;
}

export function getAllSynonymsMap() {
  const map = new Map();
  for (const group of CATALOGUE_FIELD_GROUPS) {
    for (const field of group.fields) {
      map.set(field.key, {
        ...field,
        group: group.group,
        icon: group.icon,
      });
    }
  }
  return map;
}
