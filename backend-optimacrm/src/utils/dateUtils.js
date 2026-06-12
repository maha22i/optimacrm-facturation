/**
 * Utilitaires de manipulation de dates « pures » (YYYY-MM-DD),
 * sans composante horaire ni timezone.
 * Toutes les opérations passent par Date.UTC pour éviter
 * les décalages liés au fuseau local du serveur.
 */

/**
 * Normalise n'importe quelle valeur (string, Date, null) en "YYYY-MM-DD".
 * Retourne null si la valeur n'est pas exploitable.
 */
export function toDateStr(val) {
  if (val == null) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    // pg crée les Date à minuit LOCAL → on lit avec getFullYear/Month/Date (local)
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseParts(dateStr) {
  const s = toDateStr(dateStr);
  if (!s) throw new Error(`Date invalide: ${dateStr}`);
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/**
 * Ajoute `months` mois à une date. Clampe au dernier jour du mois cible
 * si le jour source déborde (ex. 31/01 + 1 mois → 28/02, pas 03/03).
 */
export function addMonthsUTC(dateStr, months) {
  const { y, m, d } = parseParts(dateStr);
  const targetYear = y + Math.floor((m - 1 + months) / 12);
  const targetMonth = ((m - 1 + months) % 12 + 12) % 12;
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfTarget);
  const dt = new Date(Date.UTC(targetYear, targetMonth, clampedDay));
  return dt.toISOString().slice(0, 10);
}

/**
 * Soustrait un jour.
 */
export function subDayUTC(dateStr) {
  const { y, m, d } = parseParts(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * Calcule la fin de période : dernier jour avant (debut + N mois).
 * Ex: periodEnd("2026-06-01", 1) → "2026-06-30"
 */
export function periodEnd(dateStr, months) {
  return subDayUTC(addMonthsUTC(dateStr, months));
}
