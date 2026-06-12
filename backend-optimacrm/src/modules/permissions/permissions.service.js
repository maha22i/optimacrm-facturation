import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

export const PERMISSIONS = {
  dashboard:              { label: 'Dashboard',               group: 'Général' },
  activity_logs:          { label: 'Journal d\'activité',     group: 'Général' },
  users_manage:           { label: 'Gestion des utilisateurs', group: 'Général' },
  clients_read:           { label: 'Clients — Consulter',     group: 'Clients' },
  clients_write:          { label: 'Clients — Créer / Modifier / Supprimer', group: 'Clients' },
  clients_import:         { label: 'Clients — Importer',      group: 'Clients' },
  devis_read:             { label: 'Devis — Consulter',       group: 'Devis' },
  devis_write:            { label: 'Devis — Créer / Modifier / Supprimer', group: 'Devis' },
  factures_read:          { label: 'Factures — Consulter',    group: 'Factures' },
  factures_write:         { label: 'Factures — Créer / Modifier / Supprimer', group: 'Factures' },
  contrats_read:          { label: 'Contrats — Consulter',    group: 'Contrats' },
  contrats_write:         { label: 'Contrats — Créer / Modifier / Supprimer', group: 'Contrats' },
  contrats_import:        { label: 'Contrats — Importer',     group: 'Contrats' },
  parc_read:              { label: 'Parc Machines — Consulter', group: 'Parc Machines' },
  parc_write:             { label: 'Parc Machines — Créer / Modifier / Supprimer', group: 'Parc Machines' },
  parc_import:            { label: 'Parc Machines — Importer', group: 'Parc Machines' },
  catalogue_read:         { label: 'Catalogue — Consulter',   group: 'Catalogue' },
  catalogue_write:        { label: 'Catalogue — Créer / Modifier / Supprimer', group: 'Catalogue' },
  catalogue_import:       { label: 'Catalogue — Importer',    group: 'Catalogue' },
  fournisseurs:           { label: 'Fournisseurs',            group: 'Catalogue' },
  marques:                { label: 'Marques',                 group: 'Catalogue' },
  familles_unites:        { label: 'Familles & Unités',       group: 'Catalogue' },
  tickets_read:           { label: 'Tickets — Consulter',     group: 'Tickets' },
  tickets_write:          { label: 'Tickets — Créer / Modifier', group: 'Tickets' },
  tickets_admin:          { label: 'Tickets — Admin (catégories, SLA, suppression)', group: 'Tickets' },
  techniciens_manage:     { label: 'Gestion des techniciens', group: 'Tickets' },
  champs_personnalises:   { label: 'Champs personnalisés',    group: 'Configuration' },
  champs_templates:       { label: 'Templates de champs',     group: 'Configuration' },
  parametres_societe:     { label: 'Paramètres société',      group: 'Configuration' },
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS);

export function getAvailablePermissions() {
  const groups = {};
  for (const [key, { label, group }] of Object.entries(PERMISSIONS)) {
    if (!groups[group]) groups[group] = [];
    groups[group].push({ key, label });
  }
  return Object.entries(groups).map(([group, permissions]) => ({ group, permissions }));
}

export async function getUserPermissions(userId) {
  const result = await query(
    'SELECT permission FROM user_permissions WHERE user_id = $1',
    [userId],
  );
  return result.rows.map(r => r.permission);
}

export async function setUserPermissions(userId, permissions) {
  const userResult = await query('SELECT id, role FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) throw ApiError.notFound('User not found');

  const invalid = permissions.filter(p => !ALL_PERMISSION_KEYS.includes(p));
  if (invalid.length > 0) {
    throw ApiError.badRequest(`Invalid permissions: ${invalid.join(', ')}`);
  }

  await query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);

  if (permissions.length > 0) {
    const values = permissions.map((_, i) => `($1, $${i + 2})`).join(', ');
    await query(
      `INSERT INTO user_permissions (user_id, permission) VALUES ${values}`,
      [userId, ...permissions],
    );
  }

  return permissions;
}
