export const name = '084_reclasse_connexions_authentification';

// ---------------------------------------------------------------------------
// Les connexions étaient historiquement rangées dans le module 'parametres',
// où elles se noyaient parmi les actions de configuration. Elles ont désormais
// leur propre module 'authentification' (avec les déconnexions et les échecs),
// mais l'historique était resté sous l'ancien module : l'onglet « Connexions »
// affichait 0 alors que « Paramètres » comptait en réalité 94 connexions.
// ---------------------------------------------------------------------------

const ACTIONS = ['connexion', 'deconnexion', 'connexion_echouee'];

export async function up(client) {
  await client.query(
    `UPDATE activity_logs
     SET module = 'authentification'
     WHERE module = 'parametres' AND action = ANY($1)`,
    [ACTIONS],
  );
}

export async function down(client) {
  await client.query(
    `UPDATE activity_logs
     SET module = 'parametres'
     WHERE module = 'authentification' AND action = ANY($1)`,
    [ACTIONS],
  );
}
