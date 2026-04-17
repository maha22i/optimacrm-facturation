export const CLIENTS_FIELD_GROUPS = [
  {
    group: 'Identification',
    icon: '🏢',
    fields: [
      {
        key: 'code_client',
        label: 'Code client',
        required: true,
        type: 'text',
        synonyms: [
          'n° client', 'numero client', 'numéro client', 'code client', 'code',
          'ref client', 'référence client', 'reference client', 'id client',
          'n client', 'no client', 'numero_client', 'n°client',
        ],
      },
      {
        key: 'raison_sociale',
        label: 'Raison sociale',
        required: true,
        type: 'text',
        synonyms: [
          'raison sociale', 'société', 'societe', 'nom', 'entreprise', 'company',
          'name', 'client', 'nom client', 'denomination', 'dénomination',
          'nom entreprise', 'raison_sociale',
        ],
      },
      {
        key: 'sigle',
        label: 'Sigle / Nom commercial',
        required: false,
        type: 'text',
        synonyms: [
          'sigle', 'nom commercial', 'enseigne', 'abréviation', 'acronyme',
        ],
      },
      {
        key: 'siret',
        label: 'SIRET',
        required: false,
        type: 'text',
        synonyms: [
          'siret', 'n° siret', 'numero siret', 'numéro siret', 'nsiret',
          'n siret', 'code siret',
        ],
      },
      {
        key: 'effectif',
        label: 'Effectif',
        required: false,
        type: 'text',
        synonyms: [
          'effectif', 'nombre salariés', 'nb salariés', 'taille',
          'nb employés', 'nombre employes',
        ],
      },
    ],
  },
  {
    group: 'Coordonnées',
    icon: '📞',
    fields: [
      {
        key: 'telephone',
        label: 'Téléphone standard',
        required: false,
        type: 'text',
        synonyms: [
          'standard', 'téléphone', 'telephone', 'tel', 'tél', 'phone',
          'tel principal', 'téléphone standard', 'tel standard',
        ],
      },
      {
        key: 'email_principal',
        label: 'Email principal',
        required: false,
        type: 'text',
        synonyms: [
          'adresse mail', 'email', 'e-mail', 'mail', 'courriel', 'email principal',
          'adresse email', 'adresse e-mail', 'email client',
        ],
      },
    ],
  },
  {
    group: 'Adresse',
    icon: '📍',
    fields: [
      {
        key: 'adresse_numero',
        label: 'N° de rue',
        required: false,
        type: 'text',
        synonyms: [
          'n°', 'numéro', 'numero', 'num rue', 'n° rue', 'numéro rue', 'no',
        ],
      },
      {
        key: 'adresse_voie',
        label: 'Type de voie',
        required: false,
        type: 'text',
        synonyms: [
          'voie', 'type voie', 'type de voie',
        ],
      },
      {
        key: 'adresse_rue',
        label: 'Adresse (rue)',
        required: false,
        type: 'text',
        synonyms: [
          'adresse', 'rue', 'nom rue', 'libellé voie', 'libelle voie',
        ],
      },
      {
        key: 'adresse_code_postal',
        label: 'Code postal',
        required: false,
        type: 'text',
        synonyms: [
          'cp', 'code postal', 'code_postal', 'zip', 'postal code', 'codepostal',
        ],
      },
      {
        key: 'adresse_ville',
        label: 'Ville',
        required: false,
        type: 'text',
        synonyms: [
          'ville', 'commune', 'city', 'localité', 'localite',
        ],
      },
    ],
  },
  {
    group: 'Contact principal',
    icon: '👤',
    fields: [
      {
        key: 'contact_civilite',
        label: 'Civilité du contact',
        required: false,
        type: 'text',
        synonyms: [
          'titre', 'civilité', 'civilite', 'mr/mme',
        ],
      },
      {
        key: 'contact_nom',
        label: 'Nom du contact',
        required: false,
        type: 'text',
        synonyms: [
          'contact', 'nom contact', 'interlocuteur', 'correspondant', 'contact principal',
        ],
      },
      {
        key: 'contact_ligne_directe',
        label: 'Tél. ligne directe',
        required: false,
        type: 'text',
        synonyms: [
          'ligne directe', 'tel direct', 'téléphone direct', 'direct',
        ],
      },
      {
        key: 'contact_mobile',
        label: 'Mobile du contact',
        required: false,
        type: 'text',
        synonyms: [
          'mobile', 'portable', 'gsm', 'tel mobile', 'téléphone mobile', 'cell',
        ],
      },
    ],
  },
  {
    group: 'Contact secondaire',
    icon: '👥',
    fields: [
      {
        key: 'contact2_civilite',
        label: 'Civilité contact 2',
        required: false,
        type: 'text',
        synonyms: [
          'titre.1', 'civilité 2', 'titre 2', 'civilite 2',
        ],
      },
      {
        key: 'contact2_nom',
        label: 'Nom contact 2',
        required: false,
        type: 'text',
        synonyms: [
          'contact.1', 'contact 2', 'contact secondaire', 'interlocuteur 2',
        ],
      },
    ],
  },
  {
    group: 'Paiement / Banque',
    icon: '💳',
    fields: [
      {
        key: 'mode_reglement',
        label: 'Mode de règlement',
        required: false,
        type: 'text',
        synonyms: [
          'mode de réglement', 'mode de reglement', 'mode réglement', 'mode reglement',
          'mode paiement', 'règlement', 'reglement',
        ],
      },
      {
        key: 'conditions_paiement',
        label: 'Conditions de paiement',
        required: false,
        type: 'text',
        synonyms: [
          'échéance à', 'echeance a', 'échéance', 'echeance', 'délai paiement',
          'delai paiement', 'conditions paiement',
        ],
      },
      {
        key: 'iban',
        label: 'IBAN',
        required: false,
        type: 'text',
        synonyms: ['iban', 'n° iban', 'numéro iban', 'compte iban'],
      },
      {
        key: 'bic',
        label: 'BIC',
        required: false,
        type: 'text',
        synonyms: ['bic', 'code bic', 'swift', 'code swift'],
      },
      {
        key: 'date_mandat_sepa',
        label: 'Date mandat SEPA',
        required: false,
        type: 'date',
        synonyms: ['date mandat', 'date mandat sepa', 'mandat', 'date rum'],
      },
      {
        key: 'jour_prelevement',
        label: 'Jour de prélèvement',
        required: false,
        type: 'integer',
        synonyms: [
          'jour prélvt', 'jour prelevement', 'jour prélèvement',
          'jour de prélèvement', 'jour prelvt',
        ],
      },
    ],
  },
  {
    group: 'Commercial / CRM',
    icon: '📊',
    fields: [
      {
        key: 'commercial',
        label: 'Commercial assigné',
        required: false,
        type: 'text',
        synonyms: ['commercial', 'commercial assigné', 'vendeur', 'responsable commercial'],
      },
      {
        key: 'payeur',
        label: 'Payeur',
        required: false,
        type: 'text',
        synonyms: ['payeur', 'raison sociale payeur', 'société payeur', 'facturé à'],
      },
      {
        key: 'origine',
        label: 'Origine',
        required: false,
        type: 'text',
        synonyms: ['origine', 'source', 'provenance', 'canal acquisition'],
      },
      {
        key: 'compte_tiers',
        label: 'Compte tiers',
        required: false,
        type: 'text',
        synonyms: ['compte tiers', 'compte comptable', 'code tiers'],
      },
      {
        key: 'date_rappel',
        label: 'Date de rappel',
        required: false,
        type: 'date',
        synonyms: ['date de rappel', 'date rappel', 'rappel', 'relance'],
      },
      {
        key: 'date_rdv',
        label: 'Date de rendez-vous',
        required: false,
        type: 'date',
        synonyms: ['date de rendez-vous', 'date rendez-vous', 'date rdv', 'rdv'],
      },
    ],
  },
];

export function getAllClientStandardFields() {
  const fields = [];
  for (const group of CLIENTS_FIELD_GROUPS) {
    for (const field of group.fields) {
      fields.push({ ...field, group: group.group, icon: group.icon });
    }
  }
  return fields;
}
