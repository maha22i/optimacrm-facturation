import { authSwaggerPaths } from '../modules/auth/auth.swagger.js';
import { clientSwaggerPaths, clientSwaggerSchemas } from '../modules/clients/client.swagger.js';
import { devisSwaggerPaths, devisSwaggerSchemas } from '../modules/devis/devis.swagger.js';
import { catalogueSwaggerPaths, catalogueSwaggerSchemas } from '../modules/catalogue/catalogue.swagger.js';
import { champsTemplatesSwaggerPaths, champsTemplatesSwaggerSchemas } from '../modules/champs-templates/champsTemplates.swagger.js';
import { fournisseurSwaggerPaths, fournisseurSwaggerSchemas } from '../modules/fournisseurs/fournisseur.swagger.js';
import { marqueSwaggerPaths, marqueSwaggerSchemas } from '../modules/marques/marque.swagger.js';
import { famillesUnitesSwaggerPaths, famillesUnitesSwaggerSchemas } from '../modules/familles-unites/famillesUnites.swagger.js';
import { contratSwaggerPaths, contratSwaggerSchemas } from '../modules/contrats/contrat.swagger.js';
import { factureSwaggerPaths, factureSwaggerSchemas } from '../modules/factures/facture.swagger.js';
import { avoirSwaggerPaths, avoirSwaggerSchemas } from '../modules/avoirs/avoir.swagger.js';
import { sepaSwaggerPaths, sepaSwaggerSchemas } from '../modules/sepa/sepa.swagger.js';
import { parcMachineSwaggerPaths, parcMachineSwaggerSchemas } from '../modules/parc-machines/parcMachine.swagger.js';
import { societeSwaggerPaths, societeSwaggerSchemas } from '../modules/societe/societe.swagger.js';
import { permissionsSwaggerPaths } from '../modules/permissions/permissions.swagger.js';
import { dashboardSwaggerPaths, dashboardSwaggerSchemas } from '../modules/dashboard/dashboard.swagger.js';
import { emailSwaggerPaths, emailSwaggerSchemas } from '../modules/email/email.swagger.js';
import { activityLogSwaggerPaths, activityLogSwaggerSchemas } from '../modules/activity-logs/activityLog.swagger.js';
import { champsConfigSwaggerPaths, champsConfigSwaggerSchemas } from '../modules/champs-config/champsConfig.swagger.js';
import { importsRelevesSwaggerPaths, importsRelevesSwaggerSchemas } from '../modules/imports-releves/importsReleves.swagger.js';
import {
  importCatalogueSwaggerPaths,
  importContratsSwaggerPaths,
  importClientsSwaggerPaths,
  importParcSwaggerPaths,
  importRelevesCompteursSwaggerPaths,
} from '../modules/imports/imports.swagger.js';

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
    { name: 'Contrats', description: 'Gestion des contrats' },
    { name: 'Contrats - Lignes', description: 'Lignes de contrats' },
    { name: 'Contrats - Machines', description: 'Machines associées aux contrats' },
    { name: 'Factures', description: 'Gestion des factures' },
    { name: 'Factures - Lignes', description: 'Lignes de factures' },
    { name: 'Factures - Workflow', description: 'Validation, envoi, annulation des factures' },
    { name: 'Factures - Génération', description: 'Génération de factures depuis contrats/devis' },
    { name: 'Factures - Actions en masse', description: 'Validation, envoi et téléchargement en lot' },
    { name: 'Avoirs', description: 'Gestion des avoirs (notes de crédit)' },
    { name: 'SEPA', description: 'Prélèvements SEPA (créancier, remises, XML)' },
    { name: 'Parc Machines', description: 'Gestion du parc de machines (copieur, téléphonie, informatique)' },
    { name: 'Parc Machines - Relevés', description: 'Relevés de compteurs des machines' },
    { name: 'Catalogue', description: 'Catalogue produits et services' },
    { name: 'Catalogue - Tarifs', description: 'Tarifs spéciaux par client' },
    { name: 'Fournisseurs', description: 'Gestion des fournisseurs' },
    { name: 'Marques', description: 'Gestion des marques' },
    { name: 'Référentiel - Familles', description: 'Familles de produits' },
    { name: 'Référentiel - Unités', description: 'Unités de mesure' },
    { name: 'Champs Templates', description: 'Templates de champs personnalisés' },
    { name: 'Champs personnalisés - Config', description: 'Configuration des champs personnalisés' },
    { name: 'Champs personnalisés - Valeurs', description: 'Valeurs des champs personnalisés par entité' },
    { name: 'Permissions', description: 'Gestion des permissions utilisateurs (admin)' },
    { name: 'Dashboard', description: 'Tableau de bord et KPIs' },
    { name: 'Paramètres - Société', description: 'Configuration de la société (raison sociale, logo, préfixes...)' },
    { name: 'Paramètres - Email', description: 'Configuration SMTP et envoi d\'emails' },
    { name: 'Journal d\'activité', description: 'Logs d\'activité et historique' },
    { name: 'Import - Catalogue', description: 'Import de produits depuis fichier Excel/CSV' },
    { name: 'Import - Contrats', description: 'Import de contrats depuis fichier Excel/CSV' },
    { name: 'Import - Clients', description: 'Import de clients depuis fichier Excel/CSV' },
    { name: 'Import - Parc Machines', description: 'Import de machines et relevés depuis fichier Excel/CSV' },
    { name: 'Import - Relevés Compteurs', description: 'Import de relevés de compteurs avec génération de factures' },
    { name: 'Imports Relevés - Historique', description: 'Historique et suivi des imports de relevés' },
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
      ...contratSwaggerSchemas,
      ...factureSwaggerSchemas,
      ...avoirSwaggerSchemas,
      ...sepaSwaggerSchemas,
      ...parcMachineSwaggerSchemas,
      ...societeSwaggerSchemas,
      ...dashboardSwaggerSchemas,
      ...emailSwaggerSchemas,
      ...activityLogSwaggerSchemas,
      ...champsConfigSwaggerSchemas,
      ...importsRelevesSwaggerSchemas,
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['Auth'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'API is running',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },
    ...authSwaggerPaths,
    ...clientSwaggerPaths,
    ...devisSwaggerPaths,
    ...contratSwaggerPaths,
    ...factureSwaggerPaths,
    ...avoirSwaggerPaths,
    ...sepaSwaggerPaths,
    ...parcMachineSwaggerPaths,
    ...catalogueSwaggerPaths,
    ...fournisseurSwaggerPaths,
    ...marqueSwaggerPaths,
    ...famillesUnitesSwaggerPaths,
    ...champsTemplatesSwaggerPaths,
    ...champsConfigSwaggerPaths,
    ...permissionsSwaggerPaths,
    ...dashboardSwaggerPaths,
    ...societeSwaggerPaths,
    ...emailSwaggerPaths,
    ...activityLogSwaggerPaths,
    ...importCatalogueSwaggerPaths,
    ...importContratsSwaggerPaths,
    ...importClientsSwaggerPaths,
    ...importParcSwaggerPaths,
    ...importRelevesCompteursSwaggerPaths,
    ...importsRelevesSwaggerPaths,
  },
};
