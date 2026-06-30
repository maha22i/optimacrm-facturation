export const name = '040_create_planning_creneaux';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS planning_creneaux (
      id              SERIAL PRIMARY KEY,
      ticket_id       INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      technicien_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date_debut      TIMESTAMPTZ NOT NULL,
      date_fin        TIMESTAMPTZ NOT NULL,
      statut_creneau  VARCHAR(20) NOT NULL DEFAULT 'planifie'
                        CHECK (statut_creneau IN ('planifie', 'en_cours', 'termine', 'annule')),
      cree_par        UUID REFERENCES users(id) ON DELETE SET NULL,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT planning_creneaux_dates_check CHECK (date_fin > date_debut)
    );

    CREATE INDEX IF NOT EXISTS idx_planning_creneaux_tech_date
      ON planning_creneaux (technicien_id, date_debut);

    CREATE INDEX IF NOT EXISTS idx_planning_creneaux_ticket
      ON planning_creneaux (ticket_id);
  `);
}
