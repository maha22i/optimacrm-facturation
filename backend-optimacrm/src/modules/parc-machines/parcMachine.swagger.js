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

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de la machine' };
const releveIdParam = { in: 'path', name: 'releveId', required: true, schema: { type: 'integer' }, description: 'ID du relevé' };

export const parcMachineSwaggerSchemas = {
  Machine: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero_serie: { type: 'string', example: 'SN-12345' },
      matricule: { type: 'string' },
      designation: { type: 'string' },
      marque: { type: 'string' },
      modele: { type: 'string' },
      categorie: { type: 'string', enum: ['Copieur', 'Téléphonie', 'Informatique'] },
      statut: { type: 'string', enum: ['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'] },
      client_id: { type: 'integer' },
      client_raison_sociale: { type: 'string' },
      site_installation: { type: 'string' },
      numero_contrat: { type: 'string' },
      date_installation: { type: 'string', format: 'date' },
      date_fin_garantie: { type: 'string', format: 'date' },
      date_retrait: { type: 'string', format: 'date' },
      dernier_compteur_nb: { type: 'integer' },
      dernier_compteur_couleur: { type: 'integer' },
      date_dernier_releve: { type: 'string', format: 'date' },
      cout_copie_nb: { type: 'number' },
      cout_copie_couleur: { type: 'number' },
      volume_offert_nb: { type: 'integer' },
      volume_offert_couleur: { type: 'integer' },
      vitesse_ppm: { type: 'integer' },
      format_max: { type: 'string' },
      recto_verso: { type: 'boolean' },
      reseau: { type: 'boolean' },
      reference_produit: { type: 'string' },
      notes: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateMachineRequest: {
    type: 'object',
    required: ['numero_serie', 'designation'],
    properties: {
      numero_serie: { type: 'string', example: 'SN-12345' },
      designation: { type: 'string', example: 'Photocopieur Sharp MX' },
      categorie: { type: 'string', enum: ['Copieur', 'Téléphonie', 'Informatique'] },
      statut: { type: 'string', enum: ['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'] },
      marque: { type: 'string' },
      modele: { type: 'string' },
      client_id: { type: 'integer' },
      site_installation: { type: 'string' },
      date_installation: { type: 'string', format: 'date' },
      notes: { type: 'string' },
    },
  },
  ReleveCompteur: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      machine_id: { type: 'integer' },
      date_releve: { type: 'string', format: 'date' },
      compteur_nb: { type: 'integer' },
      compteur_couleur: { type: 'integer' },
      source: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateReleveRequest: {
    type: 'object',
    required: ['date_releve', 'compteur_nb', 'compteur_couleur'],
    properties: {
      date_releve: { type: 'string', format: 'date' },
      compteur_nb: { type: 'integer', example: 15000 },
      compteur_couleur: { type: 'integer', example: 5000 },
    },
  },
};

export const parcMachineSwaggerPaths = {
  '/api/parc-machines': {
    get: {
      tags: ['Parc Machines'],
      summary: 'Lister les machines (paginé)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'categorie', schema: { type: 'string', enum: ['Copieur', 'Téléphonie', 'Informatique'] } },
        { in: 'query', name: 'statut', schema: { type: 'string', enum: ['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'] } },
        { in: 'query', name: 'client_id', schema: { type: 'integer' } },
        { in: 'query', name: 'alerte_compteur', schema: { type: 'string' } },
        { in: 'query', name: 'sort', schema: { type: 'string' } },
        { in: 'query', name: 'order', schema: { type: 'string', enum: ['asc', 'desc'] } },
      ],
      responses: { ...res200('Liste paginée des machines'), ...resErr(401) },
    },
    post: {
      tags: ['Parc Machines'],
      summary: 'Créer une machine',
      security: bearer,
      requestBody: jsonBody('CreateMachineRequest'),
      responses: { ...res201('Machine créée', 'Machine'), ...resErr(400, 401, 409) },
    },
  },
  '/api/parc-machines/stats': {
    get: {
      tags: ['Parc Machines'],
      summary: 'Statistiques du parc machines',
      security: bearer,
      responses: { ...res200('Statistiques'), ...resErr(401) },
    },
  },
  '/api/parc-machines/check-numero-serie': {
    get: {
      tags: ['Parc Machines'],
      summary: 'Vérifier si un numéro de série existe',
      security: bearer,
      parameters: [
        { in: 'query', name: 'numero_serie', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'exclude_id', schema: { type: 'integer' } },
      ],
      responses: { ...res200('Résultat de la vérification'), ...resErr(401) },
    },
  },
  '/api/parc-machines/by-client/{clientId}': {
    get: {
      tags: ['Parc Machines'],
      summary: 'Machines d\'un client',
      security: bearer,
      parameters: [{ in: 'path', name: 'clientId', required: true, schema: { type: 'integer' } }],
      responses: { ...res200('Machines du client'), ...resErr(401) },
    },
  },
  '/api/parc-machines/export': {
    get: {
      tags: ['Parc Machines'],
      summary: 'Exporter le parc machines (CSV/XLSX)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'format', schema: { type: 'string', enum: ['csv', 'xlsx'], default: 'csv' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'categorie', schema: { type: 'string' } },
        { in: 'query', name: 'statut', schema: { type: 'string' } },
        { in: 'query', name: 'client_id', schema: { type: 'integer' } },
      ],
      responses: {
        200: { description: 'Fichier exporté', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } }, 'text/csv': { schema: { type: 'string' } } } },
        ...resErr(401),
      },
    },
  },
  '/api/parc-machines/{id}': {
    get: {
      tags: ['Parc Machines'],
      summary: 'Détails d\'une machine',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Machine', 'Machine'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Parc Machines'],
      summary: 'Modifier une machine',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateMachineRequest'),
      responses: { ...res200('Machine mise à jour', 'Machine'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Parc Machines'],
      summary: 'Supprimer une machine',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Machine supprimée'), ...resErr(401, 404) },
    },
  },
  '/api/parc-machines/{id}/duplicate': {
    post: {
      tags: ['Parc Machines'],
      summary: 'Dupliquer une machine',
      security: bearer,
      parameters: [idParam],
      responses: { ...res201('Machine dupliquée', 'Machine'), ...resErr(401, 404) },
    },
  },
  '/api/parc-machines/{id}/releves': {
    get: {
      tags: ['Parc Machines - Relevés'],
      summary: 'Lister les relevés d\'une machine',
      security: bearer,
      parameters: [
        idParam,
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
      ],
      responses: { ...res200('Liste paginée des relevés'), ...resErr(401, 404) },
    },
    post: {
      tags: ['Parc Machines - Relevés'],
      summary: 'Saisir un relevé de compteur',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateReleveRequest'),
      responses: { ...res201('Relevé enregistré', 'ReleveCompteur'), ...resErr(400, 401, 404) },
    },
  },
  '/api/parc-machines/{id}/releves/{releveId}': {
    put: {
      tags: ['Parc Machines - Relevés'],
      summary: 'Modifier un relevé',
      security: bearer,
      parameters: [idParam, releveIdParam],
      requestBody: jsonBody('CreateReleveRequest'),
      responses: { ...res200('Relevé mis à jour', 'ReleveCompteur'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Parc Machines - Relevés'],
      summary: 'Supprimer un relevé',
      security: bearer,
      parameters: [idParam, releveIdParam],
      responses: { ...res200('Relevé supprimé'), ...resErr(401, 404) },
    },
  },
  '/api/parc-machines/{id}/timeline': {
    get: {
      tags: ['Parc Machines'],
      summary: 'Timeline d\'une machine (historique complet)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Timeline de la machine'), ...resErr(401, 404) },
    },
  },
};
