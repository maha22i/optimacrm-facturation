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
  if (codes.includes(403)) map[403] = { description: 'Accès interdit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(409)) map[409] = { description: 'Conflit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID de la facture' };
const lidParam = { in: 'path', name: 'lid', required: true, schema: { type: 'integer' }, description: 'ID de la ligne' };

export const factureSwaggerSchemas = {
  Facture: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero_facture: { type: 'string', example: 'FA-2025-001' },
      client_id: { type: 'integer' },
      client_raison_sociale: { type: 'string' },
      statut: { type: 'string', enum: ['Brouillon', 'Validée', 'Envoyée', 'Payée', 'Payée partiellement', 'En retard', 'Annulée'] },
      type_origine: { type: 'string', enum: ['Manuelle', 'Contrat', 'Devis'] },
      date_facture: { type: 'string', format: 'date' },
      date_echeance: { type: 'string', format: 'date' },
      total_ht: { type: 'number' },
      total_tva: { type: 'number' },
      total_ttc: { type: 'number' },
      montant_paye: { type: 'number' },
      reste_a_payer: { type: 'number' },
      conditions_paiement: { type: 'string' },
      mode_paiement: { type: 'string' },
      notes: { type: 'string' },
      lignes: { type: 'array', items: { $ref: '#/components/schemas/FactureLigne' } },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  FactureLigne: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      facture_id: { type: 'integer' },
      ordre: { type: 'integer' },
      reference: { type: 'string' },
      designation: { type: 'string' },
      quantite: { type: 'number' },
      prix_unitaire_ht: { type: 'number' },
      remise_pourcentage: { type: 'number' },
      taux_tva: { type: 'number' },
      montant_ht: { type: 'number' },
    },
  },
  CreateFactureRequest: {
    type: 'object',
    required: ['client_id'],
    properties: {
      client_id: { type: 'integer' },
      date_facture: { type: 'string', format: 'date' },
      date_echeance: { type: 'string', format: 'date' },
      conditions_paiement: { type: 'string' },
      mode_paiement: { type: 'string' },
      notes: { type: 'string' },
    },
  },
  FactureLigneRequest: {
    type: 'object',
    properties: {
      reference: { type: 'string' },
      designation: { type: 'string' },
      quantite: { type: 'number', default: 1 },
      prix_unitaire_ht: { type: 'number' },
      remise_pourcentage: { type: 'number', default: 0 },
      taux_tva: { type: 'number', default: 20 },
    },
  },
  EnvoyerEmailRequest: {
    type: 'object',
    required: ['destinataire', 'sujet'],
    properties: {
      destinataire: { type: 'string', format: 'email', example: 'client@example.com' },
      sujet: { type: 'string', example: 'Facture FA-2025-001' },
      corps: { type: 'string' },
    },
  },
  LotIdsRequest: {
    type: 'object',
    required: ['ids'],
    properties: {
      ids: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
    },
  },
  EnvoyerLotRequest: {
    type: 'object',
    required: ['ids'],
    properties: {
      ids: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
      sujet: { type: 'string' },
      corps: { type: 'string' },
    },
  },
  GenererLotRequest: {
    type: 'object',
    required: ['contrat_ids'],
    properties: {
      contrat_ids: { type: 'array', items: { type: 'integer' } },
      periode_debut: { type: 'string', format: 'date' },
      periode_fin: { type: 'string', format: 'date' },
    },
  },
  GenererDepuisContratRequest: {
    type: 'object',
    properties: {
      periode_debut: { type: 'string', format: 'date' },
      periode_fin: { type: 'string', format: 'date' },
      releve_compteur_nb_id: { type: 'integer' },
      releve_compteur_coul_id: { type: 'integer' },
    },
  },
};

export const factureSwaggerPaths = {
  '/api/factures': {
    get: {
      tags: ['Factures'],
      summary: 'Lister les factures (paginé)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        { in: 'query', name: 'statut', schema: { type: 'string', enum: ['Brouillon', 'Validée', 'Envoyée', 'Payée', 'Payée partiellement', 'En retard', 'Annulée'] } },
        { in: 'query', name: 'client_id', schema: { type: 'integer' } },
        { in: 'query', name: 'date_debut', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'date_fin', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'type_origine', schema: { type: 'string', enum: ['Manuelle', 'Contrat', 'Devis'] } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
      ],
      responses: { ...res200('Liste paginée des factures'), ...resErr(401) },
    },
    post: {
      tags: ['Factures'],
      summary: 'Créer une facture manuelle',
      security: bearer,
      requestBody: jsonBody('CreateFactureRequest'),
      responses: { ...res201('Facture créée', 'Facture'), ...resErr(400, 401) },
    },
  },
  '/api/factures/stats': {
    get: {
      tags: ['Factures'],
      summary: 'Statistiques des factures',
      security: bearer,
      responses: { ...res200('Statistiques factures'), ...resErr(401) },
    },
  },
  '/api/factures/contrats-a-facturer': {
    get: {
      tags: ['Factures - Génération'],
      summary: 'Lister les contrats prêts à facturer',
      security: bearer,
      parameters: [
        { in: 'query', name: 'type', schema: { type: 'string' }, description: 'Filtrer par type de contrat' },
      ],
      responses: { ...res200('Contrats à facturer'), ...resErr(401) },
    },
  },
  '/api/factures/releves-disponibles/{contratId}': {
    get: {
      tags: ['Factures - Génération'],
      summary: 'Relevés disponibles pour un contrat',
      security: bearer,
      parameters: [{ in: 'path', name: 'contratId', required: true, schema: { type: 'integer' } }],
      responses: { ...res200('Relevés disponibles'), ...resErr(401, 404) },
    },
  },
  '/api/factures/{id}': {
    get: {
      tags: ['Factures'],
      summary: 'Détails d\'une facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Facture', 'Facture'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Factures'],
      summary: 'Modifier une facture',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateFactureRequest'),
      responses: { ...res200('Facture mise à jour', 'Facture'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Factures'],
      summary: 'Supprimer une facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Facture supprimée'), ...resErr(401, 404) },
    },
  },
  '/api/factures/{id}/pdf': {
    get: {
      tags: ['Factures'],
      summary: 'Télécharger le PDF d\'une facture',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: { description: 'PDF généré', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
        ...resErr(401, 404),
      },
    },
  },
  '/api/factures/{id}/lignes': {
    post: {
      tags: ['Factures - Lignes'],
      summary: 'Ajouter une ligne à la facture',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('FactureLigneRequest'),
      responses: { ...res201('Ligne ajoutée', 'Facture'), ...resErr(400, 401, 404) },
    },
  },
  '/api/factures/{id}/lignes/{lid}': {
    put: {
      tags: ['Factures - Lignes'],
      summary: 'Modifier une ligne de la facture',
      security: bearer,
      parameters: [idParam, lidParam],
      requestBody: jsonBody('FactureLigneRequest'),
      responses: { ...res200('Ligne modifiée', 'Facture'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Factures - Lignes'],
      summary: 'Supprimer une ligne de la facture',
      security: bearer,
      parameters: [idParam, lidParam],
      responses: { ...res200('Ligne supprimée', 'Facture'), ...resErr(401, 404) },
    },
  },
  '/api/factures/{id}/recalculer': {
    put: {
      tags: ['Factures - Lignes'],
      summary: 'Recalculer les totaux de la facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Totaux recalculés', 'Facture'), ...resErr(401, 404) },
    },
  },
  '/api/factures/{id}/valider': {
    post: {
      tags: ['Factures - Workflow'],
      summary: 'Valider une facture (Brouillon → Validée)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Facture validée', 'Facture'), ...resErr(400, 401, 404) },
    },
  },
  '/api/factures/{id}/envoyer': {
    post: {
      tags: ['Factures - Workflow'],
      summary: 'Marquer une facture comme envoyée',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Facture envoyée', 'Facture'), ...resErr(400, 401, 404) },
    },
  },
  '/api/factures/{id}/envoyer-email': {
    post: {
      tags: ['Factures - Workflow'],
      summary: 'Envoyer une facture par email avec PDF en pièce jointe',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('EnvoyerEmailRequest'),
      responses: { ...res200('Facture envoyée par email', 'Facture'), ...resErr(400, 401, 404) },
    },
  },
  '/api/factures/{id}/email-template': {
    get: {
      tags: ['Factures - Workflow'],
      summary: 'Obtenir le template d\'email pré-rempli pour une facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Template email'), ...resErr(401, 404) },
    },
  },
  '/api/factures/{id}/annuler': {
    post: {
      tags: ['Factures - Workflow'],
      summary: 'Annuler une facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Facture annulée', 'Facture'), ...resErr(400, 401, 404) },
    },
  },
  '/api/factures/{id}/dupliquer': {
    post: {
      tags: ['Factures - Workflow'],
      summary: 'Dupliquer une facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res201('Facture dupliquée', 'Facture'), ...resErr(401, 404) },
    },
  },
  '/api/factures/generer-depuis-contrat/{contratId}': {
    post: {
      tags: ['Factures - Génération'],
      summary: 'Générer une facture depuis un contrat',
      security: bearer,
      parameters: [{ in: 'path', name: 'contratId', required: true, schema: { type: 'integer' } }],
      requestBody: jsonBody('GenererDepuisContratRequest'),
      responses: { ...res201('Facture générée depuis contrat'), ...resErr(400, 401, 404) },
    },
  },
  '/api/factures/generer-depuis-devis/{devisId}': {
    post: {
      tags: ['Factures - Génération'],
      summary: 'Générer une facture depuis un devis',
      security: bearer,
      parameters: [{ in: 'path', name: 'devisId', required: true, schema: { type: 'integer' } }],
      responses: { ...res201('Facture générée depuis devis'), ...resErr(400, 401, 404) },
    },
  },
  '/api/factures/generer-lot': {
    post: {
      tags: ['Factures - Génération'],
      summary: 'Génération en lot de factures depuis des contrats',
      security: bearer,
      requestBody: jsonBody('GenererLotRequest'),
      responses: { ...res200('Résultat de la génération en lot'), ...resErr(400, 401) },
    },
  },
  '/api/factures/valider-lot': {
    post: {
      tags: ['Factures - Actions en masse'],
      summary: 'Valider plusieurs factures en lot',
      security: bearer,
      requestBody: jsonBody('LotIdsRequest'),
      responses: { ...res200('Résultat de la validation en lot'), ...resErr(400, 401) },
    },
  },
  '/api/factures/envoyer-lot': {
    post: {
      tags: ['Factures - Actions en masse'],
      summary: 'Envoyer plusieurs factures par email en lot',
      security: bearer,
      requestBody: jsonBody('EnvoyerLotRequest'),
      responses: { ...res200('Résultat de l\'envoi en lot'), ...resErr(400, 401) },
    },
  },
  '/api/factures/telecharger-lot': {
    post: {
      tags: ['Factures - Actions en masse'],
      summary: 'Télécharger plusieurs factures en ZIP',
      security: bearer,
      requestBody: jsonBody('LotIdsRequest'),
      responses: {
        200: { description: 'Archive ZIP des factures', content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } } },
        ...resErr(400, 401),
      },
    },
  },
  '/api/factures/{id}/avoirs-possibles': {
    get: {
      tags: ['Avoirs'],
      summary: 'Lignes éligibles pour un avoir sur une facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Lignes éligibles'), ...resErr(401, 404) },
    },
  },
  '/api/factures/{id}/avoirs': {
    get: {
      tags: ['Avoirs'],
      summary: 'Avoirs liés à une facture',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Avoirs de la facture'), ...resErr(401, 404) },
    },
  },
  '/api/releves-compteurs': {
    get: {
      tags: ['Factures - Génération'],
      summary: 'Lister tous les relevés de compteurs',
      security: bearer,
      responses: { ...res200('Liste des relevés'), ...resErr(401) },
    },
  },
};
