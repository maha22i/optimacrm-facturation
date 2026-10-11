// Tests de l'augmentation annuelle des contrats.
//
// Le calcul d'anniversaire est testé en pur. Les scénarios d'application créent
// leur propre contrat dans une transaction systématiquement annulée : rien n'est
// persisté (seules les séquences avancent, PostgreSQL n'annulant pas nextval).
//
//   npm test
//
// Rappel des règles vérifiées : taux composé, non-rétroactivité bornée par
// augmentation_date_reference, un seul passage par anniversaire.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';

import { pool, runWithTenantContext, getClient } from '../src/config/database.js';
import {
  prochainAnniversaireApres,
  planifierAugmentation,
  appliquerAugmentationsDues,
} from '../src/modules/contrats/augmentationAnnuelle.service.js';
import { createContrat, updateContrat } from '../src/modules/contrats/contrat.service.js';

const TENANT = process.env.TEST_TENANT_ID || '3c2424b8-b557-471a-8c4a-2a14b44aafb8';
const ROLLBACK = Symbol('rollback');

/**
 * Crée un contrat jetable (2 lignes, 1 machine copieur) et joue `scenario`
 * dessus, puis annule tout.
 */
async function avecContratJetable(config, scenario) {
  const {
    date_signature,
    augmentation_pourcentage = 2,
    augmentation_active = true,
    augmentation_date_reference,
    ftc = 100,
    cout_copie_nb = 0.005,
    prix_ligne = 100,
  } = config;

  let sortie = null;
  try {
    await runWithTenantContext(TENANT, async () => {
      const db = getClient();

      const { rows: [client] } = await db.query(
        'SELECT id FROM clients ORDER BY id LIMIT 1',
      );
      assert.ok(client, 'aucun client dans la base de test');

      const { rows: [contrat] } = await db.query(
        `INSERT INTO contrats (
           numero_contrat, type_contrat, type_facturation, client_id, periodicite,
           date_signature, date_debut, statut, ftc,
           augmentation_active, augmentation_pourcentage,
           augmentation_date_reference, augmentation_prochaine_date
         ) VALUES ($1, 'Copieur', 'Periodique', $2, 'Mensuel', $3, $3, 'Actif', $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          `TEST-AUGM-${Date.now()}`,
          client.id,
          date_signature,
          ftc,
          augmentation_active,
          augmentation_pourcentage,
          augmentation_date_reference,
          prochainAnniversaireApres(date_signature, augmentation_date_reference),
        ],
      );

      await db.query(
        `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht)
         VALUES ($1, 0, 'Forfait Copie N&B', 'Forfait', 1, $2), ($1, 1, 'Services', 'Service', 1, 0)`,
        [contrat.id, prix_ligne],
      );
      await db.query(
        `INSERT INTO contrat_machines (contrat_id, numero_serie, cout_copie_nb, service_connectic)
         VALUES ($1, 'TEST-AUGM-SERIE', $2, 25)`,
        [contrat.id, cout_copie_nb],
      );

      sortie = await scenario(db, contrat.id);

      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return sortie;
}

async function tarifs(db, contratId) {
  const { rows: lignes } = await db.query(
    'SELECT designation, prix_unitaire_ht FROM contrat_lignes WHERE contrat_id = $1 ORDER BY ordre',
    [contratId],
  );
  const { rows: [machine] } = await db.query(
    'SELECT cout_copie_nb, service_connectic FROM contrat_machines WHERE contrat_id = $1',
    [contratId],
  );
  const { rows: [contrat] } = await db.query(
    `SELECT ftc, augmentation_nb_appliquees, augmentation_derniere_date, augmentation_prochaine_date
     FROM contrats WHERE id = $1`,
    [contratId],
  );

  return {
    forfait: Number(lignes[0].prix_unitaire_ht),
    ligne_gratuite: Number(lignes[1].prix_unitaire_ht),
    cout_copie_nb: Number(machine.cout_copie_nb),
    service_connectic: Number(machine.service_connectic),
    ftc: Number(contrat.ftc),
    nb_appliquees: contrat.augmentation_nb_appliquees,
    derniere_date: contrat.augmentation_derniere_date,
    prochaine_date: contrat.augmentation_prochaine_date,
  };
}

before(async () => {
  const { rows } = await pool.query('SELECT 1');
  assert.equal(rows.length, 1, 'base de test injoignable');
});

// ───────────────────────────────────────────────────────────────────────────
// Calcul d'anniversaire
// ───────────────────────────────────────────────────────────────────────────

test('anniversaire — premier anniversaire strictement postérieur à la borne', () => {
  assert.equal(prochainAnniversaireApres('2026-07-01', '2026-09-22'), '2027-07-01');
  assert.equal(prochainAnniversaireApres('2020-03-15', '2026-09-22'), '2027-03-15');
  assert.equal(prochainAnniversaireApres('2026-07-01', '2026-06-30'), '2026-07-01');
});

test('anniversaire — la borne elle-même ne compte pas comme échue', () => {
  assert.equal(prochainAnniversaireApres('2026-07-01', '2027-07-01'), '2028-07-01');
});

test('anniversaire — un 29/02 tombe au 28/02 les années non bissextiles', () => {
  assert.equal(prochainAnniversaireApres('2024-02-29', '2024-06-01'), '2025-02-28');
  assert.equal(prochainAnniversaireApres('2024-02-29', '2027-06-01'), '2028-02-29');
});

test("planification — la date d'installation prime sur la signature et le début", () => {
  const plan = planifierAugmentation({
    date_installation: '2022-09-15',
    date_signature: '2022-05-10',
    date_debut: '2022-01-20',
    augmentation_date_reference: '2026-09-22',
  });
  assert.equal(plan.augmentation_prochaine_date, '2027-09-15');
});

test("planification — sans date d'installation, repli sur la signature", () => {
  const plan = planifierAugmentation(
    { date_installation: null, date_signature: '2022-05-10', date_debut: '2022-01-20', augmentation_date_reference: '2026-09-22' },
  );
  assert.equal(plan.augmentation_prochaine_date, '2027-05-10');
});

test('planification — sans installation ni signature, repli sur la date de début', () => {
  const plan = planifierAugmentation(
    { date_installation: null, date_signature: null, date_debut: '2022-05-10', augmentation_date_reference: '2026-09-22' },
  );
  assert.equal(plan.augmentation_prochaine_date, '2027-05-10');
});

test('planification — sans date exploitable, aucune augmentation planifiée', () => {
  const plan = planifierAugmentation({ date_installation: null, date_signature: null, date_debut: null });
  assert.equal(plan.augmentation_prochaine_date, null);
});

// ───────────────────────────────────────────────────────────────────────────
// Application
// ───────────────────────────────────────────────────────────────────────────

test('application — tous les tarifs du contrat augmentent, pas les montants nuls', async () => {
  const res = await avecContratJetable(
    { date_signature: '2026-07-01', augmentation_date_reference: '2026-09-22', augmentation_pourcentage: 2 },
    async (db, contratId) => {
      const applications = await appliquerAugmentationsDues(contratId, {
        dbClient: db,
        dateReference: '2027-07-01',
      });
      return { applications, apres: await tarifs(db, contratId) };
    },
  );

  assert.equal(res.applications.length, 1);
  assert.equal(res.applications[0].date_anniversaire, '2027-07-01');
  assert.equal(res.apres.forfait, 102);
  assert.equal(res.apres.cout_copie_nb, 0.0051);
  assert.equal(res.apres.service_connectic, 25.5);
  assert.equal(res.apres.ftc, 102);
  assert.equal(res.apres.ligne_gratuite, 0);
  assert.equal(res.apres.nb_appliquees, 1);
  assert.equal(res.apres.derniere_date, '2027-07-01');
  assert.equal(res.apres.prochaine_date, '2028-07-01');
});

test('application — un coût copie à 6 décimales ne perd pas de précision', async () => {
  const res = await avecContratJetable(
    {
      date_signature: '2026-07-01',
      augmentation_date_reference: '2026-09-22',
      augmentation_pourcentage: 3,
      cout_copie_nb: 0.006615,
      prix_ligne: 0.006615,
    },
    async (db, contratId) => {
      await appliquerAugmentationsDues(contratId, { dbClient: db, dateReference: '2027-07-01' });
      return tarifs(db, contratId);
    },
  );

  // 0,006615 × 1,03 = 0,00681345 — arrondir au dix-millième donnerait 0,0068,
  // soit 0,2 % perdus sur chaque copie facturée.
  assert.equal(res.cout_copie_nb, 0.00681345);
  assert.equal(res.forfait, 0.00681345);
});

test('application — composé : deux anniversaires échus donnent (1+t)²', async () => {
  const res = await avecContratJetable(
    { date_signature: '2026-07-01', augmentation_date_reference: '2026-09-22', augmentation_pourcentage: 10 },
    async (db, contratId) => {
      const applications = await appliquerAugmentationsDues(contratId, {
        dbClient: db,
        dateReference: '2028-08-01',
      });
      return { applications, apres: await tarifs(db, contratId) };
    },
  );

  assert.equal(res.applications.length, 2);
  assert.equal(res.apres.forfait, 121);
  assert.equal(res.apres.nb_appliquees, 2);
  assert.equal(res.apres.prochaine_date, '2029-07-01');
});

test('non-rétroactif — les anniversaires antérieurs à la date de référence sont ignorés', async () => {
  const res = await avecContratJetable(
    { date_signature: '2020-07-01', augmentation_date_reference: '2026-09-22', augmentation_pourcentage: 5 },
    async (db, contratId) => {
      const applications = await appliquerAugmentationsDues(contratId, {
        dbClient: db,
        dateReference: '2026-09-22',
      });
      return { applications, apres: await tarifs(db, contratId) };
    },
  );

  assert.equal(res.applications.length, 0);
  assert.equal(res.apres.forfait, 100);
  assert.equal(res.apres.prochaine_date, '2027-07-01');
});

test('idempotence — un anniversaire déjà appliqué ne repasse pas', async () => {
  const res = await avecContratJetable(
    { date_signature: '2026-07-01', augmentation_date_reference: '2026-09-22', augmentation_pourcentage: 2 },
    async (db, contratId) => {
      await appliquerAugmentationsDues(contratId, { dbClient: db, dateReference: '2027-07-01' });
      const secondPassage = await appliquerAugmentationsDues(contratId, { dbClient: db, dateReference: '2027-07-01' });
      return { secondPassage, apres: await tarifs(db, contratId) };
    },
  );

  assert.equal(res.secondPassage.length, 0);
  assert.equal(res.apres.forfait, 102);
  assert.equal(res.apres.nb_appliquees, 1);
});

test('toggle désactivé — aucune augmentation malgré un anniversaire échu', async () => {
  const res = await avecContratJetable(
    {
      date_signature: '2026-07-01',
      augmentation_date_reference: '2026-09-22',
      augmentation_pourcentage: 3,
      augmentation_active: false,
    },
    async (db, contratId) => {
      const applications = await appliquerAugmentationsDues(contratId, {
        dbClient: db,
        dateReference: '2027-07-01',
      });
      return { applications, apres: await tarifs(db, contratId) };
    },
  );

  assert.equal(res.applications.length, 0);
  assert.equal(res.apres.forfait, 100);
});

// ───────────────────────────────────────────────────────────────────────────
// CRUD contrat
// ───────────────────────────────────────────────────────────────────────────

test('création — le taux est borné et la planification posée sur le prochain anniversaire', async () => {
  let sortie = null;
  try {
    await runWithTenantContext(TENANT, async () => {
      const db = getClient();
      const { rows: [client] } = await db.query('SELECT id FROM clients ORDER BY id LIMIT 1');

      const contrat = await createContrat({
        type_contrat: 'Telephonie',
        client_id: client.id,
        date_debut: '2026-01-15',
        date_signature: '2020-03-10',
        date_installation: '2020-06-24',
        augmentation_pourcentage: 250,
        lignes: [{ designation: 'Forfait', quantite: 1, prix_unitaire_ht: 50, categorie_ligne: 'Forfait Fixe' }],
      });

      const apresDesactivation = await updateContrat(contrat.id, { augmentation_active: false });

      sortie = { contrat, apresDesactivation };
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  assert.equal(Number(sortie.contrat.augmentation_pourcentage), 100);
  assert.equal(sortie.contrat.augmentation_active, true);
  assert.equal(sortie.contrat.augmentation_date_reference, aujourdhui);
  assert.equal(
    sortie.contrat.augmentation_prochaine_date,
    prochainAnniversaireApres('2020-06-24', aujourdhui),
    "la planification part de l'installation, sans rattraper les anniversaires passés",
  );
  assert.equal(sortie.apresDesactivation.augmentation_active, false);
});

test('taux à 0 — le contrat est ignoré', async () => {
  const res = await avecContratJetable(
    { date_signature: '2026-07-01', augmentation_date_reference: '2026-09-22', augmentation_pourcentage: 0 },
    async (db, contratId) => {
      const applications = await appliquerAugmentationsDues(contratId, {
        dbClient: db,
        dateReference: '2030-01-01',
      });
      return { applications, apres: await tarifs(db, contratId) };
    },
  );

  assert.equal(res.applications.length, 0);
  assert.equal(res.apres.forfait, 100);
});
