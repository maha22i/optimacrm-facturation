const bearer = [{ bearerAuth: [] }];

function res200(desc) {
  return { 200: { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(403)) map[403] = { description: 'Accès interdit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

export const activityLogSwaggerSchemas = {
  ActivityLog: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      user_id: { type: 'string', format: 'uuid' },
      user_nom: { type: 'string' },
      action: { type: 'string', example: 'facture_creee' },
      module: { type: 'string', example: 'factures' },
      description: { type: 'string' },
      entity_type: { type: 'string', example: 'facture' },
      entity_id: { type: 'integer' },
      entity_label: { type: 'string' },
      details: { type: 'object' },
      statut: { type: 'string' },
      ip_address: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
};

export const activityLogSwaggerPaths = {
  '/api/activity-logs': {
    get: {
      tags: ['Journal d\'activité'],
      summary: 'Lister les logs d\'activité (paginé)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
        { in: 'query', name: 'module', schema: { type: 'string' }, description: 'Filtrer par module (factures, contrats, clients...)' },
        { in: 'query', name: 'action', schema: { type: 'string' } },
        { in: 'query', name: 'user_id', schema: { type: 'integer' } },
        { in: 'query', name: 'statut', schema: { type: 'string' } },
        { in: 'query', name: 'date_debut', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'date_fin', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
      ],
      responses: { ...res200('Logs paginés'), ...resErr(401, 403) },
    },
  },
  '/api/activity-logs/stats': {
    get: {
      tags: ['Journal d\'activité'],
      summary: 'Statistiques des logs d\'activité',
      security: bearer,
      parameters: [
        { in: 'query', name: 'module', schema: { type: 'string' } },
        { in: 'query', name: 'date_debut', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'date_fin', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
      ],
      responses: { ...res200('Statistiques'), ...resErr(401, 403) },
    },
  },
  '/api/activity-logs/{entityType}/{entityId}': {
    get: {
      tags: ['Journal d\'activité'],
      summary: 'Historique d\'une entité spécifique',
      security: bearer,
      parameters: [
        { in: 'path', name: 'entityType', required: true, schema: { type: 'string' }, description: 'Type d\'entité (facture, contrat, client...)' },
        { in: 'path', name: 'entityId', required: true, schema: { type: 'integer' }, description: 'ID de l\'entité' },
      ],
      responses: { ...res200('Historique de l\'entité'), ...resErr(401, 403) },
    },
  },
};
