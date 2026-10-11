// ---------------------------------------------------------------------------
// Noms de modules du journal d'activité.
//
// Le nom écrit ici est la clé de filtrage du journal : il doit exister dans le
// MODULE_CONFIG du frontend (journal/page.tsx), sinon les entrées sont écrites
// mais restent invisibles — aucun onglet ne les sélectionne et le total ne
// correspond plus à la somme des onglets.
//
// Les référentiels du catalogue (marques, fournisseurs, familles et unités)
// sont volontairement rangés sous `catalogue` : ils n'ont pas d'écran propre et
// un onglet par référentiel émietterait le journal.
// ---------------------------------------------------------------------------

export const MODULES = {
  AUTHENTIFICATION: 'authentification',
  UTILISATEURS: 'utilisateurs',
  PARAMETRES: 'parametres',
  CLIENTS: 'clients',
  CONTRATS: 'contrats',
  CATALOGUE: 'catalogue',
  PARC_MACHINES: 'parc_machines',
  RELEVES: 'releves',
  DEVIS: 'devis',
  FACTURES: 'factures',
  AVOIRS: 'avoirs',
  SEPA: 'sepa',
  TICKETS: 'tickets',
  PLANNING: 'planning',
  ESPACE_CLIENT: 'espace_client',
  SUPER_ADMIN: 'super-admin',
};

export const MODULES_CONNUS = Object.values(MODULES);
