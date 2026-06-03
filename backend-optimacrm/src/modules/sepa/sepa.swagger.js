const bearer = [{ bearerAuth: [] }];

function jsonBody(ref) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}
function res200(desc, ref) {
  return { 200: { description: desc, content: { 'application/json': { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(400)) map[400] = { description: 'Erreur de validation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

export const sepaSwaggerSchemas = {
  SepaCreancier: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      ics: { type: 'string', example: 'FR72ZZZ123456' },
      nom: { type: 'string' },
      iban: { type: 'string' },
      bic: { type: 'string' },
      adresse: { type: 'string' },
      code_postal: { type: 'string' },
      ville: { type: 'string' },
      pays: { type: 'string', default: 'FR' },
    },
  },
  UpsertCreancierRequest: {
    type: 'object',
    required: ['ics', 'nom', 'iban', 'bic'],
    properties: {
      ics: { type: 'string', example: 'FR72ZZZ123456' },
      nom: { type: 'string' },
      iban: { type: 'string' },
      bic: { type: 'string' },
      adresse: { type: 'string' },
      code_postal: { type: 'string' },
      ville: { type: 'string' },
      pays: { type: 'string', default: 'FR' },
    },
  },
  GenererRemiseRequest: {
    type: 'object',
    required: ['facture_ids'],
    properties: {
      facture_ids: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
      date_prelevement: { type: 'string', format: 'date' },
    },
  },
  SepaRemise: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      msg_id: { type: 'string' },
      nb_transactions: { type: 'integer' },
      montant_total: { type: 'number' },
      date_prelevement: { type: 'string', format: 'date' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
};

export const sepaSwaggerPaths = {
  '/api/sepa/creancier': {
    get: {
      tags: ['SEPA'],
      summary: 'Obtenir les paramètres créancier SEPA',
      security: bearer,
      responses: { ...res200('Paramètres créancier', 'SepaCreancier'), ...resErr(401) },
    },
    post: {
      tags: ['SEPA'],
      summary: 'Créer/Mettre à jour les paramètres créancier SEPA',
      security: bearer,
      requestBody: jsonBody('UpsertCreancierRequest'),
      responses: { ...res200('Paramètres sauvegardés', 'SepaCreancier'), ...resErr(400, 401) },
    },
  },
  '/api/sepa/factures-eligibles': {
    get: {
      tags: ['SEPA'],
      summary: 'Lister les factures éligibles au prélèvement SEPA',
      security: bearer,
      responses: { ...res200('Factures éligibles'), ...resErr(401) },
    },
  },
  '/api/sepa/generer': {
    post: {
      tags: ['SEPA'],
      summary: 'Générer un fichier de remise SEPA (XML)',
      security: bearer,
      requestBody: jsonBody('GenererRemiseRequest'),
      responses: { ...res200('Remise générée', 'SepaRemise'), ...resErr(400, 401) },
    },
  },
  '/api/sepa/remises': {
    get: {
      tags: ['SEPA'],
      summary: 'Historique des remises SEPA',
      security: bearer,
      responses: { ...res200('Liste des remises'), ...resErr(401) },
    },
  },
  '/api/sepa/remises/{id}': {
    get: {
      tags: ['SEPA'],
      summary: 'Détails d\'une remise SEPA',
      security: bearer,
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
      responses: { ...res200('Détail de la remise'), ...resErr(401, 404) },
    },
  },
  '/api/sepa/remises/{id}/xml': {
    get: {
      tags: ['SEPA'],
      summary: 'Télécharger le fichier XML d\'une remise SEPA',
      security: bearer,
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Fichier XML SEPA', content: { 'application/xml': { schema: { type: 'string' } } } },
        ...resErr(401, 404),
      },
    },
  },
};
