export const name = '015_add_contrat_entite_champs';

export async function up(client) {
  await client.query(`
    ALTER TABLE champs_personnalises_config
    DROP CONSTRAINT IF EXISTS champs_config_entite_check
  `);

  await client.query(`
    ALTER TABLE champs_personnalises_config
    ADD CONSTRAINT champs_config_entite_check CHECK (
      entite IN ('CLIENT', 'DEVIS', 'CATALOGUE', 'CONTRAT')
    )
  `);
}
