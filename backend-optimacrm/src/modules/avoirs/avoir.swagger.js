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
  if (codes.includes(409)) map[409] = { description: 'Conflit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de l\'avoir' };

export const avoirSwaggerSchemas = {
  Avoir: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero: { type: 'string', example: 'AV-2025-001' },
      facture_id: { type: 'integer' },
      numero_facture: { type: 'string' },
      client_id: { type: 'integer' },
      client_raison_sociale: { type: 'string' },
      type_avoir: { type: 'string', enum: ['TOTAL', 'PARTIEL'] },
      statut: { type: 'string', enum: ['BROUILLON', 'VALIDE', 'UTILISE', 'ANNULE'] },
      montant_ht: { type: 'number' },
      montant_tva: { type: 'number' },
      montant_ttc: { type: 'number' },
      motif: { type: 'string' },
      mode_utilisation: { type: 'string', enum: ['IMPUTATION', 'REMBOURSEMENT'], nullable: true },
      facture_imputee_id: { type: 'integer', nullable: true },
      date_avoir: { type: 'string', format: 'date' },
      lignes: { type: 'array', items: { type: 'object' } },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateAvoirRequest: {
    type: 'object',
    required: ['facture_id', 'type_avoir'],
    properties: {
      facture_id: { type: 'integer' },
      type_avoir: { type: 'string', enum: ['TOTAL', 'PARTIEL'] },
      motif: { type: 'string' },
      lignes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            facture_ligne_id: { type: 'integer' },
            quantite: { type: 'number' },
            montant_ht: { type: 'number' },
          },
        },
      },
    },
  },
  UtiliserAvoirRequest: {
    type: 'object',
    required: ['mode_utilisation'],
    properties: {
      mode_utilisation: { type: 'string', enum: ['IMPUTATION', 'REMBOURSEMENT'] },
      facture_imputee_id: { type: 'integer', description: 'Requis si mode IMPUTATION' },
    },
  },
};

export const avoirSwaggerPaths = {
  '/api/avoirs': {
    get: {
      tags: ['Avoirs'],
      summary: 'Lister les avoirs (paginé)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        { in: 'query', name: 'statut', schema: { type: 'string', enum: ['BROUILLON', 'VALIDE', 'UTILISE', 'ANNULE'] } },
        { in: 'query', name: 'client_id', schema: { type: 'integer' } },
        { in: 'query', name: 'date_debut', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'date_fin', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
      ],
      responses: { ...res200('Liste paginée des avoirs'), ...resErr(401) },
    },
    post: {
      tags: ['Avoirs'],
      summary: 'Créer un avoir',
      security: bearer,
      requestBody: jsonBody('CreateAvoirRequest'),
      responses: { ...res201('Avoir créé', 'Avoir'), ...resErr(400, 401) },
    },
  },
  '/api/avoirs/{id}': {
    get: {
      tags: ['Avoirs'],
      summary: 'Détails d\'un avoir',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Avoir', 'Avoir'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Avoirs'],
      summary: 'Modifier un avoir (brouillon uniquement)',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateAvoirRequest'),
      responses: { ...res200('Avoir mis à jour', 'Avoir'), ...resErr(400, 401, 404) },
    },
  },
  '/api/avoirs/{id}/pdf': {
    get: {
      tags: ['Avoirs'],
      summary: 'Télécharger le PDF d\'un avoir',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: { description: 'PDF généré', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
        ...resErr(401, 404),
      },
    },
  },
  '/api/avoirs/{id}/valider': {
    post: {
      tags: ['Avoirs'],
      summary: 'Valider un avoir',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Avoir validé', 'Avoir'), ...resErr(400, 401, 404) },
    },
  },
  '/api/avoirs/{id}/utiliser': {
    post: {
      tags: ['Avoirs'],
      summary: 'Utiliser un avoir (imputation ou remboursement)',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('UtiliserAvoirRequest'),
      responses: { ...res200('Avoir utilisé', 'Avoir'), ...resErr(400, 401, 404) },
    },
  },
  '/api/avoirs/{id}/annuler': {
    post: {
      tags: ['Avoirs'],
      summary: 'Annuler un avoir',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Avoir annulé', 'Avoir'), ...resErr(400, 401, 404) },
    },
  },
};
