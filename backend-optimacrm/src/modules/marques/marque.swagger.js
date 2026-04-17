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

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de la marque' };

export const marqueSwaggerSchemas = {
  Marque: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      nom: { type: 'string', example: 'Sharp' },
      logo_url: { type: 'string', nullable: true },
      site_web: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      actif: { type: 'boolean' },
      nb_produits: { type: 'integer', description: 'Nombre de produits liés' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateMarqueRequest: {
    type: 'object',
    required: ['nom'],
    properties: {
      nom: { type: 'string', example: 'Sharp' },
      site_web: { type: 'string' },
      notes: { type: 'string' },
    },
  },
};

export const marqueSwaggerPaths = {
  '/api/marques': {
    get: {
      tags: ['Marques'],
      summary: 'Liste des marques (avec nombre de produits liés)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Recherche par nom' },
        { in: 'query', name: 'actif', schema: { type: 'boolean' } },
      ],
      responses: { ...res200('Liste marques'), ...resErr(401) },
    },
    post: {
      tags: ['Marques'],
      summary: 'Créer une marque',
      security: bearer,
      requestBody: jsonBody('CreateMarqueRequest'),
      responses: { ...res201('Marque créée', 'Marque'), ...resErr(400, 401, 409) },
    },
  },
  '/api/marques/{id}': {
    put: {
      tags: ['Marques'],
      summary: 'Modifier une marque',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateMarqueRequest'),
      responses: { ...res200('Marque mise à jour', 'Marque'), ...resErr(400, 401, 404, 409) },
    },
    delete: {
      tags: ['Marques'],
      summary: 'Désactiver une marque (soft delete)',
      description: 'Impossible si des produits y sont liés.',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Marque désactivée'), ...resErr(401, 404, 409) },
    },
  },
  '/api/marques/{id}/logo': {
    post: {
      tags: ['Marques'],
      summary: 'Uploader le logo d\'une marque',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } } } },
      },
      responses: { ...res200('Logo uploadé'), ...resErr(400, 401, 404) },
    },
  },
};
