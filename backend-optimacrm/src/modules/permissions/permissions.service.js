import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// Les permissions `destructive` sont volontairement séparées des `*_write` :
// elles ne sont accordées par aucun rôle, pas même `admin`, et ne peuvent
// qu'être cochées à la main utilisateur par utilisateur (cf. checkPermission.js,
// qui désactive le bypass de rôle dès qu'une clé destructive est exigée).
// Ça couvre les suppressions et la modification du numéro de contrat.
export const PERMISSIONS = {
  dashboard:              { label: 'Dashboard',               group: 'Général' },
  activity_logs:          { label: 'Journal d\'activité',     group: 'Général' },
  users_manage:           { label: 'Gestion des utilisateurs', group: 'Général' },
  users_delete:           { label: 'Utilisateurs — Supprimer', group: 'Général', destructive: true },
  clients_read:           { label: 'Clients — Consulter',     group: 'Clients' },
  clients_write:          { label: 'Clients — Créer / Modifier', group: 'Clients' },
  clients_import:         { label: 'Clients — Importer',      group: 'Clients' },
  clients_delete:         { label: 'Clients — Supprimer',     group: 'Clients', destructive: true },
  devis_read:             { label: 'Devis — Consulter',       group: 'Devis' },
  devis_write:            { label: 'Devis — Créer / Modifier', group: 'Devis' },
  devis_delete:           { label: 'Devis — Supprimer',       group: 'Devis', destructive: true },
  factures_read:          { label: 'Factures — Consulter',    group: 'Factures' },
  factures_write:         { label: 'Factures — Créer / Modifier', group: 'Factures' },
  factures_delete:        { label: 'Factures — Supprimer',    group: 'Factures', destructive: true },
  contrats_read:          { label: 'Contrats — Consulter',    group: 'Contrats' },
  contrats_write:         { label: 'Contrats — Créer / Modifier', group: 'Contrats' },
  contrats_import:        { label: 'Contrats — Importer',     group: 'Contrats' },
  contrats_delete:        { label: 'Contrats — Supprimer',    group: 'Contrats', destructive: true },
  contrats_renumber:      { label: 'Contrats — Modifier le numéro', group: 'Contrats', destructive: true, badge: 'Numéro' },
  parc_read:              { label: 'Parc Machines — Consulter', group: 'Parc Machines' },
  parc_write:             { label: 'Parc Machines — Créer / Modifier', group: 'Parc Machines' },
  parc_import:            { label: 'Parc Machines — Importer', group: 'Parc Machines' },
  parc_delete:            { label: 'Parc Machines — Supprimer', group: 'Parc Machines', destructive: true },
  catalogue_read:         { label: 'Catalogue — Consulter',   group: 'Catalogue' },
  catalogue_write:        { label: 'Catalogue — Créer / Modifier', group: 'Catalogue' },
  catalogue_import:       { label: 'Catalogue — Importer',    group: 'Catalogue' },
  fournisseurs:           { label: 'Fournisseurs',            group: 'Catalogue' },
  marques:                { label: 'Marques',                 group: 'Catalogue' },
  familles_unites:        { label: 'Familles & Unités',       group: 'Catalogue' },
  catalogue_delete:       { label: 'Catalogue — Supprimer (produits, marques, fournisseurs, familles)', group: 'Catalogue', destructive: true },
  tickets_read:           { label: 'Tickets — Consulter',     group: 'Tickets' },
  tickets_write:          { label: 'Tickets — Créer / Modifier', group: 'Tickets' },
  tickets_admin:          { label: 'Tickets — Admin (catégories, SLA)', group: 'Tickets' },
  techniciens_manage:     { label: 'Gestion des techniciens', group: 'Tickets' },
  tickets_delete:         { label: 'Tickets — Supprimer (tickets, catégories, créneaux)', group: 'Tickets', destructive: true },
  champs_personnalises:   { label: 'Champs personnalisés',    group: 'Configuration' },
  champs_templates:       { label: 'Templates de champs',     group: 'Configuration' },
  parametres_societe:     { label: 'Paramètres société',      group: 'Configuration' },
  config_delete:          { label: 'Configuration — Supprimer (champs, sections, templates)', group: 'Configuration', destructive: true },
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS);

export const DELETE_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter(k => PERMISSIONS[k].destructive);

export function isDeletePermission(key) {
  return PERMISSIONS[key]?.destructive === true;
}

export function getAvailablePermissions() {
  const groups = {};
  for (const [key, { label, group, destructive, badge }] of Object.entries(PERMISSIONS)) {
    if (!groups[group]) groups[group] = [];
    groups[group].push({
      key,
      label,
      destructive: destructive === true,
      ...(badge ? { badge } : {}),
    });
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
  if (!Array.isArray(permissions)) {
    throw ApiError.badRequest('Le champ « permissions » doit être un tableau');
  }

  const invalid = permissions.filter(p => !ALL_PERMISSION_KEYS.includes(p));
  if (invalid.length > 0) {
    throw ApiError.badRequest(`Invalid permissions: ${invalid.join(', ')}`);
  }

  // Le doublon violerait user_permissions_unique et ferait échouer tout l'INSERT.
  const unique = [...new Set(permissions)];

  const userResult = await query('SELECT id, role FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) throw ApiError.notFound('User not found');

  await query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);

  if (unique.length > 0) {
    const values = unique.map((_, i) => `($1, $${i + 2})`).join(', ');
    await query(
      `INSERT INTO user_permissions (user_id, permission) VALUES ${values}`,
      [userId, ...unique],
    );
  }

  return unique;
}
