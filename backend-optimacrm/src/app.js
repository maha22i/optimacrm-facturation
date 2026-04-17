import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import clientRoutes from './modules/clients/client.routes.js';
import devisRoutes from './modules/devis/devis.routes.js';
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
import { checkPermission } from './middleware/checkPermission.js';
import * as factureController from './modules/factures/facture.controller.js';
import activityLogRoutes from './modules/activity-logs/activityLog.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import emailRoutes from './modules/email/email.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'OptimaCRM API Documentation',
}));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'API is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
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
app.use('/api/factures', factureRoutes);
app.get('/api/releves-compteurs', authenticate, checkPermission('factures_read'), factureController.listRelevesCompteurs);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/email', emailRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

export default app;
