export const name = '034_reset_telephonie_prochaine_facturation';

export async function up(client) {
  const result = await client.query(`
    UPDATE contrats
    SET date_prochaine_facture = '2026-06-01',
        prochaine_date_facturation = '2026-06-01',
        updated_at = NOW()
    WHERE type_contrat = 'Telephonie'
      AND statut IN ('Actif', 'actif')
      AND deleted_at IS NULL
    RETURNING id, numero_contrat
  `);

  const count = result.rowCount;

  await client.query(
    `INSERT INTO activity_logs (action, module, description, entity_type, details, statut)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      'mise_a_jour',
      'contrats',
      'Remise à zéro des dates de prochaine facturation téléphonie — passage à 01/06/2026 (reprise d\'activité depuis Kéops)',
      'contrat',
      JSON.stringify({ contrats_modifies: count, date_cible: '2026-06-01' }),
      'succes',
    ]
  );

  console.log(`  → ${count} contrat(s) téléphonie mis à jour (prochaine_facturation → 2026-06-01)`);
}

export async function down(client) {
  console.log('  ⚠ Pas de rollback automatique pour cette migration de données');
}
