export const name = '024_cleanup_reglements';

export async function up(client) {
  await client.query(`DELETE FROM facture_reglements`);

  await client.query(`
    UPDATE factures SET
      total_regle = 0,
      net_a_payer = total_ttc,
      statut = CASE
        WHEN statut = 'Payée' THEN 'Validée'
        WHEN statut = 'Partiellement payée' THEN 'Validée'
        WHEN statut = 'En retard' THEN 'Validée'
        ELSE statut
      END
    WHERE statut IN ('Payée', 'Partiellement payée', 'En retard')
  `);

  await client.query(`
    DELETE FROM facture_lignes WHERE facture_id IN (
      SELECT id FROM factures WHERE est_avoir = true
    )
  `);
  await client.query(`DELETE FROM facture_historique WHERE facture_id IN (SELECT id FROM factures WHERE est_avoir = true)`);
  await client.query(`UPDATE factures SET avoir_id = NULL WHERE avoir_id IS NOT NULL`);
  await client.query(`DELETE FROM factures WHERE est_avoir = true`);
}
