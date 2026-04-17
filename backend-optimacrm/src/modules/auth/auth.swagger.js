const bearer = [{ bearerAuth: [] }];

function jsonBody(ref) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}

function res200(desc, ref) {
  return { 200: { description: desc, content: { 'application/json': { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function res201(desc) {
  return { 201: { description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(400)) map[400] = { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(401)) map[401] = { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(403)) map[403] = { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(409)) map[409] = { description: 'Conflict', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

export const authSwaggerPaths = {
  // ── Public ────────────────────────────────────────────────────────────────
  '/api/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Register a new user',
      requestBody: jsonBody('RegisterRequest'),
      responses: { ...res201('User registered'), ...resErr(400, 409) },
    },
  },
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login',
      requestBody: jsonBody('LoginRequest'),
      responses: { ...res200('Login successful'), ...resErr(400, 401, 403) },
    },
  },

  // ── Authenticated ─────────────────────────────────────────────────────────
  '/api/auth/profile': {
    get: {
      tags: ['Auth'],
      summary: 'Get current user profile',
      security: bearer,
      responses: { ...res200('User profile', 'User'), ...resErr(401) },
    },
    put: {
      tags: ['Auth'],
      summary: 'Update current user profile',
      security: bearer,
      requestBody: jsonBody('UpdateProfileRequest'),
      responses: { ...res200('Profile updated', 'User'), ...resErr(400, 401, 409) },
    },
  },
  '/api/auth/change-password': {
    put: {
      tags: ['Auth'],
      summary: 'Change password',
      security: bearer,
      requestBody: jsonBody('ChangePasswordRequest'),
      responses: { ...res200('Password changed'), ...resErr(400, 401) },
    },
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  '/api/auth/users': {
    get: {
      tags: ['Users'],
      summary: 'List all users (admin)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: { ...res200('Paginated users', 'PaginatedUsers'), ...resErr(401, 403) },
    },
  },
  '/api/auth/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Get user by ID (admin)',
      security: bearer,
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { ...res200('User', 'User'), ...resErr(401, 403, 404) },
    },
    put: {
      tags: ['Users'],
      summary: 'Update user (admin)',
      security: bearer,
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: jsonBody('UpdateUserRequest'),
      responses: { ...res200('User updated', 'User'), ...resErr(400, 401, 403, 404, 409) },
    },
    delete: {
      tags: ['Users'],
      summary: 'Delete user (admin)',
      security: bearer,
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { ...res200('User deleted'), ...resErr(401, 403, 404) },
    },
  },
};
