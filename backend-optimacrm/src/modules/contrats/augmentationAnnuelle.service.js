import { query, pool, getClient } from '../../config/database.js';
import { toDateStr, addMonthsUTC } from '../../utils/dateUtils.js';

// ---------------------------------------------------------------------------
// Augmentation annuelle des tarifs d'un contrat.
//
// Règles (identiques pour les 4 types de contrat) :
//   • anniversaire = date d'installation, repli sur la date de signature puis
//     sur la date de début si absente ;
//   • taux composé : chaque anniversaire multiplie les tarifs déjà augmentés,
//     ce qui est obtenu naturellement en appliquant le coefficient une fois par
//     anniversaire sur les valeurs courantes ;
//   • non rétroactif : augmentation_date_reference borne le passé. Seuls les
//     anniversaires postérieurs à cette date (posée à la mise en place) sont
//     appliqués, jamais ceux déjà écoulés avant ;
//   • pas de prorata : un anniversaire tombant au milieu d'une période de
//     facturation s'applique en totalité sur la période suivante.
//
// L'augmentation est écrite en dur sur le contrat plutôt que calculée à la
// facturation : les montants de dépassement copieur sont figés dès l'import des
// relevés (montant_depassement_nb = dépassement × cout_copie_nb), un
// coefficient volant y créerait un écart entre l'import et la facture.
// contrat_augmentations conserve les valeurs avant/après de chaque application.
// ---------------------------------------------------------------------------

const STATUTS_EXCLUS = ['Résilié', 'Échu'];

// Un anniversaire par an : la boucle de rattrapage ne peut pas légitimement
// dépasser la durée de vie d'un contrat.
const MAX_ANNIVERSAIRES_PAR_PASSE = 30;

// Précision d'arrondi = échelle de la colonne (migration 029 : NUMERIC(20,10)
// pour les tarifs de contrat et de parc, migration 011 : NUMERIC(10,2) pour le
// FTC). Arrondir un coût copie au centime le ramènerait à 0, et l'arrondir au
// dix-millième ferait perdre 0,1 % sur les tarifs à 6 décimales.
const DECIMALES_TARIF = 10;
const DECIMALES_FTC = 2;

const CHAMPS_MACHINE = [
  { champ: 'cout_copie_nb', libelle: 'Coût copie N&B' },
  { champ: 'cout_copie_couleur', libelle: 'Coût copie couleur' },
  { champ: 'cout_copie_t1', libelle: 'Coût copie T1' },
  { champ: 'cout_copie_t2', libelle: 'Coût copie T2' },
  { champ: 'cout_copie_t3', libelle: 'Coût copie T3' },
  { champ: 'service_connectic', libelle: 'Service Connectic' },
  { champ: 'service_collecteur', libelle: 'Service Collecteur' },
  { champ: 'service_divers', libelle: 'Service Divers' },
  { champ: 'service_autre', libelle: 'Service Autre' },
];

const CHAMPS_PARC_MACHINE = [
  { champ: 'cout_copie_nb', libelle: 'Coût copie N&B (parc)' },
  { champ: 'cout_copie_couleur', libelle: 'Coût copie couleur (parc)' },
];

function aujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

function arrondir(valeur, decimales) {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
}

/** Date servant d'anniversaire pour un contrat, ou null si indéterminable. */
export function dateAnniversaire(contrat) {
  return toDateStr(contrat.date_installation)
    || toDateStr(contrat.date_signature)
    || toDateStr(contrat.date_debut);
}

/**
 * Premier anniversaire de `anniv` strictement postérieur à `borne`.
 * Le décalage part toujours de la date d'origine : un 29/02 tombe sur le 28/02
 * les années non bissextiles mais retrouve le 29/02 les années bissextiles.
 */
export function prochainAnniversaireApres(anniv, borne) {
  const base = toDateStr(anniv);
  const limite = toDateStr(borne);
  if (!base || !limite) return null;

  let annees = Math.max(0, Number(limite.slice(0, 4)) - Number(base.slice(0, 4)));
  let candidat = addMonthsUTC(base, 12 * annees);
  while (candidat <= limite) {
    annees += 1;
    candidat = addMonthsUTC(base, 12 * annees);
  }
  return candidat;
}

/**
 * Planification à (re)poser sur un contrat : date de référence du non-rétroactif
 * et prochain anniversaire à traiter. Un anniversaire déjà appliqué n'est jamais
 * repris, même si la date d'installation est corrigée après coup.
 */
export function planifierAugmentation(contrat, dateMiseEnPlace = aujourdhui()) {
  const reference = toDateStr(contrat.augmentation_date_reference) || dateMiseEnPlace;
  const derniere = toDateStr(contrat.augmentation_derniere_date);
  const borne = derniere && derniere > reference ? derniere : reference;
  const anniv = dateAnniversaire(contrat);

  return {
    augmentation_date_reference: reference,
    augmentation_prochaine_date: anniv ? prochainAnniversaireApres(anniv, borne) : null,
  };
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/**
 * Applique le coefficient sur tous les montants facturables du contrat :
 * prix unitaires des lignes, coûts copie et services des machines, FTC, et
 * coûts copie du parc pour les machines facturées hors contrat_machines.
 */
async function appliquerCoefficient(dbClient, contrat, coefficient) {
  const details = [];

  const { rows: lignes } = await dbClient.query(
    `SELECT id, designation, categorie_ligne, prix_unitaire_ht
     FROM contrat_lignes WHERE contrat_id = $1 ORDER BY ordre, id`,
    [contrat.id],
  );

  for (const ligne of lignes) {
    const avant = parseFloat(ligne.prix_unitaire_ht) || 0;
    if (avant <= 0) continue;
    const apres = arrondir(avant * coefficient, DECIMALES_TARIF);
    if (apres === avant) continue;

    await dbClient.query(
      'UPDATE contrat_lignes SET prix_unitaire_ht = $1, updated_at = NOW() WHERE id = $2',
      [apres, ligne.id],
    );
    details.push({
      cible: 'ligne_contrat',
      cible_id: ligne.id,
      libelle: ligne.designation || ligne.categorie_ligne || `Ligne ${ligne.id}`,
      champ: 'prix_unitaire_ht',
      avant,
      apres,
    });
  }

  const colonnesMachine = CHAMPS_MACHINE.map(c => c.champ).join(', ');
  const { rows: machines } = await dbClient.query(
    `SELECT id, numero_serie, designation, ${colonnesMachine}
     FROM contrat_machines WHERE contrat_id = $1 ORDER BY id`,
    [contrat.id],
  );

  for (const machine of machines) {
    for (const { champ, libelle } of CHAMPS_MACHINE) {
      const avant = parseFloat(machine[champ]) || 0;
      if (avant <= 0) continue;
      const apres = arrondir(avant * coefficient, DECIMALES_TARIF);
      if (apres === avant) continue;

      await dbClient.query(
        `UPDATE contrat_machines SET ${champ} = $1, updated_at = NOW() WHERE id = $2`,
        [apres, machine.id],
      );
      details.push({
        cible: 'machine_contrat',
        cible_id: machine.id,
        libelle: `${libelle} — ${machine.numero_serie}`,
        champ,
        avant,
        apres,
      });
    }
  }

  const colonnesParc = CHAMPS_PARC_MACHINE.map(c => c.champ).join(', ');
  const { rows: parcMachines } = await dbClient.query(
    `SELECT id, numero_serie, ${colonnesParc}
     FROM parc_machines WHERE contrat_id = $1 ORDER BY id`,
    [contrat.id],
  );

  for (const machine of parcMachines) {
    for (const { champ, libelle } of CHAMPS_PARC_MACHINE) {
      const avant = parseFloat(machine[champ]) || 0;
      if (avant <= 0) continue;
      const apres = arrondir(avant * coefficient, DECIMALES_TARIF);
      if (apres === avant) continue;

      await dbClient.query(
        `UPDATE parc_machines SET ${champ} = $1, updated_at = NOW() WHERE id = $2`,
        [apres, machine.id],
      );
      details.push({
        cible: 'machine_parc',
        cible_id: machine.id,
        libelle: `${libelle} — ${machine.numero_serie}`,
        champ,
        avant,
        apres,
      });
    }
  }

  const ftcAvant = parseFloat(contrat.ftc) || 0;
  if (ftcAvant > 0) {
    const ftcApres = arrondir(ftcAvant * coefficient, DECIMALES_FTC);
    if (ftcApres !== ftcAvant) {
      await dbClient.query(
        'UPDATE contrats SET ftc = $1, updated_at = NOW() WHERE id = $2',
        [ftcApres, contrat.id],
      );
      contrat.ftc = ftcApres;
      details.push({
        cible: 'contrat',
        cible_id: contrat.id,
        libelle: 'Frais techniques complémentaires (FTC)',
        champ: 'ftc',
        avant: ftcAvant,
        apres: ftcApres,
      });
    }
  }

  return details;
}

/**
 * Rattrape tous les anniversaires échus d'un contrat à la date donnée.
 * Idempotent : l'unicité (contrat_id, date_anniversaire) de l'historique est
 * réservée avant toute modification de tarif, donc un anniversaire déjà traité
 * ne peut pas être appliqué une seconde fois (job et facturation concurrents).
 *
 * @returns {Promise<Array>} une entrée par augmentation réellement appliquée
 */
export async function appliquerAugmentationsDues(contratId, options = {}) {
  const {
    dateReference = aujourdhui(),
    declencheur = 'Job',
    userId = null,
  } = options;

  const dbClient = options.dbClient || getClient() || await pool.connect();
  const ownConnection = !options.dbClient && !getClient();

  try {
    if (ownConnection) await dbClient.query('BEGIN');

    const { rows: [contrat] } = await dbClient.query(
      `SELECT id, numero_contrat, type_contrat, ftc, statut,
              date_installation, date_signature, date_debut,
              augmentation_active, augmentation_pourcentage, augmentation_date_reference,
              augmentation_prochaine_date, augmentation_derniere_date, augmentation_nb_appliquees,
              created_at
       FROM contrats
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [contratId],
    );

    if (!contrat) {
      if (ownConnection) await dbClient.query('COMMIT');
      return [];
    }

    const taux = parseFloat(contrat.augmentation_pourcentage) || 0;
    const anniv = dateAnniversaire(contrat);
    const eligible = contrat.augmentation_active
      && taux > 0
      && anniv
      && !STATUTS_EXCLUS.includes(contrat.statut);

    const reference = toDateStr(contrat.augmentation_date_reference)
      || toDateStr(contrat.created_at)
      || dateReference;

    let prochaine = toDateStr(contrat.augmentation_prochaine_date)
      || (anniv ? prochainAnniversaireApres(anniv, reference) : null);

    const applications = [];
    const coefficient = 1 + taux / 100;

    if (eligible) {
      let garde = 0;
      while (prochaine && prochaine <= dateReference && garde < MAX_ANNIVERSAIRES_PAR_PASSE) {
        garde += 1;

        const { rows: [reservation] } = await dbClient.query(
          `INSERT INTO contrat_augmentations
             (contrat_id, date_anniversaire, pourcentage, declencheur, applique_par)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (contrat_id, date_anniversaire) DO NOTHING
           RETURNING id`,
          [contrat.id, prochaine, taux, declencheur, userId ? String(userId) : null],
        );

        if (reservation) {
          const details = await appliquerCoefficient(dbClient, contrat, coefficient);

          await dbClient.query(
            'UPDATE contrat_augmentations SET nb_elements = $1, details = $2 WHERE id = $3',
            [details.length, JSON.stringify(details), reservation.id],
          );

          applications.push({
            contrat_id: contrat.id,
            numero_contrat: contrat.numero_contrat,
            type_contrat: contrat.type_contrat,
            date_anniversaire: prochaine,
            pourcentage: taux,
            nb_elements: details.length,
            details,
          });
        }

        prochaine = prochainAnniversaireApres(anniv, prochaine);
      }
    }

    if (applications.length > 0) {
      const derniere = applications[applications.length - 1].date_anniversaire;
      await dbClient.query(
        `UPDATE contrats SET
           augmentation_date_reference = COALESCE(augmentation_date_reference, $1),
           augmentation_prochaine_date = $2,
           augmentation_derniere_date = $3,
           augmentation_nb_appliquees = augmentation_nb_appliquees + $4,
           updated_at = NOW()
         WHERE id = $5`,
        [reference, prochaine, derniere, applications.length, contrat.id],
      );
    } else {
      // Aucune augmentation due : on profite du passage pour réparer une
      // planification absente (contrat créé avant la mise en place, import…).
      await dbClient.query(
        `UPDATE contrats SET
           augmentation_date_reference = COALESCE(augmentation_date_reference, $1),
           augmentation_prochaine_date = $2
         WHERE id = $3
           AND (augmentation_date_reference IS NULL
                OR augmentation_prochaine_date IS DISTINCT FROM $2)`,
        [reference, prochaine, contrat.id],
      );
    }

    if (ownConnection) await dbClient.query('COMMIT');
    return applications;
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }
}

/**
 * Passe tous les contrats du tenant courant dont un anniversaire est échu.
 * Utilisé par le job quotidien ; chaque contrat est traité indépendamment pour
 * qu'une erreur isolée ne bloque pas les autres.
 */
export async function appliquerAugmentationsDuesTousContrats(dateReference = aujourdhui()) {
  const { rows: contrats } = await query(
    `SELECT id FROM contrats
     WHERE deleted_at IS NULL
       AND augmentation_active = true
       AND augmentation_pourcentage > 0
       AND statut <> ALL ($2::text[])
       AND (augmentation_prochaine_date IS NULL OR augmentation_prochaine_date <= $1)
     ORDER BY id`,
    [dateReference, STATUTS_EXCLUS],
  );

  const rapport = { contrats_traites: 0, augmentations: [], erreurs: [] };

  for (const { id } of contrats) {
    try {
      const applications = await appliquerAugmentationsDues(id, {
        dateReference,
        declencheur: 'Job',
      });
      if (applications.length > 0) {
        rapport.contrats_traites += 1;
        rapport.augmentations.push(...applications);
      }
    } catch (err) {
      rapport.erreurs.push({ contrat_id: id, message: err.message });
    }
  }

  return rapport;
}

export async function getHistoriqueAugmentations(contratId) {
  const { rows } = await query(
    `SELECT id, date_anniversaire, pourcentage, declencheur, applique_par,
            nb_elements, details, created_at
     FROM contrat_augmentations
     WHERE contrat_id = $1
     ORDER BY date_anniversaire DESC`,
    [contratId],
  );
  return rows;
}
