/**
 * Validation IBAN — algorithme modulo 97 (ISO 13616)
 */
export function validateIBAN(iban) {
  if (!iban) return { valid: false, error: 'IBAN requis' };

  const cleaned = iban.replace(/\s/g, '').toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) {
    return { valid: false, error: 'Format IBAN invalide' };
  }

  // Move first 4 chars to end
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);

  // Convert letters to digits (A=10, B=11, ..., Z=35)
  let numericStr = '';
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') {
      numericStr += ch;
    } else {
      numericStr += (ch.charCodeAt(0) - 55).toString();
    }
  }

  // Modulo 97 on large number (process in chunks)
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i += 7) {
    const chunk = String(remainder) + numericStr.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }

  if (remainder !== 1) {
    return { valid: false, error: 'IBAN invalide (contrôle modulo 97 échoué)' };
  }

  return { valid: true, cleaned };
}

/**
 * Validation BIC/SWIFT — format standard
 */
export function validateBIC(bic) {
  if (!bic) return { valid: false, error: 'BIC requis' };

  const cleaned = bic.replace(/\s/g, '').toUpperCase();

  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned)) {
    return { valid: false, error: 'Format BIC invalide (8 ou 11 caractères attendus)' };
  }

  return { valid: true, cleaned };
}

/**
 * Valide les données mandat SEPA d'un client
 */
export function validateMandatClient(client) {
  const errors = [];

  if (!client.iban) errors.push('IBAN manquant');
  else {
    const ibanCheck = validateIBAN(client.iban);
    if (!ibanCheck.valid) errors.push(ibanCheck.error);
  }

  if (!client.bic) errors.push('BIC manquant');
  else {
    const bicCheck = validateBIC(client.bic);
    if (!bicCheck.valid) errors.push(bicCheck.error);
  }

  if (!client.reference_mandat_sepa) errors.push('RUM (Référence Unique de Mandat) manquant');
  if (!client.date_mandat_sepa) errors.push('Date de signature du mandat manquante');

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Échappe les caractères spéciaux XML
 */
export function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formate un montant avec exactement 2 décimales et point comme séparateur
 */
export function formatAmount(amount) {
  return parseFloat(amount).toFixed(2);
}
