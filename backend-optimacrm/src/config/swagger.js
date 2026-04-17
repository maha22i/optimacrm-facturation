import { authSwaggerPaths } from '../modules/auth/auth.swagger.js';
import { clientSwaggerPaths, clientSwaggerSchemas } from '../modules/clients/client.swagger.js';
import { devisSwaggerPaths, devisSwaggerSchemas } from '../modules/devis/devis.swagger.js';
import { catalogueSwaggerPaths, catalogueSwaggerSchemas } from '../modules/catalogue/catalogue.swagger.js';
import { champsTemplatesSwaggerPaths, champsTemplatesSwaggerSchemas } from '../modules/champs-templates/champsTemplates.swagger.js';
import { fournisseurSwaggerPaths, fournisseurSwaggerSchemas } from '../modules/fournisseurs/fournisseur.swagger.js';
import { marqueSwaggerPaths, marqueSwaggerSchemas } from '../modules/marques/marque.swagger.js';
import { famillesUnitesSwaggerPaths, famillesUnitesSwaggerSchemas } from '../modules/familles-unites/famillesUnites.swagger.js';

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'OptimaCRM API',
    version: '1.0.0',
    description: 'API REST pour la plateforme SaaS OptimaCRM — Gestion de facturation et CRM.',
    contact: { name: 'OptimaCRM', email: 'contact@optimacrm.com' },
  },
  servers: [
    { url: `http://localhost:${process.env.PORT || 3001}`, description: 'Développement' },
  ],
  tags: [
    { name: 'Auth', description: 'Authentification et gestion du profil' },
    { name: 'Users', description: 'Gestion des utilisateurs (admin)' },
    { name: 'Clients', description: 'Gestion des clients (CRM)' },
    { name: 'Clients - Adresses', description: 'Adresses des clients' },
    { name: 'Clients - Contacts', description: 'Contacts des clients' },
    { name: 'Clients - Documents', description: 'Documents des clients' },
    { name: 'Devis', description: 'Gestion des devis' },
    { name: 'Devis - Lignes', description: 'Lignes de devis' },
    { name: 'Devis - Champs personnalisés', description: 'Champs personnalisés des devis' },
    { name: 'Catalogue', description: 'Catalogue produits et services' },
    { name: 'Catalogue - Tarifs', description: 'Tarifs spéciaux par client' },
    { name: 'Fournisseurs', description: 'Gestion des fournisseurs' },
    { name: 'Marques', description: 'Gestion des marques' },
    { name: 'Référentiel - Familles', description: 'Familles de produits' },
    { name: 'Référentiel - Unités', description: 'Unités de mesure' },
    { name: 'Champs Templates', description: 'Templates de champs personnalisés' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
          is_active: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'first_name', 'last_name'],
        properties: {
          email: { type: 'string', format: 'email', example: 'john@example.com' },
          password: { type: 'string', minLength: 8, example: 'SecureP@ss123' },
          first_name: { type: 'string', example: 'John' },
          last_name: { type: 'string', example: 'Doe' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'john@example.com' },
          password: { type: 'string', example: 'SecureP@ss123' },
        },
      },
      UpdateProfileRequest: {
        type: 'object',
        properties: {
          first_name: { type: 'string', example: 'John' },
          last_name: { type: 'string', example: 'Doe' },
          email: { type: 'string', format: 'email', example: 'newemail@example.com' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['old_password', 'new_password'],
        properties: {
          old_password: { type: 'string', example: 'OldP@ss123' },
          new_password: { type: 'string', minLength: 8, example: 'NewSecureP@ss456' },
        },
      },
      UpdateUserRequest: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['admin', 'user'] },
          is_active: { type: 'boolean' },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
        },
      },
      PaginatedUsers: {
        type: 'object',
        properties: {
          users: { type: 'array', items: { $ref: '#/components/schemas/User' } },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
      ...clientSwaggerSchemas,
      ...devisSwaggerSchemas,
      ...catalogueSwaggerSchemas,
      ...fournisseurSwaggerSchemas,
      ...marqueSwaggerSchemas,
      ...famillesUnitesSwaggerSchemas,
      ...champsTemplatesSwaggerSchemas,
    },
  },
  paths: {
    ...authSwaggerPaths,
    ...clientSwaggerPaths,
    ...devisSwaggerPaths,
    ...catalogueSwaggerPaths,
    ...fournisseurSwaggerPaths,
    ...marqueSwaggerPaths,
    ...famillesUnitesSwaggerPaths,
    ...champsTemplatesSwaggerPaths,
  },
};
