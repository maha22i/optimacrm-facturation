export const name = '036_create_ticket_tables';

export async function up(client) {
  // ── Catégories de tickets ─────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_categories (
      id                    SERIAL PRIMARY KEY,
      nom                   VARCHAR(100) NOT NULL,
      description           TEXT,
      couleur               VARCHAR(7) DEFAULT '#6B7280',
      actif                 BOOLEAN DEFAULT true,
      ordre                 INTEGER DEFAULT 0,
      technicien_defaut_id  UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    INSERT INTO ticket_categories (nom, couleur, ordre) VALUES
      ('Panne matériel', '#EF4444', 1),
      ('Dépannage logiciel', '#3B82F6', 2),
      ('Réseau', '#8B5CF6', 3),
      ('Téléphonie', '#F59E0B', 4),
      ('Consommables', '#10B981', 5),
      ('Installation', '#6366F1', 6),
      ('Demande d''information', '#6B7280', 7)
    ON CONFLICT DO NOTHING
  `);

  // ── Règles SLA ────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_sla_rules (
      id                              SERIAL PRIMARY KEY,
      priorite                        VARCHAR(20) NOT NULL UNIQUE,
      delai_prise_en_charge_heures    INTEGER,
      delai_resolution_heures         INTEGER,
      couleur                         VARCHAR(7) DEFAULT '#6B7280',
      created_at                      TIMESTAMPTZ DEFAULT NOW(),
      updated_at                      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    INSERT INTO ticket_sla_rules (priorite, delai_prise_en_charge_heures, delai_resolution_heures, couleur) VALUES
      ('basse', 48, 120, '#6B7280'),
      ('normale', 24, 72, '#3B82F6'),
      ('haute', 8, 24, '#F59E0B'),
      ('urgente', 2, 8, '#EF4444')
    ON CONFLICT DO NOTHING
  `);

  // ── Tickets ───────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id                            SERIAL PRIMARY KEY,
      numero                        VARCHAR(20) NOT NULL UNIQUE,
      sujet                         VARCHAR(255) NOT NULL,
      description                   TEXT,
      categorie_id                  INTEGER REFERENCES ticket_categories(id) ON DELETE SET NULL,
      priorite                      VARCHAR(20) NOT NULL DEFAULT 'normale'
                                      CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente')),
      statut                        VARCHAR(20) NOT NULL DEFAULT 'nouveau'
                                      CHECK (statut IN ('nouveau', 'assigne', 'en_cours', 'en_attente', 'resolu', 'cloture')),
      client_id                     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      machine_id                    INTEGER REFERENCES parc_machines(id) ON DELETE SET NULL,
      cree_par_id                   UUID REFERENCES users(id) ON DELETE SET NULL,
      technicien_id                 UUID REFERENCES users(id) ON DELETE SET NULL,
      date_prise_en_charge          TIMESTAMPTZ,
      date_resolution               TIMESTAMPTZ,
      sla_prise_en_charge_echeance  TIMESTAMPTZ,
      sla_resolution_echeance       TIMESTAMPTZ,
      pieces_jointes                JSONB DEFAULT '[]',
      created_at                    TIMESTAMPTZ DEFAULT NOW(),
      updated_at                    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_statut ON tickets(statut)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_priorite ON tickets(priorite)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_technicien ON tickets(technicien_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_numero ON tickets(numero)`);

  // ── Commentaires ──────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_commentaires (
      id                SERIAL PRIMARY KEY,
      ticket_id         INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
      user_nom          VARCHAR(255),
      contenu           TEXT NOT NULL,
      est_interne       BOOLEAN DEFAULT false,
      pieces_jointes    JSONB DEFAULT '[]',
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_ticket_commentaires_ticket ON ticket_commentaires(ticket_id)`);

  // ── Historique des statuts ────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ticket_historique_statuts (
      id                SERIAL PRIMARY KEY,
      ticket_id         INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      ancien_statut     VARCHAR(20),
      nouveau_statut    VARCHAR(20) NOT NULL,
      user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
      user_nom          VARCHAR(255),
      motif             TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_ticket_historique_ticket ON ticket_historique_statuts(ticket_id)`);
}
