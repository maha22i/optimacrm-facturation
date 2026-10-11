import { query } from '../../config/database.js';
import { toDateStr, addMonthsUTC } from '../../utils/dateUtils.js';

// ---------------------------------------------------------------------------
// Renouvellement des contrats copieur.
//
// Le métier travaille en périodes fixes (36, 60, 63 mois) adossées à une
// location financière, et le décompte part de la mise en service :
//
//   • point de départ = date d'installation, repli sur la date de début ;
//   • date_echeance = point de départ + durée initiale. C'est la fin de la
//     période d'origine, elle ne bouge plus ;
//   • date_renouvellement = première fin de période non passée. En tacite
//     reconduction on ajoute la durée de reconduction autant de fois que
//     nécessaire, donc la date affichée est toujours la prochaine échéance
//     réelle, même après plusieurs reconductions ;
//   • alerte = date_renouvellement − préavis. Le commercial doit être prévenu
//     assez tôt pour dénoncer le contrat ou replacer une machine avant qu'un
//     concurrent ne passe.
//
// Les deux dates sont stockées plutôt que calculées à la lecture, pour rester
// visibles dans les listes, les exports, le PDF de contrat et le portail
// client. Elles sont réécrites à chaque enregistrement du contrat et par le job
// quotidien, qui fait avancer d'une période celles qui viennent d'être
// dépassées.
// ---------------------------------------------------------------------------

const TYPES_CONCERNES = ['Copieur'];

// Contrats sortis du parc : plus rien à renouveler.
const STATUTS_EXCLUS = ['Résilié', 'Échu'];

// Une reconduction ne peut pas être plus courte qu'un mois : la boucle de
// rattrapage est bornée bien au-delà de la durée de vie d'un contrat.
const MAX_RECONDUCTIONS = 240;

export const RECONDUCTION_DEFAUT = 12;
export const PREAVIS_DEFAUT = 6;

function aujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

function entierPositif(valeur, defaut = 0) {
  const n = parseInt(valeur, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
}

export function estTypeConcerne(typeContrat) {
  return TYPES_CONCERNES.includes(typeContrat);
}

/** Point de départ du décompte : mise en service, à défaut début du contrat. */
export function datePointDepart(contrat) {
  return toDateStr(contrat.date_installation) || toDateStr(contrat.date_debut);
}

/**
 * Échéance initiale, prochaine échéance réelle et date d'alerte d'un contrat.
 * Renvoie des dates nulles si le calcul est impossible (pas de point de départ
 * ou pas de durée) : l'appelant laisse alors les dates en place plutôt que de
 * les effacer.
 */
export function calculerRenouvellement(contrat, dateReference = aujourdhui()) {
  const vide = {
    date_echeance: null,
    date_renouvellement: null,
    date_alerte: null,
    nb_reconductions: 0,
  };

  const depart = datePointDepart(contrat);
  const duree = entierPositif(contrat.duree_contrat_mois);
  if (!depart || duree <= 0) return vide;

  const finInitiale = addMonthsUTC(depart, duree);
  const reconduction = entierPositif(contrat.duree_reconduction_mois);

  // Une échéance tombant aujourd'hui n'est pas « passée » : on la garde
  // affichée, c'est le dernier moment utile pour agir. Sans reconduction, le
  // contrat s'arrête à sa période initiale et la date reste celle-ci.
  let prochaine = finInitiale;
  let reconductions = 0;
  if (reconduction > 0) {
    while (prochaine < dateReference && reconductions < MAX_RECONDUCTIONS) {
      reconductions += 1;
      prochaine = addMonthsUTC(finInitiale, reconduction * reconductions);
    }
  }

  const preavis = entierPositif(contrat.preavis_renouvellement_mois);

  return {
    date_echeance: finInitiale,
    date_renouvellement: prochaine,
    date_alerte: preavis > 0 ? addMonthsUTC(prochaine, -preavis) : prochaine,
    nb_reconductions: reconductions,
  };
}

/**
 * Recalcule et enregistre les dates d'un contrat. Sans effet sur les types
 * autres que copieur, dont les dates restent saisies à la main.
 *
 * @returns {Promise<object|null>} les dates calculées, ou null si rien à faire
 */
export async function recalculerRenouvellement(contratId, options = {}) {
  const { dateReference = aujourdhui(), dbClient = null } = options;
  // Un client explicite permet de rester dans la transaction de l'appelant
  // (import, création de contrat) ; sinon query() suit le contexte tenant.
  const exec = dbClient ? (text, params) => dbClient.query(text, params) : query;

  const { rows: [contrat] } = await exec(
    `SELECT id, type_contrat, date_installation, date_debut, date_echeance,
            date_renouvellement, duree_contrat_mois, duree_reconduction_mois,
            preavis_renouvellement_mois
     FROM contrats
     WHERE id = $1 AND deleted_at IS NULL`,
    [contratId],
  );

  if (!contrat || !estTypeConcerne(contrat.type_contrat)) return null;

  const calcul = calculerRenouvellement(contrat, dateReference);
  if (!calcul.date_renouvellement) return null;

  const inchange = toDateStr(contrat.date_echeance) === calcul.date_echeance
    && toDateStr(contrat.date_renouvellement) === calcul.date_renouvellement;
  if (inchange) return calcul;

  await exec(
    `UPDATE contrats
     SET date_echeance = $1, date_renouvellement = $2, updated_at = NOW()
     WHERE id = $3`,
    [calcul.date_echeance, calcul.date_renouvellement, contratId],
  );

  return calcul;
}

/**
 * Passe tous les contrats copieur dont les dates sont absentes ou dépassées.
 * Utilisé par le job quotidien : il répare les contrats créés avant la mise en
 * place (ou importés sans recalcul) et fait avancer d'une période ceux dont
 * l'échéance vient de tomber.
 */
export async function recalculerTousRenouvellements(dateReference = aujourdhui()) {
  const { rows: contrats } = await query(
    `SELECT id FROM contrats
     WHERE deleted_at IS NULL
       AND type_contrat = ANY ($2::text[])
       AND statut <> ALL ($3::text[])
       AND COALESCE(date_installation, date_debut) IS NOT NULL
       AND COALESCE(duree_contrat_mois, 0) > 0
       AND (date_echeance IS NULL
            OR date_renouvellement IS NULL
            OR date_renouvellement < $1)
     ORDER BY id`,
    [dateReference, TYPES_CONCERNES, STATUTS_EXCLUS],
  );

  const rapport = { contrats_traites: 0, erreurs: [] };

  for (const { id } of contrats) {
    try {
      const calcul = await recalculerRenouvellement(id, { dateReference });
      if (calcul) rapport.contrats_traites += 1;
    } catch (err) {
      rapport.erreurs.push({ contrat_id: id, message: err.message });
    }
  }

  return rapport;
}

// ---------------------------------------------------------------------------
// Alertes
// ---------------------------------------------------------------------------

const SELECT_RENOUVELLEMENT = `
  c.id, c.numero_contrat, c.type_contrat, c.statut, c.periodicite,
  c.date_installation, c.date_debut, c.date_echeance, c.date_renouvellement,
  c.duree_contrat_mois, c.duree_reconduction_mois, c.preavis_renouvellement_mois,
  c.renouvellement_traite_echeance, c.renouvellement_traite_date, c.renouvellement_traite_par,
  (c.date_renouvellement - make_interval(months => c.preavis_renouvellement_mois))::date AS date_alerte,
  (c.date_renouvellement - CURRENT_DATE)::int AS jours_restants,
  (c.renouvellement_traite_echeance IS NOT NULL
   AND c.renouvellement_traite_echeance = c.date_renouvellement) AS traite,
  cl.raison_sociale AS client_raison_sociale,
  cl.numero_client AS client_code,
  (SELECT COALESCE(SUM(
     CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
   ), 0) FROM contrat_lignes lg WHERE lg.contrat_id = c.id) AS montant_ht,
  (SELECT string_agg(DISTINCT cm.modele || ' (' || cm.numero_serie || ')', ', ')
   FROM contrat_machines cm WHERE cm.contrat_id = c.id AND cm.actif = true) AS machines_resume
`;

const CONDITIONS_BASE = `
  c.deleted_at IS NULL
  AND c.type_contrat = ANY ($1::text[])
  AND c.statut <> ALL ($2::text[])
  AND c.date_renouvellement IS NOT NULL
`;

// Un contrat est en alerte dès que le préavis est entamé.
const CONDITION_ALERTE = `
  (c.date_renouvellement - make_interval(months => c.preavis_renouvellement_mois))::date <= CURRENT_DATE
`;

const CONDITION_NON_TRAITE = `
  (c.renouvellement_traite_echeance IS NULL
   OR c.renouvellement_traite_echeance <> c.date_renouvellement)
`;

/**
 * Contrats à renouveler.
 *
 * @param {object} options
 * @param {number|null} options.horizonMois  au lieu des seuls contrats en
 *   alerte, tous ceux dont l'échéance tombe dans les N mois
 * @param {boolean} options.inclureTraites   inclure les relances déjà faites
 * @param {number|null} options.limit
 */
export async function listerRenouvellements(options = {}) {
  const { horizonMois = null, inclureTraites = false, limit = null } = options;

  const conditions = [CONDITIONS_BASE];
  const params = [TYPES_CONCERNES, STATUTS_EXCLUS];
  let i = 3;

  if (horizonMois != null) {
    conditions.push(`c.date_renouvellement <= (CURRENT_DATE + make_interval(months => $${i++}))::date`);
    params.push(horizonMois);
  } else {
    conditions.push(CONDITION_ALERTE);
  }

  if (!inclureTraites) conditions.push(CONDITION_NON_TRAITE);

  const { rows } = await query(
    `SELECT ${SELECT_RENOUVELLEMENT}
     FROM contrats c
     JOIN clients cl ON cl.id = c.client_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.date_renouvellement, c.numero_contrat
     ${limit ? `LIMIT $${i}` : ''}`,
    limit ? [...params, limit] : params,
  );

  return rows;
}

/** Nombre de contrats en alerte non traités — alimente la cloche. */
export async function compterAlertesRenouvellement() {
  const { rows: [row] } = await query(
    `SELECT COUNT(*)::int AS total
     FROM contrats c
     WHERE ${CONDITIONS_BASE} AND ${CONDITION_ALERTE} AND ${CONDITION_NON_TRAITE}`,
    [TYPES_CONCERNES, STATUTS_EXCLUS],
  );
  return row?.total ?? 0;
}

/**
 * Marque la relance comme faite pour l'échéance en cours. L'alerte revient
 * d'elle-même au cycle suivant, quand date_renouvellement aura avancé.
 */
export async function marquerTraite(contratId, { userNom = null } = {}) {
  const { rows: [contrat] } = await query(
    `UPDATE contrats
     SET renouvellement_traite_echeance = date_renouvellement,
         renouvellement_traite_date = CURRENT_DATE,
         renouvellement_traite_par = $2,
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND date_renouvellement IS NOT NULL
     RETURNING id, numero_contrat, date_renouvellement,
               renouvellement_traite_echeance, renouvellement_traite_date,
               renouvellement_traite_par`,
    [contratId, userNom],
  );
  return contrat || null;
}

export async function annulerTraitement(contratId) {
  const { rows: [contrat] } = await query(
    `UPDATE contrats
     SET renouvellement_traite_echeance = NULL,
         renouvellement_traite_date = NULL,
         renouvellement_traite_par = NULL,
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, numero_contrat, date_renouvellement`,
    [contratId],
  );
  return contrat || null;
}
