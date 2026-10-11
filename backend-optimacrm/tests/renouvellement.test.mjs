// Tests du renouvellement automatique des contrats copieur.
//
// Le calcul des dates est testé en pur. Les scénarios en base créent leur
// propre contrat dans une transaction systématiquement annulée : rien n'est
// persisté (seules les séquences avancent, PostgreSQL n'annulant pas nextval).
//
//   npm test
//
// Règles vérifiées : départ sur la mise en service, échéance initiale figée,
// avance par tacite reconduction jusqu'à une date non passée, alerte au
// préavis, et traitement d'alerte rattaché à une échéance précise.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';

import { pool, runWithTenantContext, getClient } from '../src/config/database.js';
import {
  calculerRenouvellement,
  recalculerRenouvellement,
  listerRenouvellements,
  compterAlertesRenouvellement,
  marquerTraite,
  annulerTraitement,
} from '../src/modules/contrats/renouvellement.service.js';
import { createContrat, updateContrat } from '../src/modules/contrats/contrat.service.js';

const TENANT = process.env.TEST_TENANT_ID || '3c2424b8-b557-471a-8c4a-2a14b44aafb8';
const ROLLBACK = Symbol('rollback');

/** Joue `scenario` dans une transaction annulée à la sortie. */
async function dansUneTransactionAnnulee(scenario) {
  let sortie = null;
  try {
    await runWithTenantContext(TENANT, async () => {
      sortie = await scenario(getClient());
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return sortie;
}

/** Crée un contrat copieur jetable directement en SQL, sans passer par le CRUD. */
async function contratJetable(db, champs = {}) {
  const {
    date_installation = null,
    date_debut = '2020-06-01',
    duree_contrat_mois = 36,
    duree_reconduction_mois = 12,
    preavis_renouvellement_mois = 6,
    date_echeance = null,
    date_renouvellement = null,
    type_contrat = 'Copieur',
    statut = 'Actif',
  } = champs;

  const { rows: [client] } = await db.query('SELECT id FROM clients ORDER BY id LIMIT 1');
  assert.ok(client, 'aucun client dans la base de test');

  const { rows: [contrat] } = await db.query(
    `INSERT INTO contrats (
       numero_contrat, type_contrat, type_facturation, client_id, periodicite,
       date_debut, date_installation, date_echeance, date_renouvellement,
       duree_contrat_mois, duree_reconduction_mois, preavis_renouvellement_mois, statut
     ) VALUES ($1, $2, 'Periodique', $3, 'Trimestriel', $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      `TEST-RENOUV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type_contrat, client.id, date_debut, date_installation,
      date_echeance, date_renouvellement,
      duree_contrat_mois, duree_reconduction_mois, preavis_renouvellement_mois, statut,
    ],
  );
  return contrat.id;
}

async function datesDuContrat(db, contratId) {
  const { rows: [c] } = await db.query(
    `SELECT date_echeance, date_renouvellement,
            renouvellement_traite_echeance, renouvellement_traite_date, renouvellement_traite_par
     FROM contrats WHERE id = $1`,
    [contratId],
  );
  return c;
}

before(async () => {
  const { rows } = await pool.query('SELECT 1');
  assert.equal(rows.length, 1, 'base de test injoignable');
});

// ───────────────────────────────────────────────────────────────────────────
// Calcul des dates
// ───────────────────────────────────────────────────────────────────────────

test('calcul — le décompte part de la mise en service, pas de la date de début', () => {
  const res = calculerRenouvellement(
    { date_installation: '2024-04-15', date_debut: '2024-01-01', duree_contrat_mois: 36 },
    '2026-09-22',
  );
  assert.equal(res.date_echeance, '2027-04-15');
  assert.equal(res.date_renouvellement, '2027-04-15');
  assert.equal(res.nb_reconductions, 0);
});

test('calcul — sans installation, repli sur la date de début', () => {
  const res = calculerRenouvellement(
    { date_installation: null, date_debut: '2024-04-15', duree_contrat_mois: 60 },
    '2026-09-22',
  );
  assert.equal(res.date_echeance, '2029-04-15');
});

test('calcul — les reconductions successives amènent à la prochaine échéance réelle', () => {
  const res = calculerRenouvellement(
    {
      date_installation: '2019-06-01',
      duree_contrat_mois: 36,
      duree_reconduction_mois: 12,
      preavis_renouvellement_mois: 6,
    },
    '2026-09-22',
  );
  // Fin de période initiale au 01/06/2022, puis 2023, 2024, 2025, 2026 passées.
  assert.equal(res.date_echeance, '2022-06-01');
  assert.equal(res.date_renouvellement, '2027-06-01');
  assert.equal(res.nb_reconductions, 5);
  assert.equal(res.date_alerte, '2026-12-01');
});

test('calcul — une échéance tombant aujourd\'hui reste affichée', () => {
  const res = calculerRenouvellement(
    { date_installation: '2023-09-22', duree_contrat_mois: 36, duree_reconduction_mois: 12 },
    '2026-09-22',
  );
  assert.equal(res.date_renouvellement, '2026-09-22');
  assert.equal(res.nb_reconductions, 0);
});

test('calcul — sans reconduction, le contrat s\'arrête à sa période initiale', () => {
  const res = calculerRenouvellement(
    { date_installation: '2015-01-10', duree_contrat_mois: 36, duree_reconduction_mois: 0 },
    '2026-09-22',
  );
  assert.equal(res.date_renouvellement, '2018-01-10');
  assert.equal(res.nb_reconductions, 0);
});

test('calcul — le débordement de fin de mois est borné', () => {
  const res = calculerRenouvellement(
    { date_installation: '2024-08-31', duree_contrat_mois: 6, duree_reconduction_mois: 1 },
    '2026-09-22',
  );
  // 31/08/2024 + 6 mois = 28/02/2025, puis pas de 31 dans les mois courts.
  assert.equal(res.date_echeance, '2025-02-28');
  assert.equal(res.date_renouvellement, '2026-09-28');
});

test('calcul — sans durée exploitable, aucune date n\'est produite', () => {
  const res = calculerRenouvellement({ date_installation: '2024-01-01', duree_contrat_mois: 0 });
  assert.equal(res.date_echeance, null);
  assert.equal(res.date_renouvellement, null);
});

test('calcul — préavis à zéro : l\'alerte tombe le jour de l\'échéance', () => {
  const res = calculerRenouvellement(
    { date_installation: '2024-04-15', duree_contrat_mois: 36, preavis_renouvellement_mois: 0 },
    '2026-09-22',
  );
  assert.equal(res.date_alerte, res.date_renouvellement);
});

// ───────────────────────────────────────────────────────────────────────────
// Enregistrement
// ───────────────────────────────────────────────────────────────────────────

test('recalcul — une date de renouvellement dépassée avance d\'une période', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const id = await contratJetable(db, {
      date_installation: '2019-06-01',
      duree_contrat_mois: 36,
      duree_reconduction_mois: 12,
      date_renouvellement: '2026-06-01',
      date_echeance: '2022-06-01',
    });
    await recalculerRenouvellement(id, { dbClient: db, dateReference: '2026-09-22' });
    return datesDuContrat(db, id);
  });

  assert.equal(res.date_renouvellement, '2027-06-01');
  assert.equal(res.date_echeance, '2022-06-01');
});

test('recalcul — les contrats hors copieur ne sont pas touchés', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const id = await contratJetable(db, {
      type_contrat: 'Telephonie',
      date_installation: '2019-06-01',
      duree_contrat_mois: 36,
      date_renouvellement: '2020-01-01',
      date_echeance: '2020-01-01',
    });
    const calcul = await recalculerRenouvellement(id, { dbClient: db, dateReference: '2026-09-22' });
    return { calcul, dates: await datesDuContrat(db, id) };
  });

  assert.equal(res.calcul, null);
  assert.equal(res.dates.date_renouvellement, '2020-01-01');
});

test('recalcul — sans durée exploitable, les dates importées restent en place', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const id = await contratJetable(db, {
      duree_contrat_mois: 0,
      date_renouvellement: '2020-01-01',
      date_echeance: '2019-01-01',
    });
    await recalculerRenouvellement(id, { dbClient: db, dateReference: '2026-09-22' });
    return datesDuContrat(db, id);
  });

  assert.equal(res.date_renouvellement, '2020-01-01');
  assert.equal(res.date_echeance, '2019-01-01');
});

test('création — les dates envoyées par le formulaire sont remplacées par le calcul', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const { rows: [client] } = await db.query('SELECT id FROM clients ORDER BY id LIMIT 1');
    return createContrat({
      type_contrat: 'Copieur',
      client_id: client.id,
      date_debut: '2024-01-01',
      date_installation: '2024-04-15',
      duree_contrat_mois: 36,
      duree_reconduction_mois: 12,
      preavis_renouvellement_mois: 3,
      date_echeance: '2030-01-01',
      date_renouvellement: '2030-01-01',
      lignes: [{ designation: 'Forfait', quantite: 1, prix_unitaire_ht: 50, categorie_ligne: 'Forfait Copie N&B' }],
    });
  });

  assert.equal(res.date_echeance, '2027-04-15');
  assert.equal(res.date_renouvellement, '2027-04-15');
  assert.equal(res.duree_reconduction_mois, 12);
  assert.equal(res.preavis_renouvellement_mois, 3);
});

test('création — les durées hors bornes retombent sur les valeurs par défaut', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const { rows: [client] } = await db.query('SELECT id FROM clients ORDER BY id LIMIT 1');
    return createContrat({
      type_contrat: 'Copieur',
      client_id: client.id,
      date_debut: '2024-01-01',
      duree_reconduction_mois: -5,
      preavis_renouvellement_mois: 999,
      lignes: [{ designation: 'Forfait', quantite: 1, prix_unitaire_ht: 50, categorie_ligne: 'Forfait Copie N&B' }],
    });
  });

  assert.equal(res.duree_reconduction_mois, 12);
  assert.equal(res.preavis_renouvellement_mois, 60);
});

test('modification — changer la mise en service décale les deux dates', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const { rows: [client] } = await db.query('SELECT id FROM clients ORDER BY id LIMIT 1');
    const contrat = await createContrat({
      type_contrat: 'Copieur',
      client_id: client.id,
      date_debut: '2024-01-01',
      date_installation: '2024-04-15',
      duree_contrat_mois: 36,
      lignes: [{ designation: 'Forfait', quantite: 1, prix_unitaire_ht: 50, categorie_ligne: 'Forfait Copie N&B' }],
    });
    return updateContrat(contrat.id, { date_installation: '2024-10-01' });
  });

  assert.equal(res.date_echeance, '2027-10-01');
  assert.equal(res.date_renouvellement, '2027-10-01');
});

// ───────────────────────────────────────────────────────────────────────────
// Alertes
// ───────────────────────────────────────────────────────────────────────────

test('alerte — le contrat apparaît dès le début du préavis, disparaît une fois traité', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const aujourdhui = new Date();
    const dansTroisMois = new Date(Date.UTC(
      aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + 3, 15,
    )).toISOString().slice(0, 10);

    const id = await contratJetable(db, {
      date_installation: '2019-06-01',
      duree_contrat_mois: 36,
      date_renouvellement: dansTroisMois,
      date_echeance: '2022-06-01',
      preavis_renouvellement_mois: 6,
    });

    const avant = await listerRenouvellements();
    const compteurAvant = await compterAlertesRenouvellement();

    const traite = await marquerTraite(id, { userNom: 'Testeur' });
    const apresTraitement = await listerRenouvellements();
    const compteurApres = await compterAlertesRenouvellement();
    const avecTraites = await listerRenouvellements({ inclureTraites: true });

    await annulerTraitement(id);
    const apresAnnulation = await listerRenouvellements();

    return {
      id,
      presentAvant: avant.some(c => c.id === id),
      compteurAvant,
      traite,
      presentApresTraitement: apresTraitement.some(c => c.id === id),
      compteurApres,
      presentAvecTraites: avecTraites.some(c => c.id === id),
      presentApresAnnulation: apresAnnulation.some(c => c.id === id),
    };
  });

  assert.equal(res.presentAvant, true, 'le préavis de 6 mois couvre une échéance à 3 mois');
  assert.equal(res.traite.renouvellement_traite_par, 'Testeur');
  assert.equal(res.traite.renouvellement_traite_echeance, res.traite.date_renouvellement);
  assert.equal(res.presentApresTraitement, false);
  assert.equal(res.compteurApres, res.compteurAvant - 1);
  assert.equal(res.presentAvecTraites, true);
  assert.equal(res.presentApresAnnulation, true);
});

test('alerte — une échéance encore loin n\'apparaît qu\'avec un horizon élargi', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const aujourdhui = new Date();
    const dansDixMois = new Date(Date.UTC(
      aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + 10, 15,
    )).toISOString().slice(0, 10);

    const id = await contratJetable(db, {
      date_installation: '2019-06-01',
      duree_contrat_mois: 36,
      date_renouvellement: dansDixMois,
      date_echeance: '2022-06-01',
      preavis_renouvellement_mois: 6,
    });

    return {
      id,
      enAlerte: (await listerRenouvellements()).some(c => c.id === id),
      dansHorizon12: (await listerRenouvellements({ horizonMois: 12 })).some(c => c.id === id),
    };
  });

  assert.equal(res.enAlerte, false);
  assert.equal(res.dansHorizon12, true);
});

test('alerte — un contrat résilié sort de la liste', async () => {
  const res = await dansUneTransactionAnnulee(async (db) => {
    const id = await contratJetable(db, {
      date_installation: '2019-06-01',
      duree_contrat_mois: 36,
      date_renouvellement: new Date().toISOString().slice(0, 10),
      statut: 'Résilié',
    });
    return (await listerRenouvellements()).some(c => c.id === id);
  });

  assert.equal(res, false);
});
