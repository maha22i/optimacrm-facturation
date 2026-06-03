const bearer = [{ bearerAuth: [] }];

function jsonBody(ref) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}
function inlineBody(schema) {
  return { required: true, content: { 'application/json': { schema } } };
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
  return map;
}

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de la configuration de champ' };
const entiteParam = { in: 'path', name: 'entite', required: true, schema: { type: 'string', enum: ['CLIENT', 'DEVIS', 'CATALOGUE', 'CONTRAT'] } };

export const champsConfigSwaggerSchemas = {
  ChampConfig: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      entite: { type: 'string', enum: ['CLIENT', 'DEVIS', 'CATALOGUE', 'CONTRAT'] },
      section: { type: 'string' },
      label: { type: 'string' },
      cle: { type: 'string' },
      type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'] },
      options: { type: 'array', items: { type: 'string' }, description: 'Options pour le type LISTE' },
      obligatoire: { type: 'boolean' },
      ordre: { type: 'integer' },
      actif: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateChampConfigRequest: {
    type: 'object',
    required: ['entite', 'section', 'label', 'cle'],
    properties: {
      entite: { type: 'string', enum: ['CLIENT', 'DEVIS', 'CATALOGUE', 'CONTRAT'] },
      section: { type: 'string', minLength: 1, maxLength: 100 },
      label: { type: 'string', minLength: 1, maxLength: 255 },
      cle: { type: 'string', minLength: 1, maxLength: 100 },
      type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'], default: 'TEXTE' },
      options: { type: 'array', items: { type: 'string' } },
      obligatoire: { type: 'boolean', default: false },
    },
  },
};

export const champsConfigSwaggerPaths = {
  '/api/champs-config': {
    get: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Lister toutes les configurations de champs',
      security: bearer,
      responses: { ...res200('Configurations'), ...resErr(401) },
    },
    post: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Créer une configuration de champ personnalisé',
      security: bearer,
      requestBody: jsonBody('CreateChampConfigRequest'),
      responses: { ...res201('Configuration créée', 'ChampConfig'), ...resErr(400, 401) },
    },
  },
  '/api/champs-config/sections': {
    get: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Lister les sections par entité',
      security: bearer,
      responses: { ...res200('Sections'), ...resErr(401) },
    },
  },
  '/api/champs-config/sections/{entite}/ordre': {
    put: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Réordonner les sections d\'une entité',
      security: bearer,
      parameters: [entiteParam],
      requestBody: inlineBody({
        type: 'object',
        properties: {
          ordre: { type: 'array', items: { type: 'string' }, description: 'Sections dans l\'ordre souhaité' },
        },
      }),
      responses: { ...res200('Ordre mis à jour'), ...resErr(401) },
    },
  },
  '/api/champs-config/sections/{entite}/rename': {
    put: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Renommer une section',
      security: bearer,
      parameters: [entiteParam],
      requestBody: inlineBody({
        type: 'object',
        required: ['ancien_nom', 'nouveau_nom'],
        properties: {
          ancien_nom: { type: 'string' },
          nouveau_nom: { type: 'string' },
        },
      }),
      responses: { ...res200('Section renommée'), ...resErr(400, 401) },
    },
  },
  '/api/champs-config/sections/{entite}/{section}': {
    delete: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Supprimer une section et ses champs',
      security: bearer,
      parameters: [
        entiteParam,
        { in: 'path', name: 'section', required: true, schema: { type: 'string' } },
      ],
      responses: { ...res200('Section supprimée'), ...resErr(401, 404) },
    },
  },
  '/api/champs-config/valeurs/{entite}/{entiteId}': {
    get: {
      tags: ['Champs personnalisés - Valeurs'],
      summary: 'Obtenir les champs configurés avec leurs valeurs pour une entité',
      security: bearer,
      parameters: [
        entiteParam,
        { in: 'path', name: 'entiteId', required: true, schema: { type: 'integer' } },
      ],
      responses: { ...res200('Configurations avec valeurs'), ...resErr(401) },
    },
    put: {
      tags: ['Champs personnalisés - Valeurs'],
      summary: 'Sauvegarder les valeurs des champs personnalisés',
      security: bearer,
      parameters: [
        entiteParam,
        { in: 'path', name: 'entiteId', required: true, schema: { type: 'integer' } },
      ],
      requestBody: inlineBody({
        type: 'object',
        description: 'Clé-valeur des champs personnalisés',
        additionalProperties: true,
      }),
      responses: { ...res200('Valeurs sauvegardées'), ...resErr(400, 401) },
    },
  },
  '/api/champs-config/{id}': {
    get: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Détails d\'une configuration de champ',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Configuration', 'ChampConfig'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Modifier une configuration de champ',
      security: bearer,
      parameters: [idParam],
      requestBody: inlineBody({
        type: 'object',
        properties: {
          label: { type: 'string' },
          cle: { type: 'string' },
          type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'] },
          actif: { type: 'boolean' },
          options: { type: 'array', items: { type: 'string' } },
          obligatoire: { type: 'boolean' },
        },
      }),
      responses: { ...res200('Configuration mise à jour', 'ChampConfig'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Champs personnalisés - Config'],
      summary: 'Supprimer une configuration de champ',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Configuration supprimée'), ...resErr(401, 404) },
    },
  },
};
