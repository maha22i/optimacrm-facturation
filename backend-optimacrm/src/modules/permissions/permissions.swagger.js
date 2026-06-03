const bearer = [{ bearerAuth: [] }];

function res200(desc) {
  return { 200: { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(403)) map[403] = { description: 'Accès interdit (admin requis)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

const userIdParam = { in: 'path', name: 'userId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID de l\'utilisateur' };

export const permissionsSwaggerPaths = {
  '/api/permissions/available': {
    get: {
      tags: ['Permissions'],
      summary: 'Lister les permissions disponibles',
      description: 'Retourne la liste de toutes les permissions configurables (admin uniquement)',
      security: bearer,
      responses: { ...res200('Liste des permissions'), ...resErr(401, 403) },
    },
  },
  '/api/permissions/user/{userId}': {
    get: {
      tags: ['Permissions'],
      summary: 'Obtenir les permissions d\'un utilisateur',
      security: bearer,
      parameters: [userIdParam],
      responses: { ...res200('Permissions de l\'utilisateur'), ...resErr(401, 403, 404) },
    },
    put: {
      tags: ['Permissions'],
      summary: 'Définir les permissions d\'un utilisateur',
      security: bearer,
      parameters: [userIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['permissions'],
              properties: {
                permissions: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['clients_read', 'clients_write', 'factures_read'],
                },
              },
            },
          },
        },
      },
      responses: { ...res200('Permissions mises à jour'), ...resErr(401, 403, 404) },
    },
  },
};
