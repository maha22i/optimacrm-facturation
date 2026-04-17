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

const famIdParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de la famille' };
const unitIdParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de l\'unité' };

export const famillesUnitesSwaggerSchemas = {
  FamilleProduit: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      nom: { type: 'string', example: 'COPIEUR' },
      categorie: { type: 'string', enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'] },
      description: { type: 'string', nullable: true },
      actif: { type: 'boolean' },
      nb_produits: { type: 'integer' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateFamilleRequest: {
    type: 'object',
    required: ['nom', 'categorie'],
    properties: {
      nom: { type: 'string', example: 'COPIEUR MULTIFONCTION' },
      categorie: { type: 'string', enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'] },
      description: { type: 'string' },
    },
  },
  Unite: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      nom: { type: 'string', example: 'mois' },
      actif: { type: 'boolean' },
      nb_produits: { type: 'integer' },
    },
  },
  CreateUniteRequest: {
    type: 'object',
    required: ['nom'],
    properties: {
      nom: { type: 'string', example: 'licence' },
    },
  },
};

export const famillesUnitesSwaggerPaths = {
  '/api/referentiel/familles': {
    get: {
      tags: ['Référentiel - Familles'],
      summary: 'Liste des familles de produits (avec nombre de produits liés)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'actif', schema: { type: 'boolean' } },
      ],
      responses: { ...res200('Liste familles'), ...resErr(401) },
    },
    post: {
      tags: ['Référentiel - Familles'],
      summary: 'Créer une famille de produits',
      security: bearer,
      requestBody: jsonBody('CreateFamilleRequest'),
      responses: { ...res201('Famille créée', 'FamilleProduit'), ...resErr(400, 401, 409) },
    },
  },
  '/api/referentiel/familles/{id}': {
    put: {
      tags: ['Référentiel - Familles'],
      summary: 'Modifier une famille de produits',
      security: bearer,
      parameters: [famIdParam],
      requestBody: jsonBody('CreateFamilleRequest'),
      responses: { ...res200('Famille mise à jour', 'FamilleProduit'), ...resErr(400, 401, 404, 409) },
    },
    delete: {
      tags: ['Référentiel - Familles'],
      summary: 'Désactiver une famille (soft delete)',
      description: 'Impossible si des produits y sont liés.',
      security: bearer,
      parameters: [famIdParam],
      responses: { ...res200('Famille désactivée'), ...resErr(401, 404, 409) },
    },
  },
  '/api/referentiel/unites': {
    get: {
      tags: ['Référentiel - Unités'],
      summary: 'Liste des unités de mesure (avec nombre de produits liés)',
      security: bearer,
      responses: { ...res200('Liste unités'), ...resErr(401) },
    },
    post: {
      tags: ['Référentiel - Unités'],
      summary: 'Créer une unité de mesure',
      security: bearer,
      requestBody: jsonBody('CreateUniteRequest'),
      responses: { ...res201('Unité créée', 'Unite'), ...resErr(400, 401, 409) },
    },
  },
  '/api/referentiel/unites/{id}': {
    delete: {
      tags: ['Référentiel - Unités'],
      summary: 'Supprimer une unité',
      description: 'Impossible si des produits utilisent cette unité.',
      security: bearer,
      parameters: [unitIdParam],
      responses: { ...res200('Unité supprimée'), ...resErr(401, 404, 409) },
    },
  },
};
