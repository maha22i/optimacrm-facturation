export const name = '083_normalise_modules_activity_logs';

// ---------------------------------------------------------------------------
// Les modules du journal d'activité étaient écrits en dur dans chaque
// contrôleur, avec des casses et des nommages divergents ('SEPA', 'Avoirs',
// 'imports_releves'). Ils sont désormais tous issus de src/config/activityModules.js ;
// cette migration aligne l'historique déjà en base pour que les filtres et
// les onglets du journal ne laissent aucune entrée hors catégorie.
//
// La planification de tickets passe de 'tickets' à 'planning' : elle a
// maintenant son propre module côté application.
// ---------------------------------------------------------------------------

const RENOMMAGES = [
  ['SEPA', 'sepa'],
  ['Avoirs', 'avoirs'],
  ['imports_releves', 'releves'],
];

export async function up(client) {
  for (const [ancien, nouveau] of RENOMMAGES) {
    await client.query('UPDATE activity_logs SET module = $1 WHERE module = $2', [nouveau, ancien]);
  }

  await client.query(`
    UPDATE activity_logs
    SET module = 'planning'
    WHERE module = 'tickets' AND action = 'planification'
  `);
}

export async function down(client) {
  await client.query(`
    UPDATE activity_logs
    SET module = 'tickets'
    WHERE module = 'planning' AND action = 'planification'
  `);

  for (const [ancien, nouveau] of RENOMMAGES) {
    await client.query('UPDATE activity_logs SET module = $1 WHERE module = $2', [ancien, nouveau]);
  }
}
