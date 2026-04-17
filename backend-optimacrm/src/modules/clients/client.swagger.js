const bearer = [{ bearerAuth: [] }];

function jsonBody(ref) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}

function res200(desc, ref) {
  return { 200: { description: desc, content: { 'application/json': { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function res201(desc, ref) {
  return { 201: { description: desc, content: { 'application/json': { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(400)) map[400] = { description: 'Erreur de validation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(409)) map[409] = { description: 'Conflit (doublon)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID du client' };
const adresseIdParam = { in: 'path', name: 'adresseId', required: true, schema: { type: 'integer' }, description: 'ID de l\'adresse' };
const contactIdParam = { in: 'path', name: 'contactId', required: true, schema: { type: 'integer' }, description: 'ID du contact' };
const documentIdParam = { in: 'path', name: 'documentId', required: true, schema: { type: 'integer' }, description: 'ID du document' };

export const clientSwaggerSchemas = {
  Client: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero_client: { type: 'string', example: 'CLI-00001' },
      raison_sociale: { type: 'string', example: 'ACME Corp' },
      forme_juridique: { type: 'string', enum: ['SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE'] },
      siret: { type: 'string', example: '12345678901234' },
      siren: { type: 'string', example: '123456789' },
      tva_intracommunautaire: { type: 'string', example: 'FR12345678901' },
      code_ape: { type: 'string', example: '6201Z' },
      site_web: { type: 'string', example: 'https://acme.com' },
      telephone_principal: { type: 'string', example: '01 23 45 67 89' },
      email_principal: { type: 'string', format: 'email' },
      email_comptabilite: { type: 'string', format: 'email' },
      statut: { type: 'string', enum: ['ACTIF','INACTIF','BLOQUE','PROSPECT'] },
      blocage_raison: { type: 'string' },
      remise_globale: { type: 'number', example: 0 },
      taux_tva_defaut: { type: 'number', example: 20 },
      devise: { type: 'string', example: 'EUR' },
      plafond_encours: { type: 'number', nullable: true },
      delai_paiement: { type: 'string', enum: ['COMPTANT','15_JOURS','30_JOURS','45_JOURS_FIN_MOIS','60_JOURS'] },
      mode_paiement_prefere: { type: 'string', enum: ['VIREMENT','PRELEVEMENT_SEPA','CHEQUE','CARTE','ESPECES'] },
      iban: { type: 'string' },
      bic: { type: 'string' },
      reference_mandat_sepa: { type: 'string' },
      date_mandat_sepa: { type: 'string', format: 'date' },
      notes: { type: 'string' },
      champs_personnalises: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', example: 'Commercial assigné' },
            valeur: { type: 'string', example: 'Alice Martin' },
          },
        },
      },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  ClientDetail: {
    allOf: [
      { $ref: '#/components/schemas/Client' },
      {
        type: 'object',
        properties: {
          adresses: { type: 'array', items: { $ref: '#/components/schemas/ClientAdresse' } },
          contacts: { type: 'array', items: { $ref: '#/components/schemas/ClientContact' } },
          documents: { type: 'array', items: { $ref: '#/components/schemas/ClientDocument' } },
        },
      },
    ],
  },
  CreateClientRequest: {
    type: 'object',
    required: ['raison_sociale', 'email_principal'],
    properties: {
      raison_sociale: { type: 'string', example: 'ACME Corp' },
      forme_juridique: { type: 'string', enum: ['SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE'], default: 'SARL' },
      siret: { type: 'string', example: '12345678901234' },
      tva_intracommunautaire: { type: 'string' },
      code_ape: { type: 'string' },
      site_web: { type: 'string' },
      telephone_principal: { type: 'string' },
      email_principal: { type: 'string', format: 'email', example: 'contact@acme.com' },
      email_comptabilite: { type: 'string', format: 'email' },
      statut: { type: 'string', enum: ['ACTIF','INACTIF','BLOQUE','PROSPECT'], default: 'ACTIF' },
      blocage_raison: { type: 'string' },
      remise_globale: { type: 'number', default: 0 },
      taux_tva_defaut: { type: 'number', enum: [20, 10, 5.5, 0], default: 20 },
      devise: { type: 'string', default: 'EUR' },
      plafond_encours: { type: 'number' },
      delai_paiement: { type: 'string', enum: ['COMPTANT','15_JOURS','30_JOURS','45_JOURS_FIN_MOIS','60_JOURS'], default: '30_JOURS' },
      mode_paiement_prefere: { type: 'string', enum: ['VIREMENT','PRELEVEMENT_SEPA','CHEQUE','CARTE','ESPECES'] },
      iban: { type: 'string' },
      bic: { type: 'string' },
      reference_mandat_sepa: { type: 'string' },
      date_mandat_sepa: { type: 'string', format: 'date' },
      notes: { type: 'string' },
      champs_personnalises: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            valeur: { type: 'string' },
          },
        },
      },
    },
  },
  UpdateClientRequest: {
    type: 'object',
    properties: {
      raison_sociale: { type: 'string' },
      forme_juridique: { type: 'string', enum: ['SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE'] },
      siret: { type: 'string' },
      tva_intracommunautaire: { type: 'string' },
      code_ape: { type: 'string' },
      site_web: { type: 'string' },
      telephone_principal: { type: 'string' },
      email_principal: { type: 'string', format: 'email' },
      email_comptabilite: { type: 'string', format: 'email' },
      statut: { type: 'string', enum: ['ACTIF','INACTIF','BLOQUE','PROSPECT'] },
      blocage_raison: { type: 'string' },
      remise_globale: { type: 'number' },
      taux_tva_defaut: { type: 'number', enum: [20, 10, 5.5, 0] },
      plafond_encours: { type: 'number' },
      delai_paiement: { type: 'string', enum: ['COMPTANT','15_JOURS','30_JOURS','45_JOURS_FIN_MOIS','60_JOURS'] },
      mode_paiement_prefere: { type: 'string', enum: ['VIREMENT','PRELEVEMENT_SEPA','CHEQUE','CARTE','ESPECES'] },
      iban: { type: 'string' },
      bic: { type: 'string' },
      reference_mandat_sepa: { type: 'string' },
      date_mandat_sepa: { type: 'string', format: 'date' },
      notes: { type: 'string' },
      champs_personnalises: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            valeur: { type: 'string' },
          },
        },
      },
    },
  },
  ClientAdresse: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      client_id: { type: 'integer' },
      type: { type: 'string', enum: ['FACTURATION','LIVRAISON','SIEGE'] },
      est_defaut: { type: 'boolean' },
      ligne1: { type: 'string' },
      ligne2: { type: 'string' },
      code_postal: { type: 'string' },
      ville: { type: 'string' },
      pays: { type: 'string' },
      label: { type: 'string' },
    },
  },
  CreateAdresseRequest: {
    type: 'object',
    required: ['ligne1', 'code_postal', 'ville'],
    properties: {
      type: { type: 'string', enum: ['FACTURATION','LIVRAISON','SIEGE'], default: 'FACTURATION' },
      est_defaut: { type: 'boolean', default: false },
      ligne1: { type: 'string', example: '10 rue de la Paix' },
      ligne2: { type: 'string' },
      code_postal: { type: 'string', example: '75001' },
      ville: { type: 'string', example: 'Paris' },
      pays: { type: 'string', default: 'France' },
      label: { type: 'string', example: 'Siège Paris' },
    },
  },
  ClientContact: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      client_id: { type: 'integer' },
      role: { type: 'string', enum: ['PRINCIPAL','COMPTABILITE','TECHNIQUE','AUTRE'] },
      nom: { type: 'string' },
      prenom: { type: 'string' },
      fonction: { type: 'string' },
      telephone: { type: 'string' },
      mobile: { type: 'string' },
      email: { type: 'string', format: 'email' },
      est_principal: { type: 'boolean' },
    },
  },
  CreateContactRequest: {
    type: 'object',
    required: ['nom', 'prenom'],
    properties: {
      role: { type: 'string', enum: ['PRINCIPAL','COMPTABILITE','TECHNIQUE','AUTRE'], default: 'PRINCIPAL' },
      nom: { type: 'string', example: 'Dupont' },
      prenom: { type: 'string', example: 'Jean' },
      fonction: { type: 'string', example: 'Directeur' },
      telephone: { type: 'string' },
      mobile: { type: 'string' },
      email: { type: 'string', format: 'email' },
      est_principal: { type: 'boolean', default: false },
    },
  },
  ClientDocument: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      client_id: { type: 'integer' },
      nom: { type: 'string' },
      type: { type: 'string', enum: ['CONTRAT','RIB','MANDAT_SEPA','BON_COMMANDE','AUTRE'] },
      url: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateDocumentRequest: {
    type: 'object',
    required: ['nom', 'url'],
    properties: {
      nom: { type: 'string', example: 'Contrat 2024' },
      type: { type: 'string', enum: ['CONTRAT','RIB','MANDAT_SEPA','BON_COMMANDE','AUTRE'], default: 'AUTRE' },
      url: { type: 'string', example: '/uploads/contrat-2024.pdf' },
    },
  },
  ClientStats: {
    type: 'object',
    properties: {
      ca_total: { type: 'number' },
      nb_factures: { type: 'integer' },
      factures_en_attente: { type: 'integer' },
      montant_en_attente: { type: 'number' },
      solde_du: { type: 'number' },
      nb_contrats_actifs: { type: 'integer' },
    },
  },
  PaginatedClients: {
    type: 'object',
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
    },
  },
};

export const clientSwaggerPaths = {
  // ── Clients ──────────────────────────────────────────────────────────────
  '/api/clients': {
    get: {
      tags: ['Clients'],
      summary: 'Liste paginée des clients',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        { in: 'query', name: 'statut', schema: { type: 'string', enum: ['ACTIF','INACTIF','BLOQUE','PROSPECT'] } },
        { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Recherche sur raison_sociale, numero_client, email, siret' },
      ],
      responses: { ...res200('Liste des clients', 'PaginatedClients'), ...resErr(401) },
    },
    post: {
      tags: ['Clients'],
      summary: 'Créer un nouveau client',
      security: bearer,
      requestBody: jsonBody('CreateClientRequest'),
      responses: { ...res201('Client créé', 'Client'), ...resErr(400, 401, 409) },
    },
  },
  '/api/clients/{id}': {
    get: {
      tags: ['Clients'],
      summary: 'Fiche complète d\'un client',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Détail du client', 'ClientDetail'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Clients'],
      summary: 'Modifier un client',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('UpdateClientRequest'),
      responses: { ...res200('Client mis à jour', 'Client'), ...resErr(400, 401, 404, 409) },
    },
    delete: {
      tags: ['Clients'],
      summary: 'Supprimer un client (soft delete → INACTIF)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Client passé en inactif'), ...resErr(401, 404) },
    },
  },
  '/api/clients/{id}/stats': {
    get: {
      tags: ['Clients'],
      summary: 'Statistiques du client (CA, factures, solde dû)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Statistiques', 'ClientStats'), ...resErr(401, 404) },
    },
  },

  // ── Adresses ─────────────────────────────────────────────────────────────
  '/api/clients/{id}/adresses': {
    get: {
      tags: ['Clients - Adresses'],
      summary: 'Liste des adresses d\'un client',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Liste des adresses'), ...resErr(401, 404) },
    },
    post: {
      tags: ['Clients - Adresses'],
      summary: 'Ajouter une adresse',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateAdresseRequest'),
      responses: { ...res201('Adresse créée', 'ClientAdresse'), ...resErr(400, 401, 404) },
    },
  },
  '/api/clients/{id}/adresses/{adresseId}': {
    put: {
      tags: ['Clients - Adresses'],
      summary: 'Modifier une adresse',
      security: bearer,
      parameters: [idParam, adresseIdParam],
      requestBody: jsonBody('CreateAdresseRequest'),
      responses: { ...res200('Adresse mise à jour', 'ClientAdresse'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Clients - Adresses'],
      summary: 'Supprimer une adresse',
      security: bearer,
      parameters: [idParam, adresseIdParam],
      responses: { ...res200('Adresse supprimée'), ...resErr(401, 404) },
    },
  },

  // ── Contacts ─────────────────────────────────────────────────────────────
  '/api/clients/{id}/contacts': {
    get: {
      tags: ['Clients - Contacts'],
      summary: 'Liste des contacts d\'un client',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Liste des contacts'), ...resErr(401, 404) },
    },
    post: {
      tags: ['Clients - Contacts'],
      summary: 'Ajouter un contact',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateContactRequest'),
      responses: { ...res201('Contact créé', 'ClientContact'), ...resErr(400, 401, 404) },
    },
  },
  '/api/clients/{id}/contacts/{contactId}': {
    put: {
      tags: ['Clients - Contacts'],
      summary: 'Modifier un contact',
      security: bearer,
      parameters: [idParam, contactIdParam],
      requestBody: jsonBody('CreateContactRequest'),
      responses: { ...res200('Contact mis à jour', 'ClientContact'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Clients - Contacts'],
      summary: 'Supprimer un contact',
      security: bearer,
      parameters: [idParam, contactIdParam],
      responses: { ...res200('Contact supprimé'), ...resErr(401, 404) },
    },
  },

  // ── Documents ────────────────────────────────────────────────────────────
  '/api/clients/{id}/documents': {
    get: {
      tags: ['Clients - Documents'],
      summary: 'Liste des documents d\'un client',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Liste des documents'), ...resErr(401, 404) },
    },
    post: {
      tags: ['Clients - Documents'],
      summary: 'Ajouter un document',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateDocumentRequest'),
      responses: { ...res201('Document créé', 'ClientDocument'), ...resErr(400, 401, 404) },
    },
  },
  '/api/clients/{id}/documents/{documentId}': {
    delete: {
      tags: ['Clients - Documents'],
      summary: 'Supprimer un document',
      security: bearer,
      parameters: [idParam, documentIdParam],
      responses: { ...res200('Document supprimé'), ...resErr(401, 404) },
    },
  },
};
