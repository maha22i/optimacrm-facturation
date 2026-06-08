import { pool, query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { CLIENTS_FIELD_GROUPS, getAllClientStandardFields } from '../../config/clientsFieldSynonyms.js';
import fs from 'fs/promises';
import path from 'path';

const TEMP_DIR = path.resolve('uploads/import-temp');

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS — Normalisation & Distance
// ═══════════════════════════════════════════════════════════════════════════════

function normalize(str) {
  if (!str) return '';
  return str
    .replace(/\r?\n/g, ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function cleanText(val) {
  if (val == null) return null;
  return String(val).replace(/\r?\n/g, ' ').trim() || null;
}

function parseDate(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const dmySlash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2].padStart(2, '0')}-${dmySlash[1].padStart(2, '0')}`;
  const ymd = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return null;
}

function parseInteger(val) {
  if (val == null || val === '') return null;
  const n = parseInt(String(val).replace(/\s/g, '').replace(',', '.'), 10);
  return isNaN(n) ? null : n;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT-SPECIFIC CLEANING
// ═══════════════════════════════════════════════════════════════════════════════

function cleanSiret(siret) {
  if (!siret) return null;
  return siret.replace(/\s/g, '').trim() || null;
}

function cleanCP(cp) {
  if (!cp) return null;
  const cleaned = cp.toString().trim();
  return cleaned.length > 0 ? cleaned : null;
}

function buildAdresse(numero, voie, adresse) {
  const parts = [numero, voie, adresse].filter(p => p && p.toString().trim());
  return parts.join(' ').trim() || null;
}

function parseContact(contact) {
  if (!contact) return { nom: '', prenom: '' };
  let cleaned = contact.replace(/^\.\s*/, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return { prenom: parts[0], nom: parts.slice(1).join(' ') };
  }
  return { nom: cleaned, prenom: '' };
}

function isWindowsPath(val) {
  if (!val) return false;
  const s = String(val).trim();
  return /^[A-Z]:\\/.test(s) || /^\\\\/.test(s);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-IGNORE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function shouldAutoIgnoreColumn(values) {
  if (!values || values.length === 0) return true;

  const nonEmpty = values.filter(v => v != null && String(v).trim() !== '');
  if (nonEmpty.length === 0) return true;

  if (nonEmpty.every(v => isWindowsPath(v))) return true;

  if (nonEmpty.every(v => String(v).trim() === '0')) return true;

  const uniqueValues = new Set(nonEmpty.map(v => String(v).trim().toLowerCase()));
  if (uniqueValues.size === 1 && nonEmpty.length >= 5) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM FIELDS — Chargement dynamique
// ═══════════════════════════════════════════════════════════════════════════════

async function loadCustomFields() {
  const result = await query(
    `SELECT id, section, section_ordre, label, cle, type, obligatoire, options_liste, valeur_defaut
     FROM champs_personnalises_config
     WHERE entite = 'CLIENT' AND actif = true
     ORDER BY section_ordre, section, ordre`
  );

  const grouped = new Map();
  for (const row of result.rows) {
    if (!grouped.has(row.section)) grouped.set(row.section, []);
    const synonyms = generateCustomFieldSynonyms(row.label, row.cle);
    grouped.get(row.section).push({
      key: `custom_${row.cle}`,
      label: row.label,
      required: row.obligatoire,
      type: mapCustomType(row.type),
      custom_field_id: row.id,
      config_cle: row.cle,
      config_type: row.type,
      synonyms,
    });
  }

  return grouped;
}

function mapCustomType(dbType) {
  const map = { TEXTE: 'text', NOMBRE: 'number', DATE: 'date', LISTE: 'list', BOOLEEN: 'boolean' };
  return map[dbType] || 'text';
}

function generateCustomFieldSynonyms(label, cle) {
  const syns = new Set();
  syns.add(label.toLowerCase());
  syns.add(cle.toLowerCase());
  syns.add(normalize(label));
  syns.add(normalize(cle));
  const words = label.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length > 1) syns.add(words.join(' '));
  return [...syns].filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-MAPPING — Algorithme intelligent
// ═══════════════════════════════════════════════════════════════════════════════

function autoMapField(sourceHeader, allTargetFields) {
  const normalizedSource = normalize(sourceHeader);
  if (!normalizedSource) return { suggested_field: null, confidence: 0, field_group: null, is_custom_field: false };

  let bestMatch = null;
  let bestConfidence = 0;

  for (const field of allTargetFields) {
    let confidence = 0;

    if (normalizedSource === normalize(field.key)) {
      confidence = 1.0;
    } else if (normalizedSource === normalize(field.label)) {
      confidence = 0.95;
    } else if (field.synonyms?.some(s => normalize(s) === normalizedSource)) {
      confidence = 0.9;
    } else if (field.synonyms?.some(s => {
      const ns = normalize(s);
      return ns && normalizedSource.includes(ns) && ns.length >= 3;
    })) {
      confidence = 0.85;
    } else if (normalizedSource.includes(normalize(field.key)) && normalize(field.key).length >= 3) {
      confidence = 0.75;
    } else if (field.synonyms?.some(s => {
      const ns = normalize(s);
      return ns && ns.length >= 4 && normalizedSource.includes(ns);
    })) {
      confidence = 0.75;
    } else {
      const dist = levenshtein(normalizedSource, normalize(field.key));
      if (dist <= 2 && normalize(field.key).length >= 4) confidence = 0.6;
      if (!confidence) {
        for (const s of (field.synonyms || [])) {
          const sd = levenshtein(normalizedSource, normalize(s));
          if (sd <= 2 && normalize(s).length >= 4) { confidence = 0.6; break; }
        }
      }
    }

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = field;
    }
  }

  if (bestConfidence >= 0.6 && bestMatch) {
    return {
      suggested_field: bestMatch.key,
      confidence: bestConfidence,
      field_group: bestMatch.group,
      is_custom_field: bestMatch.key.startsWith('custom_'),
    };
  }

  return { suggested_field: null, confidence: 0, field_group: null, is_custom_field: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════════════════════════════════════════════

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',' || ch === ';') { cells.push(current); current = ''; }
        else { current += ch; }
      }
    }
    cells.push(current);
    result.push(cells);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE — Upload + parsing + auto-mapping
// ═══════════════════════════════════════════════════════════════════════════════

export async function parseFile(file) {
  await fs.mkdir(TEMP_DIR, { recursive: true });

  const ext = path.extname(file.originalname).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
    throw ApiError.badRequest('Format non supporté. Formats acceptés : CSV, XLSX, XLS');
  }

  let rows;
  if (ext === '.csv') {
    rows = parseCSV(file.buffer.toString('utf-8'));
  } else {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  }

  if (!rows || rows.length < 2) {
    throw ApiError.badRequest('Le fichier est vide ou ne contient qu\'une seule ligne');
  }

  const headers = rows[0].map(h => String(h ?? ''));
  const dataRows = rows.slice(1).filter(row =>
    row.some(cell => cell != null && String(cell).trim() !== '')
  );

  const fileId = `temp_clients_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempPath = path.join(TEMP_DIR, `${fileId}.json`);
  await fs.writeFile(tempPath, JSON.stringify({ headers, rows: dataRows }));

  const preview = dataRows.slice(0, 5).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  const standardFields = getAllClientStandardFields();
  const customFieldsGrouped = await loadCustomFields();

  const allTargetFields = [...standardFields];
  for (const [section, fields] of customFieldsGrouped) {
    for (const f of fields) {
      allTargetFields.push({ ...f, group: `Champs personnalisés > ${section}` });
    }
  }

  // Collect all column values for auto-ignore detection
  const columnValues = {};
  headers.forEach((h, colIdx) => {
    columnValues[h] = dataRows.map(row => row[colIdx]);
  });

  const usedFields = new Set();
  const mappings = headers.map(header => {
    const autoIgnore = shouldAutoIgnoreColumn(columnValues[header]);
    if (autoIgnore) {
      return {
        source_header: header,
        suggested_field: null,
        confidence: 0,
        field_group: null,
        is_custom_field: false,
        auto_ignored: true,
      };
    }

    const result = autoMapField(header, allTargetFields.filter(f => !usedFields.has(f.key)));
    if (result.suggested_field) usedFields.add(result.suggested_field);
    return { source_header: header, ...result, auto_ignored: false };
  });

  const availableFieldsStandard = CLIENTS_FIELD_GROUPS.map(g => ({
    group: g.group,
    fields: g.fields.map(f => ({
      key: f.key,
      label: f.label,
      required: f.required,
      type: f.type,
    })),
  }));

  const availableFieldsCustom = [];
  for (const [section, fields] of customFieldsGrouped) {
    availableFieldsCustom.push({
      group: section,
      fields: fields.map(f => ({
        key: f.key,
        label: f.label,
        required: f.required,
        type: f.type,
        custom_field_id: f.custom_field_id,
      })),
    });
  }

  return {
    file_id: fileId,
    headers,
    preview,
    total_rows: dataRows.length,
    mappings,
    available_fields: {
      standard: availableFieldsStandard,
      custom: availableFieldsCustom,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE — Validation des données mappées
// ═══════════════════════════════════════════════════════════════════════════════

export async function validateData({ file_id, mappings, options = {} }) {
  const tempPath = path.join(TEMP_DIR, `${file_id}.json`);
  let fileData;
  try {
    const raw = await fs.readFile(tempPath, 'utf-8');
    fileData = JSON.parse(raw);
  } catch {
    throw ApiError.badRequest('Fichier temporaire introuvable. Veuillez relancer le parsing.');
  }

  const { headers, rows } = fileData;
  const { skip_empty_code = true, update_existing = false } = options;

  const headerToField = {};
  for (const [sourceHeader, targetField] of Object.entries(mappings)) {
    if (targetField) headerToField[sourceHeader] = targetField;
  }

  // Check existing codes in DB
  const existingCodesRes = await query(
    'SELECT numero_client FROM clients'
  );
  const existingCodes = new Set(existingCodesRes.rows.map(r => r.numero_client));

  const customFieldsGrouped = await loadCustomFields();
  const customFieldsFlat = new Map();
  for (const [, fields] of customFieldsGrouped) {
    for (const f of fields) customFieldsFlat.set(f.key, f);
  }

  const seenCodes = new Map();
  const validatedRows = [];
  let validCount = 0, errorCount = 0, duplicateCount = 0, skippedCount = 0;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rowNumber = rowIdx + 2;
    const errors = [];
    const warnings = [];

    const data = {};
    headers.forEach((h, colIdx) => {
      const field = headerToField[h];
      if (field) data[field] = row[colIdx] ?? '';
    });

    const hasAnyValue = Object.values(data).some(v => v != null && String(v).trim() !== '');
    if (!hasAnyValue) {
      skippedCount++;
      continue;
    }

    const parsed = {};
    for (const [field, rawVal] of Object.entries(data)) {
      parsed[field] = parseClientFieldValue(field, rawVal, customFieldsFlat);
    }

    // Validate code_client
    const codeClient = cleanText(data.code_client);
    if (!codeClient || String(codeClient).trim() === '') {
      if (skip_empty_code) {
        validatedRows.push({ row_number: rowNumber, status: 'skipped', data: parsed, errors: ['Code client vide, ligne ignorée'], warnings: [] });
        skippedCount++;
        continue;
      }
      errors.push('Le code client est obligatoire');
    }

    // Validate raison_sociale
    const raisonSociale = cleanText(data.raison_sociale);
    if (!raisonSociale) {
      errors.push('La raison sociale est obligatoire');
    }

    // SIRET: clean and validate length
    if (parsed.siret) {
      const cleaned = cleanSiret(String(data.siret));
      parsed.siret = cleaned;
      if (cleaned && cleaned.length !== 14 && cleaned.length > 0) {
        warnings.push(`SIRET non standard (${cleaned.length} caractères au lieu de 14)`);
      }
    }

    // Email validation
    if (data.email_principal && String(data.email_principal).trim()) {
      const email = String(data.email_principal).trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        warnings.push(`Email potentiellement invalide : "${email}"`);
      }
    }

    // IBAN basic format check
    if (data.iban && String(data.iban).trim()) {
      const iban = String(data.iban).trim().replace(/\s/g, '');
      if (iban.length < 15 || iban.length > 34) {
        warnings.push(`IBAN de longueur inhabituelle (${iban.length} caractères)`);
      }
    }

    // Duplicate detection
    if (codeClient) {
      if (seenCodes.has(codeClient)) {
        errors.push(`Doublon interne : même code client que la ligne ${seenCodes.get(codeClient)}`);
        duplicateCount++;
      } else {
        seenCodes.set(codeClient, rowNumber);
      }

      if (existingCodes.has(codeClient) && !update_existing) {
        errors.push('Code client déjà existant en base de données');
        duplicateCount++;
      }
    }

    // Validate custom fields
    for (const [field, config] of customFieldsFlat) {
      if (data[field] !== undefined) {
        const val = parsed[field];
        if (config.required && (val === null || val === undefined || String(val).trim() === '')) {
          errors.push(`Le champ personnalisé "${config.label}" est obligatoire`);
        }
        if (config.config_type === 'DATE' && data[field] && val === null) {
          errors.push(`Date invalide pour "${config.label}" : "${data[field]}"`);
        }
        if (config.config_type === 'NOMBRE' && data[field] && val === null) {
          errors.push(`Nombre invalide pour "${config.label}" : "${data[field]}"`);
        }
      }
    }

    const status = errors.length > 0 ? 'error' : 'valid';
    if (errors.length > 0) errorCount++;
    else validCount++;

    validatedRows.push({ row_number: rowNumber, status, data: parsed, errors, warnings });
  }

  return {
    file_id,
    total: rows.length,
    valid: validCount,
    errors: errorCount,
    duplicates: duplicateCount,
    skipped: skippedCount,
    rows: validatedRows,
  };
}

function parseClientFieldValue(field, rawVal, customFieldsFlat) {
  const val = rawVal;
  if (val == null || String(val).trim() === '') return null;

  if (field === 'siret') return cleanSiret(String(val));
  if (field === 'adresse_code_postal') return cleanCP(String(val));
  if (field === 'jour_prelevement') return parseInteger(val);
  if (field === 'date_mandat_sepa' || field === 'date_rappel' || field === 'date_rdv') return parseDate(val);

  const customConfig = customFieldsFlat.get(field);
  if (customConfig) {
    if (customConfig.config_type === 'NOMBRE') {
      const s = String(val).trim().replace(/\s/g, '').replace(',', '.');
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    }
    if (customConfig.config_type === 'DATE') return parseDate(val);
    if (customConfig.config_type === 'BOOLEEN') {
      const lower = String(val).toLowerCase().trim();
      return ['oui', 'yes', 'true', '1', 'actif', 'vrai'].includes(lower) ? 'true' : 'false';
    }
    return cleanText(val);
  }

  return cleanText(val);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD LENGTH CONSTRAINTS — Pré-validation avant INSERT
// ═══════════════════════════════════════════════════════════════════════════════

const FIELD_LIMITS = {
  // clients table
  numero_client:          { max: 10,  label: 'Code client' },
  raison_sociale:         { max: 255, label: 'Raison sociale' },
  siret:                  { max: 14,  label: 'SIRET' },
  siren:                  { max: 9,   label: 'SIREN' },
  tva_intracommunautaire: { max: 20,  label: 'TVA intracommunautaire' },
  code_ape:               { max: 10,  label: 'Code APE' },
  site_web:               { max: 255, label: 'Site web' },
  telephone:              { max: 20,  label: 'Téléphone' },
  email_principal:        { max: 255, label: 'Email principal' },
  email_comptabilite:     { max: 255, label: 'Email comptabilité' },
  iban:                   { max: 34,  label: 'IBAN' },
  bic:                    { max: 20,  label: 'BIC' },
  reference_mandat_sepa:  { max: 35,  label: 'Référence mandat SEPA' },
  numero_rcs:             { max: 50,  label: 'Numéro RCS' },
  // client_adresses table
  adresse_code_postal:    { max: 10,  label: 'Code postal' },
  adresse_ville:          { max: 100, label: 'Ville' },
  // client_contacts table
  contact_nom:            { max: 100, label: 'Nom du contact' },
  contact_mobile:         { max: 20,  label: 'Mobile du contact' },
  contact_ligne_directe:  { max: 20,  label: 'Téléphone du contact' },
  contact2_nom:           { max: 100, label: 'Nom du contact secondaire' },
};

function validateFieldLengths(data) {
  const errors = [];
  for (const [field, config] of Object.entries(FIELD_LIMITS)) {
    const val = data[field];
    if (val != null && String(val).trim() !== '') {
      const strVal = String(val).trim();
      if (strVal.length > config.max) {
        errors.push(
          `Le champ « ${config.label} » dépasse la limite autorisée : "${strVal.substring(0, 30)}${strVal.length > 30 ? '…' : ''}" fait ${strVal.length} caractères (max. ${config.max})`
        );
      }
    }
  }

  // Adresse ligne1 combinée (numéro + voie + rue)
  const adresseLigne1 = buildAdresse(
    cleanText(data.adresse_numero),
    cleanText(data.adresse_voie),
    cleanText(data.adresse_rue)
  );
  if (adresseLigne1 && adresseLigne1.length > 255) {
    errors.push(
      `L'adresse complète est trop longue : "${adresseLigne1.substring(0, 40)}…" fait ${adresseLigne1.length} caractères (max. 255)`
    );
  }

  return errors;
}

function humanizeDbError(err) {
  const msg = err.message || '';

  // PostgreSQL: value too long for type character varying(N)
  const varcharMatch = msg.match(/value too long for type character varying\((\d+)\)/);
  if (varcharMatch) {
    const limit = varcharMatch[1];
    const knownLimits = {
      '10': 'Code client',
      '14': 'SIRET',
      '9': 'SIREN',
      '20': 'BIC, Téléphone, Mode de paiement ou TVA',
      '34': 'IBAN',
      '35': 'Référence mandat SEPA',
      '100': 'Nom du contact ou Ville',
      '255': 'Raison sociale, Email ou Adresse',
    };
    const fieldHint = knownLimits[limit] || 'Un champ';
    return `${fieldHint} : la valeur dépasse la limite de ${limit} caractères`;
  }

  // PostgreSQL: unique constraint violation
  if (err.code === '23505') {
    if (msg.includes('numero_client')) return 'Code client déjà utilisé par un autre client';
    if (msg.includes('siret')) return 'SIRET déjà utilisé par un autre client';
    if (msg.includes('email_principal')) return 'Email déjà utilisé par un autre client';
    return 'Valeur en doublon avec un enregistrement existant';
  }

  // PostgreSQL: not-null violation
  if (err.code === '23502') {
    const colMatch = msg.match(/column "(\w+)"/);
    if (colMatch) {
      const colLabels = {
        raison_sociale: 'Raison sociale',
        email_principal: 'Email principal',
        numero_client: 'Code client',
        ligne1: 'Adresse ligne 1',
        code_postal: 'Code postal',
        ville: 'Ville',
        nom: 'Nom',
        prenom: 'Prénom',
      };
      return `Le champ « ${colLabels[colMatch[1]] || colMatch[1]} » est obligatoire et ne peut pas être vide`;
    }
    return 'Un champ obligatoire est vide';
  }

  // PostgreSQL: check constraint violation
  if (err.code === '23514') {
    return 'Valeur non autorisée pour un champ à choix restreint (statut, forme juridique, etc.)';
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE — Exécution de l'import en BDD
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeImport({ file_id, mappings, options = {}, user_id }) {
  const tempPath = path.join(TEMP_DIR, `${file_id}.json`);
  let fileData;
  try {
    const raw = await fs.readFile(tempPath, 'utf-8');
    fileData = JSON.parse(raw);
  } catch {
    throw ApiError.badRequest('Fichier temporaire introuvable. Veuillez relancer le parsing.');
  }

  const validationResult = await validateData({ file_id, mappings, options });
  const validRows = validationResult.rows.filter(r => r.status === 'valid');

  if (validRows.length === 0) {
    throw ApiError.badRequest('Aucune ligne valide à importer');
  }

  const { update_existing = false } = options;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customConfigRes = await client.query(
      "SELECT id, cle FROM champs_personnalises_config WHERE entite = 'CLIENT' AND actif = true"
    );
    const customConfigMap = new Map(customConfigRes.rows.map(r => [r.cle, r.id]));

    let successCount = 0;
    let updatedCount = 0;
    let adressesCreated = 0;
    let contactsCreated = 0;
    const importErrors = [];

    const seenSirets = new Set();

    for (const row of validRows) {
      const savepointName = `sp_row_${row.row_number}`;
      try {
        const lengthErrors = validateFieldLengths(row.data);
        if (lengthErrors.length > 0) {
          importErrors.push({ row_number: row.row_number, error: lengthErrors.join(' | '), data: row.data });
          continue;
        }

        await client.query(`SAVEPOINT ${savepointName}`);

        const d = row.data;

        const codeClient = cleanText(d.code_client);
        const raisonSociale = cleanText(d.raison_sociale) || codeClient;

        // Clean and deduplicate SIRET
        let siret = d.siret ? String(d.siret).replace(/\s/g, '').trim() : null;
        if (siret === '') siret = null;
        if (siret && (siret.length !== 14 || seenSirets.has(siret))) {
          siret = null;
        }
        if (siret) seenSirets.add(siret);

        const telephone = cleanText(d.telephone) || null;
        const email = cleanText(d.email_principal) || null;
        const iban = d.iban ? String(d.iban).trim().replace(/\s/g, '') : null;
        const bic = cleanText(d.bic) || null;
        const dateMandat = d.date_mandat_sepa || null;

        const modeReglement = mapModeReglement(cleanText(d.mode_reglement));
        const conditionsPaiement = mapConditionsPaiement(cleanText(d.conditions_paiement));

        // Truncate numero_client to 10 chars to fit VARCHAR(10)
        const numeroClient = codeClient ? codeClient.substring(0, 10) : codeClient;

        const existing = await client.query(
          'SELECT id FROM clients WHERE numero_client = $1',
          [numeroClient]
        );

        let clientId;
        if (existing.rows.length > 0 && update_existing) {
          clientId = existing.rows[0].id;
          await client.query(
            `UPDATE clients SET
              raison_sociale = COALESCE($2, raison_sociale),
              siret = COALESCE($3, siret),
              telephone_principal = COALESCE($4, telephone_principal),
              email_principal = COALESCE($5, email_principal),
              mode_paiement_prefere = COALESCE($6, mode_paiement_prefere),
              delai_paiement = COALESCE($7, delai_paiement),
              iban = COALESCE($8, iban),
              bic = COALESCE($9, bic),
              date_mandat_sepa = COALESCE($10, date_mandat_sepa),
              updated_at = NOW()
            WHERE id = $1`,
            [
              clientId, raisonSociale, siret, telephone, email,
              modeReglement, conditionsPaiement,
              iban, bic, dateMandat,
            ]
          );
          updatedCount++;
        } else if (existing.rows.length > 0) {
          await client.query(`RELEASE SAVEPOINT ${savepointName}`);
          importErrors.push({ row_number: row.row_number, error: `Code client "${numeroClient}" déjà existant` });
          continue;
        } else {
          const insertRes = await client.query(
            `INSERT INTO clients (
              numero_client, raison_sociale, siret,
              telephone_principal, email_principal,
              mode_paiement_prefere, delai_paiement,
              iban, bic, date_mandat_sepa,
              forme_juridique, statut
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [
              numeroClient, raisonSociale, siret,
              telephone, email || `import_${numeroClient}@placeholder.fr`,
              modeReglement, conditionsPaiement || '30_JOURS',
              iban, bic, dateMandat,
              'SAS', 'ACTIF',
            ]
          );
          clientId = insertRes.rows[0].id;
        }

        // Build and insert address
        const adresseLigne1 = buildAdresse(
          cleanText(d.adresse_numero),
          cleanText(d.adresse_voie),
          cleanText(d.adresse_rue)
        );
        const codePostal = d.adresse_code_postal ? cleanCP(String(d.adresse_code_postal)) : null;
        const ville = cleanText(d.adresse_ville);

        if (adresseLigne1 || codePostal || ville) {
          if (update_existing && existing.rows.length > 0) {
            await client.query('DELETE FROM client_adresses WHERE client_id = $1', [clientId]);
          }
          await client.query(
            `INSERT INTO client_adresses (client_id, type, est_defaut, ligne1, code_postal, ville)
             VALUES ($1, 'FACTURATION', true, $2, $3, $4)`,
            [
              clientId,
              adresseLigne1 || '-',
              codePostal || '00000',
              ville || '-',
            ]
          );
          adressesCreated++;
        }

        // Insert contact principal
        const contactNom = cleanText(d.contact_nom);
        if (contactNom) {
          const contactParsed = parseContact(contactNom);
          const civilite = cleanText(d.contact_civilite) || null;
          const ligneDirect = cleanText(d.contact_ligne_directe) || null;
          const mobile = cleanText(d.contact_mobile) || null;

          if (update_existing && existing.rows.length > 0) {
            await client.query('DELETE FROM client_contacts WHERE client_id = $1', [clientId]);
          }

          await client.query(
            `INSERT INTO client_contacts (client_id, role, nom, prenom, fonction, telephone, mobile, est_principal)
             VALUES ($1, 'PRINCIPAL', $2, $3, $4, $5, $6, true)`,
            [
              clientId,
              contactParsed.nom || '-',
              contactParsed.prenom || '-',
              civilite,
              ligneDirect,
              mobile,
            ]
          );
          contactsCreated++;
        }

        // Insert contact secondaire
        const contact2Nom = cleanText(d.contact2_nom);
        if (contact2Nom) {
          const contact2Parsed = parseContact(contact2Nom);
          const civilite2 = cleanText(d.contact2_civilite) || null;

          await client.query(
            `INSERT INTO client_contacts (client_id, role, nom, prenom, fonction, est_principal)
             VALUES ($1, 'AUTRE', $2, $3, $4, false)`,
            [
              clientId,
              contact2Parsed.nom || '-',
              contact2Parsed.prenom || '-',
              civilite2,
            ]
          );
          contactsCreated++;
        }

        // Save custom field values
        const customFieldsData = [];
        for (const [key, val] of Object.entries(d)) {
          if (key.startsWith('custom_') && val !== null && val !== undefined) {
            const cle = key.replace('custom_', '');
            const configId = customConfigMap.get(cle);
            if (configId) {
              customFieldsData.push({ config_id: configId, cle, valeur: String(val) });
            }
          }
        }

        if (customFieldsData.length > 0) {
          for (const cf of customFieldsData) {
            await client.query(
              `INSERT INTO champs_personnalises_valeurs (config_id, entite_id, valeur)
               VALUES ($1, $2, $3)
               ON CONFLICT (config_id, entite_id) DO UPDATE SET valeur = $3, updated_at = NOW()`,
              [cf.config_id, clientId, cf.valeur]
            );
          }
        }

        // Store extra fields as champs_personnalises JSONB on clients table
        const extraFields = buildExtraFieldsJson(d);
        if (extraFields.length > 0) {
          await client.query(
            'UPDATE clients SET champs_personnalises = $2 WHERE id = $1',
            [clientId, JSON.stringify(extraFields)]
          );
        }

        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        successCount++;
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        importErrors.push({ row_number: row.row_number, error: humanizeDbError(err), data: row.data });
      }
    }

    await client.query(
      `INSERT INTO import_logs (entity_type, filename, total_rows, success_count, error_count, skipped_count, mapping_used, options_used, errors_detail, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        'clients',
        'import',
        validationResult.total,
        successCount,
        validationResult.errors + importErrors.length,
        validationResult.skipped,
        JSON.stringify(mappings),
        JSON.stringify(options),
        importErrors.length > 0 ? JSON.stringify(importErrors) : null,
        user_id || null,
      ]
    );

    await client.query('COMMIT');

    await fs.unlink(tempPath).catch(() => {});

    return {
      total: validationResult.total,
      imported: successCount,
      updated: updatedCount,
      errors: importErrors.length,
      skipped: validationResult.skipped,
      adresses_created: adressesCreated,
      contacts_created: contactsCreated,
      error_details: importErrors,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY — Réimporter les lignes corrigées
// ═══════════════════════════════════════════════════════════════════════════════

async function insertSingleClientRow(dbClient, d, update_existing, seenSirets, customConfigMap) {
  const lengthErrors = validateFieldLengths(d);
  if (lengthErrors.length > 0) {
    throw new Error(lengthErrors.join(' | '));
  }

  const codeClient = cleanText(d.code_client);
  const raisonSociale = cleanText(d.raison_sociale) || codeClient;

  let siret = d.siret ? String(d.siret).replace(/\s/g, '').trim() : null;
  if (siret === '') siret = null;
  if (siret && (siret.length !== 14 || seenSirets.has(siret))) siret = null;
  if (siret) seenSirets.add(siret);

  const telephone = cleanText(d.telephone) || null;
  const email = cleanText(d.email_principal) || null;
  const iban = d.iban ? String(d.iban).trim().replace(/\s/g, '') : null;
  const bic = cleanText(d.bic) || null;
  const dateMandat = d.date_mandat_sepa || null;

  const modeReglement = mapModeReglement(cleanText(d.mode_reglement));
  const conditionsPaiement = mapConditionsPaiement(cleanText(d.conditions_paiement));

  const numeroClient = codeClient ? codeClient.substring(0, 10) : codeClient;

  const existing = await dbClient.query(
    'SELECT id FROM clients WHERE numero_client = $1',
    [numeroClient]
  );

  let clientId;
  let isUpdate = false;
  let adresseCreated = false;
  let contactsCount = 0;

  if (existing.rows.length > 0 && update_existing) {
    clientId = existing.rows[0].id;
    await dbClient.query(
      `UPDATE clients SET
        raison_sociale = COALESCE($2, raison_sociale),
        siret = COALESCE($3, siret),
        telephone_principal = COALESCE($4, telephone_principal),
        email_principal = COALESCE($5, email_principal),
        mode_paiement_prefere = COALESCE($6, mode_paiement_prefere),
        delai_paiement = COALESCE($7, delai_paiement),
        iban = COALESCE($8, iban),
        bic = COALESCE($9, bic),
        date_mandat_sepa = COALESCE($10, date_mandat_sepa),
        updated_at = NOW()
      WHERE id = $1`,
      [clientId, raisonSociale, siret, telephone, email,
       modeReglement, conditionsPaiement, iban, bic, dateMandat]
    );
    isUpdate = true;
  } else if (existing.rows.length > 0) {
    throw new Error(`Code client "${numeroClient}" déjà existant`);
  } else {
    const insertRes = await dbClient.query(
      `INSERT INTO clients (
        numero_client, raison_sociale, siret,
        telephone_principal, email_principal,
        mode_paiement_prefere, delai_paiement,
        iban, bic, date_mandat_sepa,
        forme_juridique, statut
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [numeroClient, raisonSociale, siret,
       telephone, email || `import_${numeroClient}@placeholder.fr`,
       modeReglement, conditionsPaiement || '30_JOURS',
       iban, bic, dateMandat, 'SAS', 'ACTIF']
    );
    clientId = insertRes.rows[0].id;
  }

  const adresseLigne1 = buildAdresse(
    cleanText(d.adresse_numero), cleanText(d.adresse_voie), cleanText(d.adresse_rue)
  );
  const codePostal = d.adresse_code_postal ? cleanCP(String(d.adresse_code_postal)) : null;
  const ville = cleanText(d.adresse_ville);

  if (adresseLigne1 || codePostal || ville) {
    if (update_existing && existing.rows.length > 0) {
      await dbClient.query('DELETE FROM client_adresses WHERE client_id = $1', [clientId]);
    }
    await dbClient.query(
      `INSERT INTO client_adresses (client_id, type, est_defaut, ligne1, code_postal, ville)
       VALUES ($1, 'FACTURATION', true, $2, $3, $4)`,
      [clientId, adresseLigne1 || '-', codePostal || '00000', ville || '-']
    );
    adresseCreated = true;
  }

  const contactNom = cleanText(d.contact_nom);
  if (contactNom) {
    const contactParsed = parseContact(contactNom);
    const civilite = cleanText(d.contact_civilite) || null;
    const ligneDirect = cleanText(d.contact_ligne_directe) || null;
    const mobile = cleanText(d.contact_mobile) || null;

    if (update_existing && existing.rows.length > 0) {
      await dbClient.query('DELETE FROM client_contacts WHERE client_id = $1', [clientId]);
    }
    await dbClient.query(
      `INSERT INTO client_contacts (client_id, role, nom, prenom, fonction, telephone, mobile, est_principal)
       VALUES ($1, 'PRINCIPAL', $2, $3, $4, $5, $6, true)`,
      [clientId, contactParsed.nom || '-', contactParsed.prenom || '-',
       civilite, ligneDirect, mobile]
    );
    contactsCount++;
  }

  const contact2Nom = cleanText(d.contact2_nom);
  if (contact2Nom) {
    const contact2Parsed = parseContact(contact2Nom);
    const civilite2 = cleanText(d.contact2_civilite) || null;
    await dbClient.query(
      `INSERT INTO client_contacts (client_id, role, nom, prenom, fonction, est_principal)
       VALUES ($1, 'AUTRE', $2, $3, $4, false)`,
      [clientId, contact2Parsed.nom || '-', contact2Parsed.prenom || '-', civilite2]
    );
    contactsCount++;
  }

  const customFieldsData = [];
  for (const [key, val] of Object.entries(d)) {
    if (key.startsWith('custom_') && val !== null && val !== undefined) {
      const cle = key.replace('custom_', '');
      const configId = customConfigMap.get(cle);
      if (configId) customFieldsData.push({ config_id: configId, cle, valeur: String(val) });
    }
  }

  if (customFieldsData.length > 0) {
    for (const cf of customFieldsData) {
      await dbClient.query(
        `INSERT INTO champs_personnalises_valeurs (config_id, entite_id, valeur)
         VALUES ($1, $2, $3)
         ON CONFLICT (config_id, entite_id) DO UPDATE SET valeur = $3, updated_at = NOW()`,
        [cf.config_id, clientId, cf.valeur]
      );
    }
  }

  const extraFields = buildExtraFieldsJson(d);
  if (extraFields.length > 0) {
    await dbClient.query(
      'UPDATE clients SET champs_personnalises = $2 WHERE id = $1',
      [clientId, JSON.stringify(extraFields)]
    );
  }

  return { clientId, isUpdate, adresseCreated, contactsCount };
}

export async function retryImportRows({ rows, update_existing = false }) {
  if (!rows || rows.length === 0) {
    throw ApiError.badRequest('Aucune ligne à réimporter');
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const customConfigRes = await dbClient.query(
      "SELECT id, cle FROM champs_personnalises_config WHERE entite = 'CLIENT' AND actif = true"
    );
    const customConfigMap = new Map(customConfigRes.rows.map(r => [r.cle, r.id]));

    const seenSirets = new Set();
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let adressesCreated = 0;
    let contactsCreated = 0;

    for (const row of rows) {
      const sp = `sp_retry_${row.row_number}`;
      try {
        await dbClient.query(`SAVEPOINT ${sp}`);
        const res = insertSingleClientRow(dbClient, row.data, update_existing, seenSirets, customConfigMap);
        const result = await res;
        await dbClient.query(`RELEASE SAVEPOINT ${sp}`);

        successCount++;
        if (result.adresseCreated) adressesCreated++;
        contactsCreated += result.contactsCount;
        results.push({ row_number: row.row_number, success: true });
      } catch (err) {
        await dbClient.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        errorCount++;
        results.push({ row_number: row.row_number, success: false, error: humanizeDbError(err), data: row.data });
      }
    }

    await dbClient.query('COMMIT');

    return {
      total: rows.length,
      success: successCount,
      errors: errorCount,
      adresses_created: adressesCreated,
      contacts_created: contactsCreated,
      results,
    };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

function mapModeReglement(val) {
  if (!val) return null;
  const lower = val.toLowerCase().trim();
  if (lower.includes('prélèvement') || lower.includes('prelevement') || lower.includes('prelvt'))
    return 'PRELEVEMENT_SEPA';
  if (lower.includes('virement')) return 'VIREMENT';
  if (lower.includes('chèque') || lower.includes('cheque')) return 'CHEQUE';
  if (lower.includes('carte')) return 'CARTE';
  if (lower.includes('espèce') || lower.includes('espece')) return 'ESPECES';
  return null;
}

function mapConditionsPaiement(val) {
  if (!val) return null;
  const lower = val.toLowerCase().trim();
  if (lower.includes('comptant') || lower === '0') return 'COMPTANT';
  if (lower.includes('15') || lower.includes('quinze')) return '15_JOURS';
  if (lower.includes('45')) return '45_JOURS_FIN_MOIS';
  if (lower.includes('60')) return '60_JOURS';
  if (lower.includes('30') || lower.includes('trente')) return '30_JOURS';
  const days = parseInt(lower);
  if (!isNaN(days)) {
    if (days <= 0) return 'COMPTANT';
    if (days <= 15) return '15_JOURS';
    if (days <= 30) return '30_JOURS';
    if (days <= 45) return '45_JOURS_FIN_MOIS';
    return '60_JOURS';
  }
  return null;
}

function buildExtraFieldsJson(data) {
  const extras = [];
  const extraKeys = ['sigle', 'effectif', 'commercial', 'payeur', 'origine', 'compte_tiers', 'jour_prelevement', 'date_rappel', 'date_rdv'];
  for (const key of extraKeys) {
    const val = data[key];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      const labelMap = {
        sigle: 'Sigle',
        effectif: 'Effectif',
        commercial: 'Commercial',
        payeur: 'Payeur',
        origine: 'Origine',
        compte_tiers: 'Compte tiers',
        jour_prelevement: 'Jour prélèvement',
        date_rappel: 'Date de rappel',
        date_rdv: 'Date de rendez-vous',
      };
      extras.push({ label: labelMap[key] || key, cle: key, valeur: String(val) });
    }
  }
  return extras;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAVED MAPPINGS — CRUD
// ═══════════════════════════════════════════════════════════════════════════════

export async function listSavedMappings() {
  const result = await query(
    "SELECT id, name, mapping, created_at, updated_at FROM import_mappings_saved WHERE entity_type = 'clients' ORDER BY updated_at DESC"
  );
  return result.rows;
}

export async function saveMappingConfig({ name, mapping, user_id }) {
  const result = await query(
    `INSERT INTO import_mappings_saved (entity_type, name, mapping, created_by)
     VALUES ('clients', $1, $2, $3)
     ON CONFLICT (entity_type, name) DO UPDATE SET mapping = $2, updated_at = NOW()
     RETURNING id, name, mapping, created_at, updated_at`,
    [name, JSON.stringify(mapping), user_id || null]
  );
  return result.rows[0];
}

export async function deleteSavedMapping(id) {
  const result = await query(
    "DELETE FROM import_mappings_saved WHERE id = $1 AND entity_type = 'clients' RETURNING id",
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Mapping non trouvé');
  return { deleted: true };
}
