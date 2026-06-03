const bearer = [{ bearerAuth: [] }];

function jsonBody(ref) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}
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

export const emailSwaggerSchemas = {
  EmailConfig: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      smtp_host: { type: 'string', example: 'smtp.gmail.com' },
      smtp_port: { type: 'integer', example: 587 },
      smtp_secure: { type: 'boolean' },
      smtp_user: { type: 'string' },
      smtp_pass: { type: 'string', description: 'Masqué dans les réponses' },
      from_name: { type: 'string', example: 'OptimaCRM' },
      from_email: { type: 'string', format: 'email' },
      reply_to: { type: 'string', format: 'email' },
      actif: { type: 'boolean' },
    },
  },
  UpdateEmailConfigRequest: {
    type: 'object',
    properties: {
      smtp_host: { type: 'string' },
      smtp_port: { type: 'integer' },
      smtp_secure: { type: 'boolean' },
      smtp_user: { type: 'string' },
      smtp_pass: { type: 'string' },
      from_name: { type: 'string' },
      from_email: { type: 'string', format: 'email' },
      reply_to: { type: 'string', format: 'email' },
      actif: { type: 'boolean' },
    },
  },
};

export const emailSwaggerPaths = {
  '/api/email/config': {
    get: {
      tags: ['Paramètres - Email'],
      summary: 'Obtenir la configuration email/SMTP',
      security: bearer,
      responses: { ...res200('Configuration email', 'EmailConfig'), ...resErr(401, 403) },
    },
    put: {
      tags: ['Paramètres - Email'],
      summary: 'Mettre à jour la configuration email/SMTP',
      security: bearer,
      requestBody: jsonBody('UpdateEmailConfigRequest'),
      responses: { ...res200('Configuration mise à jour', 'EmailConfig'), ...resErr(400, 401, 403) },
    },
  },
  '/api/email/verify': {
    post: {
      tags: ['Paramètres - Email'],
      summary: 'Vérifier la connexion SMTP',
      security: bearer,
      responses: { ...res200('Résultat de la vérification'), ...resErr(401, 403) },
    },
  },
  '/api/email/test': {
    post: {
      tags: ['Paramètres - Email'],
      summary: 'Envoyer un email de test',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['destinataire'],
              properties: {
                destinataire: { type: 'string', format: 'email', example: 'test@example.com' },
              },
            },
          },
        },
      },
      responses: { ...res200('Email de test envoyé'), ...resErr(400, 401, 403) },
    },
  },
  '/api/email/logs': {
    get: {
      tags: ['Paramètres - Email'],
      summary: 'Historique des emails envoyés',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: { ...res200('Logs des emails'), ...resErr(401, 403) },
    },
  },
};
