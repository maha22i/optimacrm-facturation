/**
 * Parse une cellule Excel en nombre décimal SANS aucun arrondi.
 * Préserve toute la précision native du float64.
 * Retourne null si vide/invalide (jamais 0 par défaut).
 */
export function parseDecimalPrecise(cellValue) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return null;
  }

  if (typeof cellValue === 'number') {
    return isNaN(cellValue) ? null : cellValue;
  }

  const cleaned = String(cellValue)
    .trim()
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .replace(/\u00A0/g, '')
    .replace(',', '.');

  if (cleaned === '') return null;

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Formate un coût/prix pour affichage avec précision réelle (backend/PDF).
 * Supprime les zéros traînants inutiles.
 */
export function formatCout(value, options = {}) {
  const { formatFR = false, minDecimals = 0 } = options;
  if (value === null || value === undefined || value === '') return '';

  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return '';

  let str = num.toFixed(10);
  if (str.includes('.')) {
    str = str.replace(/0+$/, '').replace(/\.$/, '');
    if (minDecimals > 0) {
      const decimals = str.includes('.') ? str.split('.')[1].length : 0;
      if (decimals < minDecimals) {
        str = num.toFixed(minDecimals);
      }
    }
  }

  return formatFR ? str.replace('.', ',') : str;
}

/**
 * Format montant final (2 décimales, pour totaux facture)
 */
export function formatMontant(value, formatFR = true) {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return '';
  const str = num.toFixed(2);
  return formatFR ? str.replace('.', ',') : str;
}
