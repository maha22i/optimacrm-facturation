// Tests de facturation copieur, joués contre la base de dev.
//
// Chaque scénario insère ses relevés puis génère une facture dans une
// transaction systématiquement annulée : rien n'est persisté. Seule la séquence
// des numéros de facture avance, PostgreSQL n'annulant jamais un nextval.
//
//   npm test
//
// Les jeux de données s'appuient sur deux contrats de la base :
//   -0755 (BHI)  machine solo avec forfait     → non-régression
//   0743         lot de 5 machines, 1 forfait  → facturation par lot

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';

import { pool, runWithTenantContext, getClient } from '../src/config/database.js';
import { genererDepuisContrat } from '../src/modules/factures/facture.service.js';
import { analyzeReleves } from '../src/modules/import-releves-compteurs/importRelevesCompteurs.service.js';

const TENANT = process.env.TEST_TENANT_ID || '3c2424b8-b557-471a-8c4a-2a14b44aafb8';
const USER = process.env.TEST_USER_ID || '1d63a231-8ffd-4e46-9e39-55afabe1e53a';
const PERIODE = { debut: '2026-07-01', fin: '2026-09-30' };
const ROLLBACK = Symbol('rollback');

// Lot 0743 : la principale porte le forfait 6000 N/B + 4500 couleur à
// 0,007553 / 0,075553, et les seuls services du contrat (495 + 25).
const PRINCIPALE = { serie: '22D19689', parc_id: 558 };
const ATTACHEES = [
  { serie: '2ER21035', parc_id: 581 },
  { serie: '2ER21034', parc_id: 530 },
  { serie: '2ER20969', parc_id: 531 },
  { serie: '22E27796', parc_id: 582 },
];
const BHI = { serie: '22E22485', parc_id: 445 };

function releve({ parc_id, statut = 'OK', volume_nb = 0, volume_couleur = 0,
                  depassement_nb = 0, montant_depassement_nb = 0,
                  depassement_couleur = 0, montant_depassement_couleur = 0,
                  compteur_nb = 100000, compteur_couleur = 50000 }) {
  return {
    parc_id, statut, volume_nb, volume_couleur,
    depassement_nb, montant_depassement_nb,
    depassement_couleur, montant_depassement_couleur,
    compteur_nb, compteur_couleur,
  };
}

async function genererAvecRollback(numeroContrat, releves) {
  let sortie = null;
  try {
    await runWithTenantContext(TENANT, async () => {
      const db = getClient();
      const { rows: [contrat] } = await db.query(
        'SELECT id FROM contrats WHERE numero_contrat = $1 AND deleted_at IS NULL', [numeroContrat]
      );
      assert.ok(contrat, `Contrat ${numeroContrat} absent de la base de test`);

      for (const r of releves) {
        await db.query(
          `INSERT INTO releves_compteurs (
             machine_id, date_releve, date_debut_periode, date_fin_periode,
             compteur_nb, compteur_couleur, ancien_compteur_nb, ancien_compteur_couleur,
             volume_nb, volume_couleur, depassement_nb, depassement_couleur,
             montant_depassement_nb, montant_depassement_couleur,
             forfait_nb, forfait_couleur, statut, source, est_facture
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,0,$15,'Import',false)`,
          [
            r.parc_id, PERIODE.fin, PERIODE.debut, PERIODE.fin,
            r.compteur_nb, r.compteur_couleur,
            r.compteur_nb - r.volume_nb, r.compteur_couleur - r.volume_couleur,
            r.volume_nb, r.volume_couleur,
            r.depassement_nb, r.depassement_couleur,
            r.montant_depassement_nb, r.montant_depassement_couleur,
            r.statut,
          ]
        );
      }

      try {
        const facture = await genererDepuisContrat(contrat.id, USER, {
          periode_debut: PERIODE.debut, periode_fin: PERIODE.fin,
        });
        const { rows: lignes } = await db.query(
          `SELECT type_ligne, reference, designation, description, quantite,
                  prix_unitaire, total_ht, releve_compteur_id
           FROM facture_lignes WHERE facture_id = $1 ORDER BY position`,
          [facture.id]
        );
        sortie = { total_ht: Number(facture.total_ht), lignes };
      } catch (err) {
        sortie = { erreur: err.message, lignes: [] };
      }

      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return sortie;
}

const refs = (res, reference) => res.lignes.filter(l => l.reference === reference);

before(async () => {
  const { rows } = await pool.query('SELECT 1');
  assert.equal(rows.length, 1, 'base de test injoignable');
});

// ───────────────────────────────────────────────────────────────────────────
// NON-RÉGRESSION — machine solo (identifiant_lot NULL)
// ───────────────────────────────────────────────────────────────────────────

test('solo BHI — premier relevé : FORF1 + FORF2 + services, aucune régul', async () => {
  const res = await genererAvecRollback('-0755', [
    releve({ parc_id: BHI.parc_id, statut: 'PREMIER_RELEVE' }),
  ]);

  assert.equal(res.erreur, undefined);
  assert.equal(res.total_ht, 193.98);
  assert.deepEqual(res.lignes.map(l => l.reference), ['FORF1', 'FORF2', 'CNTC', 'AUT']);
  assert.equal(Number(refs(res, 'FORF1')[0].quantite), 3189);
  assert.equal(Number(refs(res, 'FORF1')[0].total_ht), 29.70);
  assert.equal(Number(refs(res, 'FORF2')[0].total_ht), 50.28);
});

test('solo BHI — dépassement : régul unique au montant pré-calculé du relevé', async () => {
  const res = await genererAvecRollback('-0755', [
    releve({
      parc_id: BHI.parc_id, statut: 'DEPASSEMENT',
      volume_nb: 3689, depassement_nb: 500, montant_depassement_nb: 4.66,
    }),
  ]);

  assert.equal(res.erreur, undefined);
  assert.equal(refs(res, 'REGUL_NB').length, 1);
  assert.equal(Number(refs(res, 'REGUL_NB')[0].quantite), 500);
  assert.equal(Number(refs(res, 'REGUL_NB')[0].total_ht), 4.66);
  assert.equal(refs(res, 'REGUL_COUL').length, 0);
  assert.equal(res.total_ht, 198.64);
});

// ───────────────────────────────────────────────────────────────────────────
// LOT — 5 machines, un seul forfait porté par la principale
// Conso N/B : 3000 + 4×1000 = 7000 pour un forfait de 6000 → 1000 en dépassement
// Conso couleur : 1000 + 4×750 = 4000 pour un forfait de 4500 → aucun dépassement
// ───────────────────────────────────────────────────────────────────────────

function relevesLot0743() {
  return [
    releve({ parc_id: PRINCIPALE.parc_id, volume_nb: 3000, volume_couleur: 1000 }),
    ...ATTACHEES.map(a => releve({ parc_id: a.parc_id, volume_nb: 1000, volume_couleur: 750 })),
  ];
}

test('lot 0743 — un seul forfait facturé pour les 5 machines', async () => {
  const res = await genererAvecRollback('0743', relevesLot0743());

  assert.equal(res.erreur, undefined);
  assert.equal(refs(res, 'FORF1').length, 1);
  assert.equal(refs(res, 'FORF2').length, 1);
  assert.equal(Number(refs(res, 'FORF1')[0].quantite), 6000);
  assert.equal(Number(refs(res, 'FORF1')[0].total_ht), 45.32);
  assert.equal(Number(refs(res, 'FORF2')[0].total_ht), 339.99);
});

test('lot 0743 — régul unique sur la consommation cumulée du lot', async () => {
  const res = await genererAvecRollback('0743', relevesLot0743());

  const regul = refs(res, 'REGUL_NB');
  assert.equal(regul.length, 1, 'une seule régularisation pour tout le lot');
  assert.equal(Number(regul[0].quantite), 1000, '7000 consommées - 6000 de forfait');
  assert.equal(Number(regul[0].prix_unitaire), 0.007553, 'coût copie de la principale');
  assert.equal(Number(regul[0].total_ht), 7.55);
  assert.equal(refs(res, 'REGUL_COUL').length, 0, '4000 couleur sous le forfait de 4500');
});

test('lot 0743 — les machines attachées ne facturent aucune copie à l\'unité', async () => {
  const res = await genererAvecRollback('0743', relevesLot0743());

  assert.equal(refs(res, 'COPIES_NB').length, 0);
  assert.equal(refs(res, 'COPIES_COUL').length, 0);
  assert.equal(res.total_ht, 912.86, 'forfaits + régul lot + services de la principale');
});

test('lot 0743 — la régul est traçable : relevé de la principale et détail du lot', async () => {
  const res = await genererAvecRollback('0743', relevesLot0743());

  const [regul] = refs(res, 'REGUL_NB');
  assert.ok(regul.releve_compteur_id, 'rattachée au relevé de la principale');
  assert.match(regul.description, /0743/, 'le lot est nommé dans la description');
  for (const a of ATTACHEES) {
    assert.match(regul.description, new RegExp(a.serie), `${a.serie} détaillée dans la description`);
  }
});

test('lot 0743 — les services restent facturés par machine', async () => {
  const res = await genererAvecRollback('0743', relevesLot0743());

  assert.equal(refs(res, 'CNTC').length, 1);
  assert.equal(Number(refs(res, 'CNTC')[0].total_ht), 495);
  assert.equal(Number(refs(res, 'AUT')[0].total_ht), 25);
});

// ───────────────────────────────────────────────────────────────────────────
// ANALYSE DES RELEVÉS — statut des machines de lot
// Un relevé de référence est posé sur chaque machine pour sortir du premier
// relevé, puis un fichier fictif fait consommer 5 000 copies à tout le parc.
// ───────────────────────────────────────────────────────────────────────────

async function analyserToutLeParc() {
  const TEMP = path.resolve('uploads/import-temp');
  const fileId = `test_lot_${Date.now()}`;
  let sortie = null;

  try {
    await runWithTenantContext(TENANT, async () => {
      const db = getClient();
      const { rows: attendus } = await db.query(`
        SELECT cm.numero_serie, cm.est_principale, cm.identifiant_lot,
               (p.contrat_id IS NOT NULL) AS lot_a_principale,
               COUNT(*) OVER (PARTITION BY UPPER(cm.numero_serie)) AS occurrences
        FROM contrat_machines cm
        LEFT JOIN (SELECT DISTINCT contrat_id, identifiant_lot
                     FROM contrat_machines WHERE est_principale AND actif) p
          ON p.contrat_id = cm.contrat_id AND p.identifiant_lot = cm.identifiant_lot
        WHERE cm.actif
      `);

      const series = [...new Set(attendus.map(a => a.numero_serie))];
      const { rows: parc } = await db.query(
        'SELECT id, numero_serie FROM parc_machines WHERE UPPER(numero_serie) = ANY($1)',
        [series.map(s => s.toUpperCase())]
      );

      for (const m of parc) {
        await db.query(
          `INSERT INTO releves_compteurs (machine_id, date_releve, compteur_nb, compteur_couleur,
             ancien_compteur_nb, ancien_compteur_couleur, volume_nb, volume_couleur,
             depassement_nb, depassement_couleur, montant_depassement_nb, montant_depassement_couleur,
             forfait_nb, forfait_couleur, statut, source, est_facture)
           VALUES ($1,'2026-06-30',50000,20000,0,0,0,0,0,0,0,0,0,0,'PREMIER_RELEVE','Import',true)`,
          [m.id]
        );
      }

      await fs.mkdir(TEMP, { recursive: true });
      await fs.writeFile(path.join(TEMP, `${fileId}.json`), JSON.stringify({
        headers: ['serie', 'nb', 'coul'],
        rows: parc.map(m => ({ serie: m.numero_serie, nb: '55000', coul: '22000' })),
      }));

      const { lignes, summary } = await analyzeReleves(fileId, {
        numero_serie: 'serie', compteur_nb: 'nb', compteur_couleur: 'coul',
      }, { date_debut: PERIODE.debut, date_fin: PERIODE.fin });

      sortie = { lignes, summary, attendus: attendus.filter(a => Number(a.occurrences) === 1) };
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await fs.unlink(path.join(TEMP, `${fileId}.json`)).catch(() => {});
  }

  return sortie;
}

test('analyse — les attachées d\'un lot complet sortent en LOT_ATTACHEE à 0 €', async () => {
  const { lignes, summary, attendus } = await analyserToutLeParc();
  const parSerie = new Map(lignes.map(l => [l.numero_serie.toUpperCase(), l]));
  assert.equal(summary.lot_attachees, lignes.filter(l => l.statut === 'LOT_ATTACHEE').length);

  const attachees = attendus.filter(a => a.identifiant_lot && !a.est_principale && a.lot_a_principale);
  assert.ok(attachees.length > 50, `échantillon trop faible : ${attachees.length} attachées`);

  for (const a of attachees) {
    const l = parSerie.get(a.numero_serie.toUpperCase());
    if (!l || l.statut === 'HORS_CONTRAT') continue;
    assert.equal(l.statut, 'LOT_ATTACHEE', `${a.numero_serie} (lot ${a.identifiant_lot})`);
    assert.equal(l.montant_total_ht, 0, `${a.numero_serie} ne doit rien facturer seule`);
    assert.equal(l.volume_nb, 5000, `${a.numero_serie} garde son volume pour l'agrégation`);
  }
});

test('analyse — principales, solos et fragments inter-contrats inchangés', async () => {
  const { lignes, attendus } = await analyserToutLeParc();
  const parSerie = new Map(lignes.map(l => [l.numero_serie.toUpperCase(), l]));

  for (const a of attendus) {
    const l = parSerie.get(a.numero_serie.toUpperCase());
    if (!l) continue;
    const estAttacheeAgregee = a.identifiant_lot && !a.est_principale && a.lot_a_principale;
    if (estAttacheeAgregee) continue;
    assert.notEqual(l.statut, 'LOT_ATTACHEE', `${a.numero_serie} ne doit pas être marquée machine de lot`);
  }
});

test.after(async () => { await pool.end(); });
