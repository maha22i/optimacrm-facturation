import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import clientRoutes from './modules/clients/client.routes.js';
import devisRoutes from './modules/devis/devis.routes.js';
import devisPublicRoutes from './modules/devis/devis.public.routes.js';
import catalogueRoutes from './modules/catalogue/catalogue.routes.js';
import champsTemplatesRoutes from './modules/champs-templates/champsTemplates.routes.js';
import societeRoutes from './modules/societe/societe.routes.js';
import fournisseurRoutes from './modules/fournisseurs/fournisseur.routes.js';
import marqueRoutes from './modules/marques/marque.routes.js';
import famillesUnitesRoutes from './modules/familles-unites/famillesUnites.routes.js';
import champsConfigRoutes from './modules/champs-config/champsConfig.routes.js';
import contratRoutes from './modules/contrats/contrat.routes.js';
import importCatalogueRoutes from './modules/import-catalogue/importCatalogue.routes.js';
import importContratsRoutes from './modules/import-contrats/importContrats.routes.js';
import importClientsRoutes from './modules/import-clients/importClients.routes.js';
import permissionsRoutes from './modules/permissions/permissions.routes.js';
import parcMachineRoutes from './modules/parc-machines/parcMachine.routes.js';
import importParcRoutes from './modules/import-parc/importParc.routes.js';
import importRelevesCompteursRoutes from './modules/import-releves-compteurs/importRelevesCompteurs.routes.js';
import factureRoutes from './modules/factures/facture.routes.js';
import { authenticate } from './middleware/authenticate.js';
import { tenantMiddleware } from './middleware/tenantContext.js';
import { checkPermission } from './middleware/checkPermission.js';
import { requireModule } from './middleware/requireModule.js';
import * as factureController from './modules/factures/facture.controller.js';
import activityLogRoutes from './modules/activity-logs/activityLog.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import emailRoutes from './modules/email/email.routes.js';
import importsRelevesRoutes from './modules/imports-releves/importsReleves.routes.js';
import * as importsRelevesController from './modules/imports-releves/importsReleves.controller.js';
import sepaRoutes from './modules/sepa/sepa.routes.js';
import avoirRoutes from './modules/avoirs/avoir.routes.js';
import * as avoirController from './modules/avoirs/avoir.controller.js';
import ticketRoutes from './modules/tickets/ticket.routes.js';
import * as ticketController from './modules/tickets/ticket.controller.js';
import planningRoutes from './modules/planning/planning.routes.js';
import superAdminRoutes from './modules/super-admin/superAdmin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'OptimaCRM API Documentation',
}));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'API is running', timestamp: new Date().toISOString() });
});

// Routes publiques (signature de devis par token) — montées AVANT les routes authentifiées
app.use('/api/public/devis', devisPublicRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/devis', devisRoutes);
app.use('/api/catalogue', catalogueRoutes);
app.use('/api/champs-templates', champsTemplatesRoutes);
app.use('/api/parametres/societe', societeRoutes);
app.use('/api/fournisseurs', fournisseurRoutes);
app.use('/api/marques', marqueRoutes);
app.use('/api/referentiel', famillesUnitesRoutes);
app.use('/api/champs-config', champsConfigRoutes);
app.use('/api/contrats', contratRoutes);
app.use('/api/import/catalogue', importCatalogueRoutes);
app.use('/api/import/contrats', importContratsRoutes);
app.use('/api/import/clients', importClientsRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/parc-machines', parcMachineRoutes);
app.use('/api/import/parc', importParcRoutes);
app.use('/api/releves-compteurs/import', importRelevesCompteursRoutes);
app.get('/api/factures/:id/avoirs-possibles', authenticate, tenantMiddleware, checkPermission('factures_read'), avoirController.getAvoirsPossibles);
app.get('/api/factures/:id/avoirs', authenticate, tenantMiddleware, checkPermission('factures_read'), avoirController.getAvoirsParFacture);
app.use('/api/factures', factureRoutes);
app.use('/api/avoirs', avoirRoutes);
app.get('/api/releves-compteurs', authenticate, requireModule('parc_machines'), tenantMiddleware, checkPermission('factures_read'), factureController.listRelevesCompteurs);
app.use('/api/imports-releves', importsRelevesRoutes);
app.get('/api/parc-machines/:id/timeline', authenticate, requireModule('parc_machines'), tenantMiddleware, checkPermission('parc_read'), importsRelevesController.getMachineTimeline);
app.use('/api/sepa', sepaRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/planning', planningRoutes);
app.get('/api/clients/:id/tickets', authenticate, requireModule('tickets'), tenantMiddleware, checkPermission('tickets_read'), ticketController.getTicketsByClient);
app.get('/api/parc-machines/:id/tickets', authenticate, requireModule('tickets'), tenantMiddleware, checkPermission('tickets_read'), ticketController.getTicketsByMachine);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/email', emailRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

export default app;
