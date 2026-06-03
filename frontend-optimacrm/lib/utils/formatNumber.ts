/**
 * Convertit une valeur (string venant de pg, number, null) en number sûr.
 * Retourne null si vide/invalide.
 */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return isNaN(num) ? null : num;
}

/**
 * Affiche un coût copie OU prix unitaire avec sa précision réelle.
 * - Affiche jusqu'à 10 décimales si nécessaire
 * - Supprime les zéros traînants inutiles
 * - Utilise la virgule française si formatFR=true
 */
export function formatCout(
  value: string | number | null | undefined,
  options: { formatFR?: boolean; minDecimals?: number } = {}
): string {
  const { formatFR = false, minDecimals = 0 } = options;
  const num = toNumber(value);
  if (num === null) return '';

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
 * Format spécifique pour montants TTC/HT finaux (toujours 2 décimales)
 */
export function formatMontant(
  value: string | number | null | undefined,
  formatFR: boolean = true
): string {
  const num = toNumber(value);
  if (num === null) return '';
  const str = num.toFixed(2);
  return formatFR ? str.replace('.', ',') : str;
}
