const bearer = [{ bearerAuth: [] }];

function res200(desc, ref) {
  return { 200: { description: desc, content: { 'application/json': { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(400)) map[400] = { description: 'Erreur de validation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(403)) map[403] = { description: 'Accès interdit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

export const societeSwaggerSchemas = {
  SocieteConfig: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      raison_sociale: { type: 'string', example: 'OptimaCRM SAS' },
      forme_juridique: { type: 'string', enum: ['SARL', 'SAS', 'EURL', 'SA', 'SCI', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'AUTRE'] },
      siret: { type: 'string', example: '12345678901234' },
      numero_tva: { type: 'string' },
      code_ape: { type: 'string' },
      adresse: { type: 'string' },
      code_postal: { type: 'string' },
      ville: { type: 'string' },
      telephone: { type: 'string' },
      email_contact: { type: 'string', format: 'email' },
      email_facturation: { type: 'string', format: 'email' },
      site_web: { type: 'string' },
      logo_url: { type: 'string' },
      prefixe_devis: { type: 'string', example: 'DV' },
      prefixe_facture: { type: 'string', example: 'FA' },
      prefixe_client: { type: 'string', example: 'CL' },
      prefixe_bon_commande: { type: 'string', example: 'BC' },
      remise_a_zero_annuelle: { type: 'boolean' },
      conditions_paiement_defaut: { type: 'string' },
      mentions_legales: { type: 'string' },
      rib_iban: { type: 'string' },
      rib_bic: { type: 'string' },
      rib_banque: { type: 'string' },
    },
  },
  UpdateSocieteRequest: {
    type: 'object',
    properties: {
      raison_sociale: { type: 'string', maxLength: 255 },
      forme_juridique: { type: 'string', enum: ['SARL', 'SAS', 'EURL', 'SA', 'SCI', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'AUTRE'] },
      siret: { type: 'string', minLength: 14, maxLength: 14 },
      numero_tva: { type: 'string' },
      code_ape: { type: 'string' },
      adresse: { type: 'string' },
      code_postal: { type: 'string' },
      ville: { type: 'string' },
      telephone: { type: 'string' },
      email_contact: { type: 'string', format: 'email' },
      email_facturation: { type: 'string', format: 'email' },
      site_web: { type: 'string' },
      prefixe_devis: { type: 'string', minLength: 2, maxLength: 6 },
      prefixe_facture: { type: 'string', minLength: 2, maxLength: 6 },
      prefixe_client: { type: 'string', minLength: 2, maxLength: 6 },
      prefixe_bon_commande: { type: 'string', minLength: 2, maxLength: 6 },
      remise_a_zero_annuelle: { type: 'boolean' },
      conditions_paiement_defaut: { type: 'string' },
      mentions_legales: { type: 'string' },
      rib_iban: { type: 'string' },
      rib_bic: { type: 'string' },
      rib_banque: { type: 'string' },
    },
  },
};

export const societeSwaggerPaths = {
  '/api/parametres/societe': {
    get: {
      tags: ['Paramètres - Société'],
      summary: 'Obtenir la configuration de la société',
      security: bearer,
      responses: { ...res200('Configuration société', 'SocieteConfig'), ...resErr(401, 403) },
    },
    put: {
      tags: ['Paramètres - Société'],
      summary: 'Mettre à jour la configuration de la société',
      security: bearer,
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateSocieteRequest' } } } },
      responses: { ...res200('Configuration mise à jour', 'SocieteConfig'), ...resErr(400, 401, 403) },
    },
  },
  '/api/parametres/societe/logo': {
    post: {
      tags: ['Paramètres - Société'],
      summary: 'Uploader le logo de la société',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } } } },
      },
      responses: { ...res200('Logo uploadé'), ...resErr(400, 401, 403) },
    },
    delete: {
      tags: ['Paramètres - Société'],
      summary: 'Supprimer le logo de la société',
      security: bearer,
      responses: { ...res200('Logo supprimé'), ...resErr(401, 403) },
    },
  },
};
