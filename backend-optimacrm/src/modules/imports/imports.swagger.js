const bearer = [{ bearerAuth: [] }];

function res200(desc) {
  return { 200: { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(400)) map[400] = { description: 'Erreur de validation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(403)) map[403] = { description: 'Accès interdit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

function fileUploadBody() {
  return {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['file'],
          properties: {
            file: { type: 'string', format: 'binary', description: 'Fichier CSV ou XLSX (max 20 Mo)' },
          },
        },
      },
    },
  };
}

function inlineBody(schema) {
  return { required: true, content: { 'application/json': { schema } } };
}

const mappingIdParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID du mapping' };

// ── Import Catalogue ──────────────────────────────────────────────────────────

export const importCatalogueSwaggerPaths = {
  '/api/import/catalogue/parse': {
    post: {
      tags: ['Import - Catalogue'],
      summary: 'Parser un fichier d\'import catalogue',
      description: 'Analyse le fichier et retourne les colonnes détectées + aperçu des données',
      security: bearer,
      requestBody: fileUploadBody(),
      responses: { ...res200('Fichier parsé avec succès'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/catalogue/validate': {
    post: {
      tags: ['Import - Catalogue'],
      summary: 'Valider les données mappées avant import',
      security: bearer,
      requestBody: inlineBody({
        type: 'object',
        properties: {
          mapping: { type: 'object', description: 'Correspondance colonnes fichier → champs BD' },
          data: { type: 'array', items: { type: 'object' } },
        },
      }),
      responses: { ...res200('Résultat de la validation'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/catalogue/execute': {
    post: {
      tags: ['Import - Catalogue'],
      summary: 'Exécuter l\'import catalogue',
      security: bearer,
      requestBody: inlineBody({
        type: 'object',
        properties: {
          mapping: { type: 'object' },
          data: { type: 'array', items: { type: 'object' } },
          options: { type: 'object', properties: { mode: { type: 'string', enum: ['create', 'update', 'upsert'] } } },
        },
      }),
      responses: { ...res200('Import exécuté'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/catalogue/mappings': {
    get: {
      tags: ['Import - Catalogue'],
      summary: 'Lister les mappings sauvegardés',
      security: bearer,
      responses: { ...res200('Mappings'), ...resErr(401, 403) },
    },
    post: {
      tags: ['Import - Catalogue'],
      summary: 'Sauvegarder un mapping',
      security: bearer,
      requestBody: inlineBody({
        type: 'object',
        required: ['nom', 'mapping'],
        properties: {
          nom: { type: 'string', example: 'Import produits standard' },
          mapping: { type: 'object' },
        },
      }),
      responses: { ...res200('Mapping sauvegardé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/catalogue/mappings/{id}': {
    delete: {
      tags: ['Import - Catalogue'],
      summary: 'Supprimer un mapping sauvegardé',
      security: bearer,
      parameters: [mappingIdParam],
      responses: { ...res200('Mapping supprimé'), ...resErr(401, 403, 404) },
    },
  },
};

// ── Import Contrats ───────────────────────────────────────────────────────────

export const importContratsSwaggerPaths = {
  '/api/import/contrats/parse': {
    post: {
      tags: ['Import - Contrats'],
      summary: 'Parser un fichier d\'import contrats',
      security: bearer,
      requestBody: fileUploadBody(),
      responses: { ...res200('Fichier parsé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/contrats/validate': {
    post: {
      tags: ['Import - Contrats'],
      summary: 'Valider les données mappées avant import',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Résultat de la validation'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/contrats/execute': {
    post: {
      tags: ['Import - Contrats'],
      summary: 'Exécuter l\'import contrats',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Import exécuté'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/contrats/mappings': {
    get: {
      tags: ['Import - Contrats'],
      summary: 'Lister les mappings sauvegardés',
      security: bearer,
      responses: { ...res200('Mappings'), ...resErr(401, 403) },
    },
    post: {
      tags: ['Import - Contrats'],
      summary: 'Sauvegarder un mapping',
      security: bearer,
      requestBody: inlineBody({ type: 'object', required: ['nom', 'mapping'], properties: { nom: { type: 'string' }, mapping: { type: 'object' } } }),
      responses: { ...res200('Mapping sauvegardé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/contrats/mappings/{id}': {
    delete: {
      tags: ['Import - Contrats'],
      summary: 'Supprimer un mapping',
      security: bearer,
      parameters: [mappingIdParam],
      responses: { ...res200('Mapping supprimé'), ...resErr(401, 403, 404) },
    },
  },
};

// ── Import Clients ────────────────────────────────────────────────────────────

export const importClientsSwaggerPaths = {
  '/api/import/clients/parse': {
    post: {
      tags: ['Import - Clients'],
      summary: 'Parser un fichier d\'import clients',
      security: bearer,
      requestBody: fileUploadBody(),
      responses: { ...res200('Fichier parsé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/clients/validate': {
    post: {
      tags: ['Import - Clients'],
      summary: 'Valider les données mappées avant import',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Résultat de la validation'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/clients/execute': {
    post: {
      tags: ['Import - Clients'],
      summary: 'Exécuter l\'import clients',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Import exécuté'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/clients/mappings': {
    get: {
      tags: ['Import - Clients'],
      summary: 'Lister les mappings sauvegardés',
      security: bearer,
      responses: { ...res200('Mappings'), ...resErr(401, 403) },
    },
    post: {
      tags: ['Import - Clients'],
      summary: 'Sauvegarder un mapping',
      security: bearer,
      requestBody: inlineBody({ type: 'object', required: ['nom', 'mapping'], properties: { nom: { type: 'string' }, mapping: { type: 'object' } } }),
      responses: { ...res200('Mapping sauvegardé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/clients/mappings/{id}': {
    delete: {
      tags: ['Import - Clients'],
      summary: 'Supprimer un mapping',
      security: bearer,
      parameters: [mappingIdParam],
      responses: { ...res200('Mapping supprimé'), ...resErr(401, 403, 404) },
    },
  },
};

// ── Import Parc ───────────────────────────────────────────────────────────────

export const importParcSwaggerPaths = {
  '/api/import/parc/machines/parse': {
    post: {
      tags: ['Import - Parc Machines'],
      summary: 'Parser un fichier d\'import machines',
      security: bearer,
      requestBody: fileUploadBody(),
      responses: { ...res200('Fichier parsé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/parc/machines/validate': {
    post: {
      tags: ['Import - Parc Machines'],
      summary: 'Valider les données d\'import machines',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Résultat de la validation'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/parc/machines/execute': {
    post: {
      tags: ['Import - Parc Machines'],
      summary: 'Exécuter l\'import machines',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Import exécuté'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/parc/releves/parse': {
    post: {
      tags: ['Import - Parc Machines'],
      summary: 'Parser un fichier d\'import relevés',
      security: bearer,
      requestBody: fileUploadBody(),
      responses: { ...res200('Fichier parsé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/parc/releves/validate': {
    post: {
      tags: ['Import - Parc Machines'],
      summary: 'Valider les données d\'import relevés',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Résultat de la validation'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/parc/releves/execute': {
    post: {
      tags: ['Import - Parc Machines'],
      summary: 'Exécuter l\'import relevés',
      security: bearer,
      requestBody: inlineBody({ type: 'object', properties: { mapping: { type: 'object' }, data: { type: 'array', items: { type: 'object' } } } }),
      responses: { ...res200('Import exécuté'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/parc/mappings': {
    get: {
      tags: ['Import - Parc Machines'],
      summary: 'Lister les mappings sauvegardés',
      security: bearer,
      responses: { ...res200('Mappings'), ...resErr(401, 403) },
    },
    post: {
      tags: ['Import - Parc Machines'],
      summary: 'Sauvegarder un mapping',
      security: bearer,
      requestBody: inlineBody({ type: 'object', required: ['nom', 'mapping'], properties: { nom: { type: 'string' }, mapping: { type: 'object' } } }),
      responses: { ...res200('Mapping sauvegardé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/import/parc/mappings/{id}': {
    delete: {
      tags: ['Import - Parc Machines'],
      summary: 'Supprimer un mapping',
      security: bearer,
      parameters: [mappingIdParam],
      responses: { ...res200('Mapping supprimé'), ...resErr(401, 403, 404) },
    },
  },
};

// ── Import Relevés Compteurs ──────────────────────────────────────────────────

export const importRelevesCompteursSwaggerPaths = {
  '/api/releves-compteurs/import/parse': {
    post: {
      tags: ['Import - Relevés Compteurs'],
      summary: 'Parser un fichier d\'import de relevés de compteurs',
      description: 'Analyse le fichier Excel/CSV et retourne les données structurées pour analyse',
      security: bearer,
      requestBody: fileUploadBody(),
      responses: { ...res200('Fichier parsé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/releves-compteurs/import/analyze': {
    post: {
      tags: ['Import - Relevés Compteurs'],
      summary: 'Analyser et préparer les relevés pour import',
      description: 'Analyse les données, détecte les machines, calcule les volumes',
      security: bearer,
      requestBody: inlineBody({
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'object' } },
          mapping: { type: 'object' },
        },
      }),
      responses: { ...res200('Analyse terminée'), ...resErr(400, 401, 403) },
    },
  },
  '/api/releves-compteurs/import/execute': {
    post: {
      tags: ['Import - Relevés Compteurs'],
      summary: 'Exécuter l\'import des relevés de compteurs',
      description: 'Crée les relevés et génère les factures si applicable',
      security: bearer,
      requestBody: inlineBody({
        type: 'object',
        properties: {
          releves: { type: 'array', items: { type: 'object' } },
          options: { type: 'object' },
        },
      }),
      responses: { ...res200('Import exécuté'), ...resErr(400, 401, 403) },
    },
  },
};
