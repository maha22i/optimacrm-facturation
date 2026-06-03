const bearer = [{ bearerAuth: [] }];

function res200(desc) {
  return { 200: { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

export const dashboardSwaggerSchemas = {
  DashboardStats: {
    type: 'object',
    properties: {
      chiffre_affaires: {
        type: 'object',
        properties: {
          total: { type: 'number' },
          mois_courant: { type: 'number' },
          evolution: { type: 'number', description: 'Pourcentage d\'évolution' },
        },
      },
      factures: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          en_attente: { type: 'integer' },
          en_retard: { type: 'integer' },
          montant_impaye: { type: 'number' },
        },
      },
      contrats: {
        type: 'object',
        properties: {
          actifs: { type: 'integer' },
          a_renouveler: { type: 'integer' },
        },
      },
      clients: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          nouveaux_mois: { type: 'integer' },
        },
      },
      devis: {
        type: 'object',
        properties: {
          en_cours: { type: 'integer' },
          taux_conversion: { type: 'number' },
        },
      },
    },
  },
};

export const dashboardSwaggerPaths = {
  '/api/dashboard/stats': {
    get: {
      tags: ['Dashboard'],
      summary: 'Statistiques du tableau de bord',
      description: 'Retourne les KPI principaux : chiffre d\'affaires, factures, contrats, clients, devis',
      security: bearer,
      responses: { ...res200('Statistiques du dashboard'), ...resErr(401) },
    },
  },
};
