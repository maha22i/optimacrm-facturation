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

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID du fournisseur' };

export const fournisseurSwaggerSchemas = {
  Fournisseur: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      nom: { type: 'string', example: 'Canon France' },
      code: { type: 'string', nullable: true, example: 'CANON' },
      type: { type: 'string', enum: ['FOURNISSEUR', 'OPERATEUR_TELECOM', 'CONSTRUCTEUR', 'DISTRIBUTEUR', 'AUTRE'] },
      contact_nom: { type: 'string', nullable: true },
      contact_prenom: { type: 'string', nullable: true },
      contact_email: { type: 'string', nullable: true },
      contact_telephone: { type: 'string', nullable: true },
      adresse_ligne1: { type: 'string', nullable: true },
      adresse_ligne2: { type: 'string', nullable: true },
      code_postal: { type: 'string', nullable: true },
      ville: { type: 'string', nullable: true },
      pays: { type: 'string', default: 'France' },
      site_web: { type: 'string', nullable: true },
      numero_compte_client: { type: 'string', nullable: true },
      conditions_paiement: { type: 'string', nullable: true },
      delai_livraison_jours: { type: 'integer', nullable: true },
      notes: { type: 'string', nullable: true },
      actif: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateFournisseurRequest: {
    type: 'object',
    required: ['nom'],
    properties: {
      nom: { type: 'string', example: 'Canon France' },
      code: { type: 'string', example: 'CANON' },
      type: { type: 'string', enum: ['FOURNISSEUR', 'OPERATEUR_TELECOM', 'CONSTRUCTEUR', 'DISTRIBUTEUR', 'AUTRE'], default: 'FOURNISSEUR' },
      contact_nom: { type: 'string' },
      contact_prenom: { type: 'string' },
      contact_email: { type: 'string', format: 'email' },
      contact_telephone: { type: 'string' },
      adresse_ligne1: { type: 'string' },
      adresse_ligne2: { type: 'string' },
      code_postal: { type: 'string' },
      ville: { type: 'string' },
      pays: { type: 'string', default: 'France' },
      site_web: { type: 'string' },
      numero_compte_client: { type: 'string' },
      conditions_paiement: { type: 'string' },
      delai_livraison_jours: { type: 'integer' },
      notes: { type: 'string' },
    },
  },
  PaginatedFournisseurs: {
    type: 'object',
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/Fournisseur' } },
      pagination: {
        type: 'object',
        properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } },
      },
    },
  },
};

export const fournisseurSwaggerPaths = {
  '/api/fournisseurs': {
    get: {
      tags: ['Fournisseurs'],
      summary: 'Liste paginée des fournisseurs',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        { in: 'query', name: 'type', schema: { type: 'string', enum: ['FOURNISSEUR', 'OPERATEUR_TELECOM', 'CONSTRUCTEUR', 'DISTRIBUTEUR', 'AUTRE'] } },
        { in: 'query', name: 'actif', schema: { type: 'boolean' } },
        { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Recherche par nom ou code' },
      ],
      responses: { ...res200('Liste fournisseurs', 'PaginatedFournisseurs'), ...resErr(401) },
    },
    post: {
      tags: ['Fournisseurs'],
      summary: 'Créer un fournisseur',
      security: bearer,
      requestBody: jsonBody('CreateFournisseurRequest'),
      responses: { ...res201('Fournisseur créé', 'Fournisseur'), ...resErr(400, 401, 409) },
    },
  },
  '/api/fournisseurs/{id}': {
    get: {
      tags: ['Fournisseurs'],
      summary: 'Détail d\'un fournisseur',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Fournisseur', 'Fournisseur'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Fournisseurs'],
      summary: 'Modifier un fournisseur',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateFournisseurRequest'),
      responses: { ...res200('Fournisseur mis à jour', 'Fournisseur'), ...resErr(400, 401, 404, 409) },
    },
    delete: {
      tags: ['Fournisseurs'],
      summary: 'Désactiver un fournisseur (soft delete)',
      description: 'Impossible si des produits y sont liés.',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Fournisseur désactivé'), ...resErr(401, 404, 409) },
    },
  },
};
