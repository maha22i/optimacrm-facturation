const bearer = [{ bearerAuth: [] }];

function res200(desc) {
  return { 200: { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(400)) map[400] = { description: 'Erreur de validation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(409)) map[409] = { description: 'Conflit (factures liées existantes)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de l\'import' };

export const importsRelevesSwaggerSchemas = {
  ImportReleves: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero_batch: { type: 'string' },
      statut: { type: 'string', enum: ['En cours', 'Terminé', 'Annulé', 'Erreur'] },
      nb_lignes_fichier: { type: 'integer' },
      nb_releves_crees: { type: 'integer' },
      nb_factures_generees: { type: 'integer' },
      nb_erreurs: { type: 'integer' },
      fichier_hash: { type: 'string' },
      rapport_erreurs: { type: 'array', items: { type: 'object' } },
      user_id: { type: 'string', format: 'uuid' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
};

export const importsRelevesSwaggerPaths = {
  '/api/imports-releves': {
    get: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Lister l\'historique des imports de relevés (paginé)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        { in: 'query', name: 'statut', schema: { type: 'string' } },
        { in: 'query', name: 'user_id', schema: { type: 'string' } },
        { in: 'query', name: 'date_debut', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'date_fin', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
      ],
      responses: { ...res200('Historique des imports'), ...resErr(401) },
    },
  },
  '/api/imports-releves/stats': {
    get: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Statistiques des imports de relevés',
      security: bearer,
      responses: { ...res200('Statistiques'), ...resErr(401) },
    },
  },
  '/api/imports-releves/check-duplicate': {
    post: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Vérifier si un fichier a déjà été importé',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['hash'],
              properties: {
                hash: { type: 'string', description: 'Hash SHA-256 du fichier' },
              },
            },
          },
        },
      },
      responses: { ...res200('Résultat de la vérification'), ...resErr(400, 401) },
    },
  },
  '/api/imports-releves/{id}': {
    get: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Détails d\'un import',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Détail de l\'import'), ...resErr(401, 404) },
    },
    delete: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Annuler un import (supprime les relevés créés)',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['motif'],
              properties: {
                motif: { type: 'string', example: 'Données incorrectes' },
              },
            },
          },
        },
      },
      responses: { ...res200('Import annulé'), ...resErr(400, 401, 404, 409) },
    },
  },
  '/api/imports-releves/{id}/releves': {
    get: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Relevés créés par un import',
      security: bearer,
      parameters: [
        idParam,
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
      ],
      responses: { ...res200('Relevés de l\'import'), ...resErr(401, 404) },
    },
  },
  '/api/imports-releves/{id}/factures': {
    get: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Factures générées par un import',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Factures liées'), ...resErr(401, 404) },
    },
  },
  '/api/imports-releves/{id}/rapport': {
    get: {
      tags: ['Imports Relevés - Historique'],
      summary: 'Rapport d\'erreurs d\'un import (JSON ou CSV)',
      security: bearer,
      parameters: [
        idParam,
        { in: 'query', name: 'format', schema: { type: 'string', enum: ['json', 'csv'] } },
      ],
      responses: { ...res200('Rapport'), ...resErr(401, 404) },
    },
  },
};
