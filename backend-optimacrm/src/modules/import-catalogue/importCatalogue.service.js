import { pool, query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { CATALOGUE_FIELD_GROUPS, getAllStandardFields } from '../../config/catalogueFieldSynonyms.js';
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

function parsePrice(val) {
  if (val == null || val === '') return null;
  let s = String(val).trim();
  s = s.replace(/€/g, '').trim();
  // "1 234,50" → "1234.50"
  if (s.includes(',')) {
    s = s.replace(/\s/g, '').replace(',', '.');
  } else {
    s = s.replace(/\s/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 10000) / 10000;
}

function parseTva(val) {
  if (val == null || val === '') return null;
  let s = String(val).trim().replace('%', '').replace(',', '.').trim();
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return n < 1 ? Math.round(n * 100 * 100) / 100 : Math.round(n * 100) / 100;
}

function parseInteger(val) {
  if (val == null || val === '') return null;
  const n = parseInt(String(val).replace(/\s/g, '').replace(',', '.'), 10);
  return isNaN(n) ? null : n;
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

function cleanText(val) {
  if (val == null) return null;
  return String(val).replace(/\r?\n/g, ' ').trim() || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM FIELDS — Chargement dynamique
// ═══════════════════════════════════════════════════════════════════════════════

async function loadCustomFields() {
  const result = await query(
    `SELECT id, section, section_ordre, label, cle, type, obligatoire, options_liste, valeur_defaut
     FROM champs_personnalises_config
     WHERE entite = 'CATALOGUE' AND actif = true
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

    // a. Match exact with key
    if (normalizedSource === normalize(field.key)) {
      confidence = 1.0;
    }
    // b. Match exact with normalized label
    else if (normalizedSource === normalize(field.label)) {
      confidence = 0.95;
    }
    // c. Match exact with a synonym
    else if (field.synonyms?.some(s => normalize(s) === normalizedSource)) {
      confidence = 0.9;
    }
    // d. Match after normalization of synonym
    else if (field.synonyms?.some(s => {
      const ns = normalize(s);
      return ns && normalizedSource.includes(ns) && ns.length >= 3;
    })) {
      confidence = 0.85;
    }
    // e. Source contains key or synonym
    else if (normalizedSource.includes(normalize(field.key)) && normalize(field.key).length >= 3) {
      confidence = 0.75;
    }
    else if (field.synonyms?.some(s => {
      const ns = normalize(s);
      return ns && ns.length >= 4 && normalizedSource.includes(ns);
    })) {
      confidence = 0.75;
    }
    // f. Levenshtein distance
    else {
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

  // Save temp file
  const fileId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempPath = path.join(TEMP_DIR, `${fileId}.json`);
  await fs.writeFile(tempPath, JSON.stringify({ headers, rows: dataRows }));

  const preview = dataRows.slice(0, 5).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  // Load target fields (standard + custom)
  const standardFields = getAllStandardFields();
  const customFieldsGrouped = await loadCustomFields();

  const allTargetFields = [...standardFields];
  for (const [section, fields] of customFieldsGrouped) {
    for (const f of fields) {
      allTargetFields.push({ ...f, group: `Champs personnalisés > ${section}` });
    }
  }

  // Auto-mapping
  const usedFields = new Set();
  const mappings = headers.map(header => {
    const result = autoMapField(header, allTargetFields.filter(f => !usedFields.has(f.key)));
    if (result.suggested_field) usedFields.add(result.suggested_field);
    return { source_header: header, ...result };
  });

  // Build available_fields for the frontend
  const availableFieldsStandard = CATALOGUE_FIELD_GROUPS.map(g => ({
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
  const {
    skip_empty_reference = true,
    create_missing_fournisseurs = true,
    create_missing_marques = true,
    create_missing_familles = true,
    update_existing = false,
  } = options;

  // Invert mappings: source_header → target_field
  const headerToField = {};
  for (const [sourceHeader, targetField] of Object.entries(mappings)) {
    if (targetField) headerToField[sourceHeader] = targetField;
  }

  // Load lookups from DB
  const [fournisseursRes, marquesRes, famillesRes, existingRefsRes] = await Promise.all([
    query('SELECT id, LOWER(nom) as nom_lower, nom FROM fournisseurs WHERE actif = true'),
    query('SELECT id, LOWER(nom) as nom_lower, nom FROM marques WHERE actif = true'),
    query('SELECT id, LOWER(nom) as nom_lower, nom FROM familles_produits WHERE actif = true'),
    query('SELECT reference FROM catalogue_produits'),
  ]);

  const fournisseurMap = new Map(fournisseursRes.rows.map(r => [r.nom_lower, r]));
  const marqueMap = new Map(marquesRes.rows.map(r => [r.nom_lower, r]));
  const familleMap = new Map(famillesRes.rows.map(r => [r.nom_lower, r]));
  const existingRefs = new Set(existingRefsRes.rows.map(r => r.reference));

  // Load custom fields config
  const customFieldsGrouped = await loadCustomFields();
  const customFieldsFlat = new Map();
  for (const [, fields] of customFieldsGrouped) {
    for (const f of fields) customFieldsFlat.set(f.key, f);
  }

  const seenRefs = new Map();
  const newFournisseurs = new Set();
  const newMarques = new Set();
  const newFamilles = new Set();

  const validatedRows = [];
  let validCount = 0, errorCount = 0, duplicateCount = 0, skippedCount = 0;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rowNumber = rowIdx + 2; // +2 for 1-indexed + header row
    const errors = [];

    // Build mapped data
    const data = {};
    headers.forEach((h, colIdx) => {
      const field = headerToField[h];
      if (field) data[field] = row[colIdx] ?? '';
    });

    // Detect intermediate header rows
    if (isHeaderRow(data, headers, headerToField, row)) {
      validatedRows.push({
        row_number: rowNumber,
        status: 'skipped',
        data,
        errors: ["Ligne d'en-tête détectée, ignorée automatiquement"],
      });
      skippedCount++;
      continue;
    }

    // Skip manifestly empty rows
    const hasAnyValue = Object.values(data).some(v => v != null && String(v).trim() !== '');
    if (!hasAnyValue) {
      skippedCount++;
      continue;
    }

    // Clean & parse values
    const parsed = {};
    for (const [field, rawVal] of Object.entries(data)) {
      parsed[field] = parseFieldValue(field, rawVal, customFieldsFlat);
    }

    // Validate reference
    const ref = cleanText(data.reference);
    if (!ref || String(ref).trim() === '') {
      if (skip_empty_reference) {
        validatedRows.push({ row_number: rowNumber, status: 'skipped', data: parsed, errors: ['Référence vide, ligne ignorée'] });
        skippedCount++;
        continue;
      }
      errors.push('La référence est obligatoire');
    }

    // Validate designation
    if (headerToField && Object.values(headerToField).includes('designation')) {
      const des = cleanText(data.designation);
      if (!des) errors.push('La désignation est obligatoire');
    }

    // Validate prix
    if (data.prix_unitaire_ht !== undefined && data.prix_unitaire_ht !== '') {
      if (parsed.prix_unitaire_ht === null) errors.push(`Prix de vente invalide: "${data.prix_unitaire_ht}"`);
    }
    if (data.taux_tva !== undefined && data.taux_tva !== '') {
      const tva = parsed.taux_tva;
      if (tva === null) errors.push(`Taux TVA invalide: "${data.taux_tva}"`);
      else if (tva < 0 || tva > 100) errors.push(`Taux TVA hors plage (0-100): ${tva}`);
    }

    // Validate lookups
    if (ref) {
      if (seenRefs.has(ref)) {
        errors.push(`Doublon interne: même référence que la ligne ${seenRefs.get(ref)}`);
        duplicateCount++;
      } else {
        seenRefs.set(ref, rowNumber);
      }

      if (existingRefs.has(ref) && !update_existing) {
        errors.push('Référence déjà existante en base de données');
        duplicateCount++;
      }
    }

    // Fournisseur lookup
    if (data.fournisseur && String(data.fournisseur).trim()) {
      const fName = String(data.fournisseur).trim();
      const found = fournisseurMap.get(fName.toLowerCase());
      if (!found) {
        if (create_missing_fournisseurs) {
          newFournisseurs.add(fName);
          parsed.fournisseur_resolved = fName;
        } else {
          errors.push(`Fournisseur inconnu: "${fName}"`);
        }
      } else {
        parsed.fournisseur_id = found.id;
      }
    }

    // Marque lookup
    if (data.marque && String(data.marque).trim()) {
      const mName = String(data.marque).trim();
      const found = marqueMap.get(mName.toLowerCase());
      if (!found) {
        if (create_missing_marques) {
          newMarques.add(mName);
          parsed.marque_resolved = mName;
        } else {
          errors.push(`Marque inconnue: "${mName}"`);
        }
      } else {
        parsed.marque_id = found.id;
      }
    }

    // Famille lookup
    if (data.famille && String(data.famille).trim()) {
      const fName = String(data.famille).trim();
      const found = familleMap.get(fName.toLowerCase());
      if (!found) {
        if (create_missing_familles) {
          newFamilles.add(fName);
          parsed.famille_resolved = fName;
        } else {
          errors.push(`Famille inconnue: "${fName}"`);
        }
      } else {
        parsed.famille_id = found.id;
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
          errors.push(`Date invalide pour "${config.label}": "${data[field]}"`);
        }
        if (config.config_type === 'NOMBRE' && data[field] && val === null) {
          errors.push(`Nombre invalide pour "${config.label}": "${data[field]}"`);
        }
      } else if (config.required) {
        const isMapped = Object.values(headerToField).includes(field);
        if (isMapped) errors.push(`Le champ personnalisé "${config.label}" est obligatoire`);
      }
    }

    const status = errors.length > 0 ? 'error' : 'valid';
    if (errors.length > 0) errorCount++;
    else validCount++;

    validatedRows.push({ row_number: rowNumber, status, data: parsed, errors });
  }

  return {
    file_id,
    total: rows.length,
    valid: validCount,
    errors: errorCount,
    duplicates: duplicateCount,
    skipped: skippedCount,
    new_fournisseurs: [...newFournisseurs],
    new_marques: [...newMarques],
    new_familles: [...newFamilles],
    rows: validatedRows,
  };
}

function parseFieldValue(field, rawVal, customFieldsFlat) {
  const val = rawVal;
  if (val == null || String(val).trim() === '') return null;

  if (field === 'prix_unitaire_ht' || field === 'prix_achat') return parsePrice(val);
  if (field === 'taux_tva') return parseTva(val);
  if (field === 'stock_actuel' || field === 'stock_minimum') return parseInteger(val);

  const customConfig = customFieldsFlat.get(field);
  if (customConfig) {
    if (customConfig.config_type === 'NOMBRE') return parsePrice(val);
    if (customConfig.config_type === 'DATE') return parseDate(val);
    if (customConfig.config_type === 'BOOLEEN') {
      const lower = String(val).toLowerCase().trim();
      return ['oui', 'yes', 'true', '1', 'actif', 'vrai'].includes(lower) ? 'true' : 'false';
    }
    return cleanText(val);
  }

  return cleanText(val);
}

function isHeaderRow(data, headers, headerToField, rawRow) {
  const knownLabels = [
    'reference', 'designation', 'categorie', 'description', 'modele', 'marque',
    'prix', 'fournisseur', 'famille', 'code', 'ref', 'libelle', 'type',
    'code mercury', 'ref produit', 'model configurateur',
  ];

  let matchCount = 0;
  const vals = Object.values(data).map(v => String(v ?? '').toLowerCase().trim()).filter(Boolean);

  for (const val of vals) {
    const normalized = normalize(val);
    if (knownLabels.some(l => normalized.includes(l) || l.includes(normalized))) {
      matchCount++;
    }
  }

  if (matchCount >= 3) return true;

  const upperCount = rawRow.filter(cell => {
    const s = String(cell ?? '').trim();
    return s.length > 2 && s === s.toUpperCase() && /[A-Z]/.test(s);
  }).length;
  if (upperCount >= Math.floor(rawRow.length * 0.6)) return true;

  return false;
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

  const {
    create_missing_fournisseurs = true,
    create_missing_marques = true,
    create_missing_familles = true,
    update_existing = false,
  } = options;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create missing fournisseurs
    const fournisseurIdMap = new Map();
    if (create_missing_fournisseurs && validationResult.new_fournisseurs.length > 0) {
      for (const nom of validationResult.new_fournisseurs) {
        const res = await client.query(
          'INSERT INTO fournisseurs (nom) VALUES ($1) ON CONFLICT (nom) DO UPDATE SET nom = $1 RETURNING id',
          [nom]
        );
        fournisseurIdMap.set(nom.toLowerCase(), res.rows[0].id);
      }
    }

    // Create missing marques
    const marqueIdMap = new Map();
    if (create_missing_marques && validationResult.new_marques.length > 0) {
      for (const nom of validationResult.new_marques) {
        const res = await client.query(
          'INSERT INTO marques (nom) VALUES ($1) ON CONFLICT (nom) DO UPDATE SET nom = $1 RETURNING id',
          [nom]
        );
        marqueIdMap.set(nom.toLowerCase(), res.rows[0].id);
      }
    }

    // Create missing familles
    const familleIdMap = new Map();
    if (create_missing_familles && validationResult.new_familles.length > 0) {
      for (const nom of validationResult.new_familles) {
        const res = await client.query(
          'INSERT INTO familles_produits (nom, categorie) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
          [nom, 'COPIEUR']
        );
        if (res.rows.length > 0) {
          familleIdMap.set(nom.toLowerCase(), res.rows[0].id);
        } else {
          const existing = await client.query('SELECT id FROM familles_produits WHERE LOWER(nom) = LOWER($1) LIMIT 1', [nom]);
          if (existing.rows.length > 0) familleIdMap.set(nom.toLowerCase(), existing.rows[0].id);
        }
      }
    }

    // Also load existing lookups for resolution
    const [fRes, mRes, famRes] = await Promise.all([
      client.query('SELECT id, LOWER(nom) as nom_lower FROM fournisseurs'),
      client.query('SELECT id, LOWER(nom) as nom_lower FROM marques'),
      client.query('SELECT id, LOWER(nom) as nom_lower FROM familles_produits'),
    ]);
    for (const r of fRes.rows) if (!fournisseurIdMap.has(r.nom_lower)) fournisseurIdMap.set(r.nom_lower, r.id);
    for (const r of mRes.rows) if (!marqueIdMap.has(r.nom_lower)) marqueIdMap.set(r.nom_lower, r.id);
    for (const r of famRes.rows) if (!familleIdMap.has(r.nom_lower)) familleIdMap.set(r.nom_lower, r.id);

    // Load custom fields config for saving values
    const customConfigRes = await client.query(
      "SELECT id, cle FROM champs_personnalises_config WHERE entite = 'CATALOGUE' AND actif = true"
    );
    const customConfigMap = new Map(customConfigRes.rows.map(r => [r.cle, r.id]));

    let successCount = 0;
    let updatedCount = 0;
    const importErrors = [];

    for (const row of validRows) {
      try {
        const d = row.data;

        // Resolve IDs
        let fournisseurId = d.fournisseur_id || null;
        if (!fournisseurId && d.fournisseur_resolved) {
          fournisseurId = fournisseurIdMap.get(d.fournisseur_resolved.toLowerCase()) || null;
        }
        if (!fournisseurId && d.fournisseur) {
          fournisseurId = fournisseurIdMap.get(String(d.fournisseur).toLowerCase()) || null;
        }

        let marqueId = d.marque_id || null;
        if (!marqueId && d.marque_resolved) {
          marqueId = marqueIdMap.get(d.marque_resolved.toLowerCase()) || null;
        }
        if (!marqueId && d.marque) {
          marqueId = marqueIdMap.get(String(d.marque).toLowerCase()) || null;
        }

        let familleId = d.famille_id || null;
        if (!familleId && d.famille_resolved) {
          familleId = familleIdMap.get(d.famille_resolved.toLowerCase()) || null;
        }
        if (!familleId && d.famille) {
          familleId = familleIdMap.get(String(d.famille).toLowerCase()) || null;
        }

        const ref = cleanText(d.reference);
        const designation = cleanText(d.designation) || ref;

        // Check for update
        const existing = await client.query('SELECT id FROM catalogue_produits WHERE reference = $1', [ref]);

        let produitId;
        if (existing.rows.length > 0 && update_existing) {
          produitId = existing.rows[0].id;
          await client.query(
            `UPDATE catalogue_produits SET
              designation = COALESCE($2, designation),
              description = COALESCE($3, description),
              categorie = COALESCE($4, categorie),
              prix_unitaire_ht = COALESCE($5, prix_unitaire_ht),
              taux_tva = COALESCE($6, taux_tva),
              unite = COALESCE($7, unite),
              fournisseur_id = COALESCE($8, fournisseur_id),
              marque_id = COALESCE($9, marque_id),
              famille_id = COALESCE($10, famille_id),
              modele = COALESCE($11, modele),
              reference_fournisseur = COALESCE($12, reference_fournisseur),
              code_barre = COALESCE($13, code_barre),
              prix_achat = COALESCE($14, prix_achat),
              quantite_stock = COALESCE($15, quantite_stock),
              alerte_stock_mini = COALESCE($16, alerte_stock_mini),
              updated_at = NOW()
            WHERE id = $1`,
            [
              produitId, designation, cleanText(d.description),
              cleanText(d.categorie), d.prix_unitaire_ht, d.taux_tva,
              cleanText(d.unite), fournisseurId, marqueId, familleId,
              cleanText(d.modele), cleanText(d.reference_fournisseur),
              cleanText(d.code_barre), d.prix_achat,
              d.stock_actuel, d.stock_minimum,
            ]
          );
          updatedCount++;
        } else {
          const insertRes = await client.query(
            `INSERT INTO catalogue_produits (
              reference, designation, description, categorie,
              prix_unitaire_ht, taux_tva, unite,
              fournisseur_id, marque_id, famille_id,
              modele, reference_fournisseur, code_barre,
              prix_achat, quantite_stock, alerte_stock_mini
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
            [
              ref, designation, cleanText(d.description),
              cleanText(d.categorie), d.prix_unitaire_ht ?? 0, d.taux_tva ?? 20,
              cleanText(d.unite) || 'unité',
              fournisseurId, marqueId, familleId,
              cleanText(d.modele), cleanText(d.reference_fournisseur),
              cleanText(d.code_barre), d.prix_achat,
              d.stock_actuel ?? 0, d.stock_minimum ?? 0,
            ]
          );
          produitId = insertRes.rows[0].id;
        }

        // Save custom field values
        for (const [key, val] of Object.entries(d)) {
          if (key.startsWith('custom_') && val !== null && val !== undefined) {
            const cle = key.replace('custom_', '');
            const configId = customConfigMap.get(cle);
            if (configId) {
              await client.query(
                `INSERT INTO champs_personnalises_valeurs (config_id, entite_id, valeur)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (config_id, entite_id) DO UPDATE SET valeur = $3, updated_at = NOW()`,
                [configId, produitId, String(val)]
              );
            }
          }
        }

        successCount++;
      } catch (err) {
        importErrors.push({ row_number: row.row_number, error: err.message });
      }
    }

    // Log the import
    await client.query(
      `INSERT INTO import_logs (entity_type, filename, total_rows, success_count, error_count, skipped_count, mapping_used, options_used, errors_detail, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        'catalogue',
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

    // Cleanup temp file
    await fs.unlink(tempPath).catch(() => {});

    return {
      total: validationResult.total,
      imported: successCount,
      updated: updatedCount,
      errors: importErrors.length,
      skipped: validationResult.skipped,
      new_fournisseurs_created: validationResult.new_fournisseurs.length,
      new_marques_created: validationResult.new_marques.length,
      new_familles_created: validationResult.new_familles.length,
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
// SAVED MAPPINGS — CRUD
// ═══════════════════════════════════════════════════════════════════════════════

export async function listSavedMappings() {
  const result = await query(
    "SELECT id, name, mapping, created_at, updated_at FROM import_mappings_saved WHERE entity_type = 'catalogue' ORDER BY updated_at DESC"
  );
  return result.rows;
}

export async function saveMappingConfig({ name, mapping, user_id }) {
  const result = await query(
    `INSERT INTO import_mappings_saved (entity_type, name, mapping, created_by)
     VALUES ('catalogue', $1, $2, $3)
     ON CONFLICT (entity_type, name) DO UPDATE SET mapping = $2, updated_at = NOW()
     RETURNING id, name, mapping, created_at, updated_at`,
    [name, JSON.stringify(mapping), user_id || null]
  );
  return result.rows[0];
}

export async function deleteSavedMapping(id) {
  const result = await query(
    "DELETE FROM import_mappings_saved WHERE id = $1 AND entity_type = 'catalogue' RETURNING id",
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Mapping non trouvé');
  return { deleted: true };
}
