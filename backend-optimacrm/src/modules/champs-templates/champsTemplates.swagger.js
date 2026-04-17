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

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID du template' };

export const champsTemplatesSwaggerSchemas = {
  ChampTemplate: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      label: { type: 'string', example: 'Durée du contrat' },
      cle: { type: 'string', example: 'duree_contrat' },
      type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'] },
      valeur_defaut: { type: 'string', nullable: true },
      options_liste: { type: 'array', items: { type: 'string' }, nullable: true },
      categorie: { type: 'string', example: 'Contrat' },
      actif: { type: 'boolean' },
      afficher_sur_pdf: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateChampTemplateRequest: {
    type: 'object',
    required: ['label', 'cle'],
    properties: {
      label: { type: 'string', example: 'Durée du contrat' },
      cle: { type: 'string', example: 'duree_contrat' },
      type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'], default: 'TEXTE' },
      valeur_defaut: { type: 'string' },
      options_liste: { type: 'array', items: { type: 'string' } },
      categorie: { type: 'string', default: 'Général' },
      afficher_sur_pdf: { type: 'boolean', default: true },
    },
  },
  UpdateChampTemplateRequest: {
    type: 'object',
    properties: {
      label: { type: 'string' },
      cle: { type: 'string' },
      type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'] },
      valeur_defaut: { type: 'string' },
      options_liste: { type: 'array', items: { type: 'string' } },
      categorie: { type: 'string' },
      actif: { type: 'boolean' },
      afficher_sur_pdf: { type: 'boolean' },
    },
  },
};

export const champsTemplatesSwaggerPaths = {
  '/api/champs-templates': {
    get: {
      tags: ['Champs Templates'],
      summary: 'Liste des templates de champs personnalisés',
      security: bearer,
      parameters: [
        { in: 'query', name: 'categorie', schema: { type: 'string' } },
        { in: 'query', name: 'actif', schema: { type: 'boolean' } },
      ],
      responses: { ...res200('Liste des templates'), ...resErr(401) },
    },
    post: {
      tags: ['Champs Templates'],
      summary: 'Créer un template de champ',
      security: bearer,
      requestBody: jsonBody('CreateChampTemplateRequest'),
      responses: { ...res201('Template créé', 'ChampTemplate'), ...resErr(400, 401, 409) },
    },
  },
  '/api/champs-templates/categories': {
    get: {
      tags: ['Champs Templates'],
      summary: 'Liste des catégories de templates',
      security: bearer,
      responses: { ...res200('Liste des catégories'), ...resErr(401) },
    },
  },
  '/api/champs-templates/{id}': {
    get: {
      tags: ['Champs Templates'],
      summary: 'Détail d\'un template',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Template', 'ChampTemplate'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Champs Templates'],
      summary: 'Modifier un template',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('UpdateChampTemplateRequest'),
      responses: { ...res200('Template mis à jour', 'ChampTemplate'), ...resErr(400, 401, 404, 409) },
    },
    delete: {
      tags: ['Champs Templates'],
      summary: 'Supprimer un template',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Template supprimé'), ...resErr(401, 404) },
    },
  },
};
