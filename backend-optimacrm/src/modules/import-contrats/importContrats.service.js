import { pool, query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { CONTRATS_FIELD_GROUPS, getAllContratFields, RUBRIQUE_FIELD_TO_CATEGORIE } from '../../config/contratsFieldSynonyms.js';
import { getCategoriesForType } from '../../config/contratCategories.js';
import fs from 'fs/promises';
import path from 'path';

const TEMP_DIR = path.resolve('uploads/import-temp');

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
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

function parseDecimal(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  let s = String(val).trim().replace(/€/g, '').trim();
  if (s.includes(',')) {
    s = s.replace(/\s/g, '').replace(',', '.');
  } else {
    s = s.replace(/\s/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseInteger(val) {
  if (val == null || val === '') return null;
  const n = parseInt(String(val).replace(/\s/g, '').replace(',', '.'), 10);
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  if (val == null || val === '' || val === 0 || val === '0') return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  // ISO 8601 datetime (from JSON roundtrip of xlsx Date objects)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const dmySlash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2].padStart(2, '0')}-${dmySlash[1].padStart(2, '0')}`;
  // yyyy-mm-dd or yyyy/mm/dd
  const ymd = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  // Excel serial number
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + serial * 86400000);
    return date.toISOString().split('T')[0];
  }
  return null;
}

function cleanText(val) {
  if (val == null) return null;
  return String(val).replace(/\r?\n/g, ' ').trim() || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS LOGIC — Mappers
// ═══════════════════════════════════════════════════════════════════════════════

const STATUT_MAP = {
  'contrat actif': 'Actif',
  'nouveau contrat': 'Actif',
  'actif': 'Actif',
  'suspendu': 'Suspendu',
  'résiliation prévue': 'Suspendu',
  'resilisation prevue': 'Suspendu',
  'résilié': 'Résilié',
  'resilie': 'Résilié',
  'contrat résilié': 'Résilié',
  'contrat resilie': 'Résilié',
  'résilié pour reconditionnement': 'Résilié',
  'échu': 'Échu',
  'echu': 'Échu',
  '1': 'Actif',
  '0': 'Résilié',
};

const PERIODICITE_MAP = {
  't': 'Trimestriel',
  'm': 'Mensuel',
  'b': 'Bimestriel',
  's': 'Semestriel',
  'a': 'Annuel',
  'mensuel': 'Mensuel',
  'bimestriel': 'Bimestriel',
  'trimestriel': 'Trimestriel',
  'semestriel': 'Semestriel',
  'annuel': 'Annuel',
};

const KNOWN_BRANDS = [
  'canon', 'ricoh', 'xerox', 'konica', 'minolta', 'konica minolta',
  'hp', 'brother', 'sharp', 'epson', 'kyocera', 'toshiba', 'lexmark',
  'samsung', 'oki', 'dell', 'panasonic', 'olivetti',
];

function mapStatut(val) {
  if (!val) return 'Actif';
  const key = normalize(val);
  return STATUT_MAP[key] || STATUT_MAP[String(val).trim()] || 'Actif';
}

function mapPeriodicite(val) {
  if (!val) return 'Mensuel';
  const key = String(val).trim().toLowerCase();
  return PERIODICITE_MAP[key] || 'Mensuel';
}

function mapLocationInterne(val) {
  if (!val) return false;
  return normalize(val) === 'location interne';
}

function extractBrandModel(designation) {
  if (!designation) return { marque: null, modele: null, designation_clean: null };
  const firstLine = designation.split(/[\r\n]/)[0].trim();
  if (!firstLine) return { marque: null, modele: null, designation_clean: designation };
  const words = firstLine.split(/\s+/);
  if (words.length >= 2) {
    const twoWords = `${words[0]} ${words[1]}`.toLowerCase();
    if (KNOWN_BRANDS.includes(twoWords)) {
      return { marque: `${words[0]} ${words[1]}`.toUpperCase(), modele: words.slice(2).join(' ') || null, designation_clean: firstLine };
    }
  }
  const firstWord = words[0]?.toLowerCase();
  if (KNOWN_BRANDS.includes(firstWord)) {
    return { marque: words[0].toUpperCase(), modele: words.slice(1).join(' ') || null, designation_clean: firstLine };
  }
  return { marque: null, modele: null, designation_clean: firstLine };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT RESOLUTION — centralisé pour préparation multi-tenant
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeClientCode(raw) {
  if (!raw) return '';
  let code = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  const match = code.match(/^([A-Z]+)-?(.+)$/);
  if (match) {
    const prefix = match[1];
    const rest = match[2].replace(/^0+/, '') || '0';
    return `${prefix}-${rest}`;
  }
  const numMatch = code.match(/^0*(\d+)$/);
  if (numMatch) return numMatch[1];
  return code;
}

/**
 * Charge les clients depuis la DB. Point unique de filtrage —
 * ajouter `WHERE tenant_id = $1` ici suffira pour le multi-tenant.
 */
async function loadClientMap(/* tenantId */) {
  const clientsRes = await query(
    'SELECT id, numero_client, raison_sociale FROM clients'
    // TODO multi-tenant: + ' WHERE tenant_id = $1', [tenantId]
  );
  const map = new Map();
  for (const c of clientsRes.rows) {
    if (c.numero_client) {
      map.set(c.numero_client.trim().toUpperCase(), c);
      map.set(normalizeClientCode(c.numero_client), c);
    }
  }
  return map;
}

function findClient(clientMap, rawCode) {
  if (!rawCode) return null;
  const upper = String(rawCode).trim().toUpperCase();
  if (clientMap.has(upper)) return clientMap.get(upper);
  const normalized = normalizeClientCode(rawCode);
  return clientMap.get(normalized) || null;
}

/**
 * Charge les contrats existants. Point unique de filtrage multi-tenant.
 */
async function loadExistingContrats(/* tenantId */) {
  const res = await query(
    'SELECT id, numero_contrat FROM contrats WHERE deleted_at IS NULL'
    // TODO multi-tenant: + ' AND tenant_id = $1', [tenantId]
  );
  return new Map(res.rows.map(r => [r.numero_contrat.trim().toUpperCase(), r.id]));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM FIELDS — Chargement dynamique
// ═══════════════════════════════════════════════════════════════════════════════

function mapCustomType(dbType) {
  const map = { TEXTE: 'text', NOMBRE: 'number', DATE: 'date', LISTE: 'select', BOOLEEN: 'boolean' };
  return map[dbType] || 'text';
}

async function loadCustomFields() {
  const result = await query(
    `SELECT id, section, section_ordre, label, cle, type, obligatoire, options_liste, valeur_defaut
     FROM champs_personnalises_config
     WHERE entite = 'CONTRAT' AND actif = true
     ORDER BY section_ordre, section, ordre`
  );
  const grouped = new Map();
  for (const row of result.rows) {
    if (!grouped.has(row.section)) grouped.set(row.section, []);
    const synonyms = [normalize(row.label), normalize(row.cle), normalize(row.cle.replace(/_/g, ' '))].filter(Boolean);
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

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-MAPPING
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

    if (confidence > bestConfidence ||
        (confidence === bestConfidence && bestMatch?.key?.startsWith('custom_') && !field.key.startsWith('custom_'))) {
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
// PARSE — accepts optional typeContrat for pre-selecting rubrique fields
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

export async function parseFile(file, typeContrat = null) {
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
    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  }

  if (!rows || rows.length < 2) {
    throw ApiError.badRequest('Le fichier est vide ou ne contient qu\'une seule ligne');
  }

  const headers = rows[0].map(h => String(h ?? '').replace(/\r?\n/g, ' ').trim());
  const dataRows = rows.slice(1).filter(row =>
    row.some(cell => cell != null && cell !== '' && String(cell).trim() !== '')
  );

  const fileId = `temp_contrats_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempPath = path.join(TEMP_DIR, `${fileId}.json`);
  await fs.writeFile(tempPath, JSON.stringify({ headers, rows: dataRows, typeContrat }));

  const preview = dataRows.slice(0, 5).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
    return obj;
  });

  const standardFields = getAllContratFields();
  const customFieldsGrouped = await loadCustomFields();

  const allTargetFields = [...standardFields];
  for (const [, fields] of customFieldsGrouped) {
    allTargetFields.push(...fields);
  }

  // Try to load a saved mapping for this type
  let savedMappingHint = null;
  if (typeContrat) {
    const savedRes = await query(
      "SELECT mapping FROM import_mappings_saved WHERE entity_type = 'contrats' AND type_contrat = $1 ORDER BY updated_at DESC LIMIT 1",
      [typeContrat]
    );
    if (savedRes.rows.length > 0) {
      savedMappingHint = savedRes.rows[0].mapping;
    }
  }

  const usedFields = new Set();
  const mappings = headers.map(header => {
    // If we have a saved mapping hint, use it first
    if (savedMappingHint && savedMappingHint[header]) {
      const savedField = savedMappingHint[header];
      usedFields.add(savedField);
      return {
        source_header: header,
        suggested_field: savedField,
        confidence: 0.95,
        field_group: null,
        is_custom_field: savedField.startsWith('custom_'),
      };
    }
    const result = autoMapField(header, allTargetFields.filter(f => !usedFields.has(f.key)));
    if (result.suggested_field) usedFields.add(result.suggested_field);
    return { source_header: header, ...result };
  });

  const availableFieldsStandard = CONTRATS_FIELD_GROUPS.map(g => ({
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

  // Detect format
  const hasRubriqueFields = mappings.some(m =>
    m.suggested_field && m.suggested_field.startsWith('rubrique_')
  );

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
    type_contrat: typeContrat,
    detected_format: hasRubriqueFields ? 'colonnes_rubriques' : 'standard',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD VALUE PARSING
// ═══════════════════════════════════════════════════════════════════════════════

function parseFieldValue(field, rawVal, customFieldsFlat) {
  const val = rawVal;
  if (val == null || String(val).trim() === '') return null;

  const decimal6Fields = [
    'cout_copie_nb', 'cout_copie_couleur',
    'cout_copie_t1', 'cout_copie_t2', 'cout_copie_t3',
  ];
  const decimalFields = [
    'montant_finance', 'loyer_ht', 'taux_tva',
    'service_connectic', 'service_collecteur', 'service_divers', 'service_autre',
    'derniere_facture_montant',
    'ligne_prix_unitaire_ht', 'ligne_montant_ht',
    'ftc', 'ect',
  ];
  const integerFields = [
    'duree_contrat_mois',
    'volume_forfait_nb', 'volume_forfait_couleur',
    'volume_forfait_t1', 'volume_forfait_t2',
    'ligne_quantite',
  ];
  const dateFields = [
    'date_signature', 'date_installation', 'date_prochaine_facture',
    'date_renouvellement', 'date_echeance', 'derniere_facture_date',
  ];

  // Rubrique fields are always decimal
  if (field.startsWith('rubrique_')) return parseDecimal(val);

  if (decimal6Fields.includes(field)) return parseDecimal(val);
  if (decimalFields.includes(field)) return parseDecimal(val);
  if (integerFields.includes(field)) return parseInteger(val);
  if (dateFields.includes(field)) return parseDate(val);

  if (customFieldsFlat) {
    const customConfig = customFieldsFlat.get(field);
    if (customConfig) {
      if (customConfig.config_type === 'NOMBRE') return parseDecimal(val);
      if (customConfig.config_type === 'DATE') return parseDate(val);
      if (customConfig.config_type === 'BOOLEEN') {
        const lower = String(val).toLowerCase().trim();
        return ['oui', 'yes', 'true', '1', 'vrai'].includes(lower) ? 'true' : 'false';
      }
      return cleanText(val);
    }
  }

  return cleanText(val);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE CONTRAT LIGNES — two modes: machine-based (Copieur) and rubrique-based
// ═══════════════════════════════════════════════════════════════════════════════

function generateContratLignesMachine(machine) {
  const lignes = [];
  let ordre = 0;

  const nb = parseFloat(machine.cout_copie_nb) || 0;
  const volNb = parseInt(machine.volume_forfait_nb) || 0;
  if (nb > 0 || volNb > 0) {
    lignes.push({
      ordre: ordre++,
      categorie_ligne: 'Forfait Copie N&B',
      reference: 'FORF1',
      designation: 'Forfait coût copie noir et blanc',
      quantite: volNb || 0,
      prix_unitaire_ht: nb,
      taux_tva: 20,
    });
  }

  const coul = parseFloat(machine.cout_copie_couleur) || 0;
  const volCoul = parseInt(machine.volume_forfait_couleur) || 0;
  if (coul > 0 || volCoul > 0) {
    lignes.push({
      ordre: ordre++,
      categorie_ligne: 'Forfait Copie Couleur',
      reference: 'FORF2',
      designation: 'Forfait coût copie couleur',
      quantite: volCoul || 0,
      prix_unitaire_ht: coul,
      taux_tva: 20,
    });
  }

  const services = [
    { field: 'service_connectic', cat: 'Service Connectic', ref: 'CNTC', label: 'Service Pass' },
    { field: 'service_collecteur', cat: 'PLC', ref: 'AUT', label: 'Service Collecteur' },
    { field: 'service_divers', cat: 'PLC', ref: 'AUT', label: 'Service Divers' },
    { field: 'service_autre', cat: 'PLC', ref: 'AUT', label: 'Service Autre' },
  ];
  for (const svc of services) {
    const v = parseFloat(machine[svc.field]) || 0;
    if (v > 0) {
      lignes.push({
        ordre: ordre++,
        categorie_ligne: svc.cat,
        reference: svc.ref,
        designation: svc.label,
        quantite: 1,
        prix_unitaire_ht: v,
        taux_tva: 20,
      });
    }
  }

  return lignes;
}

/**
 * Génère les lignes de contrat depuis les champs rubrique_*_ht mappés.
 * Le prix vient TOUJOURS de la cellule. Cellule vide ou 0 → aucune ligne.
 */
function generateContratLignesRubriques(parsed, defaultTva) {
  const lignes = [];
  let ordre = 0;

  for (const [fieldKey, categorie] of Object.entries(RUBRIQUE_FIELD_TO_CATEGORIE)) {
    const val = parseFloat(parsed[fieldKey]);
    if (!val || val <= 0) continue;

    lignes.push({
      ordre: ordre++,
      categorie_ligne: categorie,
      reference: null,
      designation: categorie,
      quantite: 1,
      prix_unitaire_ht: val,
      taux_tva: defaultTva,
      actif: true,
      inclus_abonnement: true,
    });
  }

  return lignes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE
// ═══════════════════════════════════════════════════════════════════════════════

export async function validateData({ file_id, mappings, options = {}, typeContrat = null }) {
  const tempPath = path.join(TEMP_DIR, `${file_id}.json`);
  let fileData;
  try {
    const raw = await fs.readFile(tempPath, 'utf-8');
    fileData = JSON.parse(raw);
  } catch {
    throw ApiError.badRequest('Fichier temporaire introuvable. Veuillez relancer le parsing.');
  }

  const { headers, rows } = fileData;
  const effectiveType = typeContrat || fileData.typeContrat || null;
  const { skip_duplicates = false, update_existing = true } = options;

  const headerToField = {};
  for (const [sourceHeader, targetField] of Object.entries(mappings)) {
    if (targetField) headerToField[sourceHeader] = targetField;
  }

  const customFieldsGrouped = await loadCustomFields();
  const customFieldsFlat = new Map();
  for (const [, fields] of customFieldsGrouped) {
    for (const f of fields) customFieldsFlat.set(f.key, f);
  }

  const clientMap = await loadClientMap();
  const existingContrats = await loadExistingContrats();

  const marquesRes = await query('SELECT LOWER(nom) as nom_lower FROM marques WHERE actif = true');
  const dbBrands = marquesRes.rows.map(r => r.nom_lower);
  const allBrands = [...new Set([...KNOWN_BRANDS, ...dbBrands])];

  // Detect format: rubrique columns OR ligne-per-row
  const hasRubriqueMapping = Object.values(headerToField).some(f => f && f.startsWith('rubrique_'));
  const hasLigneMapping = Object.values(headerToField).some(f => f && (f === 'ligne_prix_unitaire_ht' || f === 'ligne_montant_ht'));
  const isRubriqueFormat = hasRubriqueMapping;
  const isLigneParLigne = hasLigneMapping && !hasRubriqueMapping;

  const validatedRows = [];
  let validCount = 0;
  let errorCount = 0;
  let clientErrors = 0;
  let duplicateContrats = 0;
  let totalMachines = 0;
  let totalLignes = 0;
  let contratsWithoutLines = 0;
  const missingClients = new Set();
  const seenContrats = new Map();
  const duplicatesInFile = [];

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
    if (!hasAnyValue) continue;

    const parsed = {};
    for (const [field, rawVal] of Object.entries(data)) {
      parsed[field] = parseFieldValue(field, rawVal, customFieldsFlat);
    }

    // --- numero_contrat ---
    const numContrat = cleanText(data.numero_contrat);
    if (!numContrat) {
      errors.push('Le numéro de contrat est obligatoire');
    }
    parsed.numero_contrat = numContrat;

    // --- type_contrat ---
    if (effectiveType) {
      parsed.type_contrat = effectiveType;
    } else {
      const typeContratVal = cleanText(data.type_contrat);
      if (typeContratVal) {
        const validTypes = ['Copieur', 'Telephonie', 'Informatique', 'Securite'];
        const normalized = validTypes.find(t => normalize(t) === normalize(typeContratVal));
        parsed.type_contrat = normalized || 'Copieur';
        if (!normalized) warnings.push(`Type contrat "${typeContratVal}" inconnu, défaut: Copieur`);
      } else {
        parsed.type_contrat = 'Copieur';
      }
    }

    // --- Client resolution (centralisée) ---
    const codeClient = cleanText(data.code_client);
    if (codeClient) {
      const client = findClient(clientMap, codeClient);
      if (client) {
        parsed.client_id = client.id;
        parsed.client_raison_sociale = client.raison_sociale;
        const nomClient = cleanText(data.nom_client);
        if (nomClient && client.raison_sociale) {
          if (normalize(nomClient) !== normalize(client.raison_sociale)) {
            warnings.push(`Le nom "${nomClient}" ne correspond pas au client ${codeClient} en base ("${client.raison_sociale}")`);
          }
        }
      } else {
        errors.push(`Client "${codeClient}" introuvable dans la base`);
        missingClients.add(codeClient);
        clientErrors++;
      }
    } else {
      errors.push('Le code client est obligatoire');
      clientErrors++;
    }

    // --- Statut, periodicite ---
    parsed.statut = mapStatut(data.statut);
    parsed.periodicite = mapPeriodicite(data.periodicite);
    parsed.location_interne = mapLocationInterne(data.location_interne);

    // --- Type facturation ---
    if (data.type_facturation) {
      const tf = cleanText(data.type_facturation);
      parsed.type_facturation = ['Unique', 'Periodique'].find(t => normalize(t) === normalize(tf)) || 'Periodique';
    } else {
      parsed.type_facturation = 'Periodique';
    }

    // --- date_debut ---
    parsed.date_debut = parsed.date_signature || parsed.date_installation || new Date().toISOString().split('T')[0];

    // --- TVA ---
    const defaultTva = parsed.taux_tva != null ? parsed.taux_tva : 20;

    // --- Brand/model — uniquement pour Copieur ---
    if (parsed.type_contrat === 'Copieur') {
      const designation = cleanText(data.designation_produit);
      if (designation) {
        const { marque, modele, designation_clean } = extractBrandModel(designation);
        parsed._machine_marque = marque;
        parsed._machine_modele = modele;
        parsed._machine_designation = designation_clean;
      }
    }

    // --- Duplicate detection ---
    if (numContrat) {
      const upperNum = numContrat.toUpperCase();
      if (seenContrats.has(upperNum)) {
        if (!isLigneParLigne) {
          duplicateContrats++;
          duplicatesInFile.push({
            numero_contrat: numContrat,
            row_first: seenContrats.get(upperNum),
            row_duplicate: rowNumber,
          });
          warnings.push(`Doublon de numéro contrat "${numContrat}" dans le fichier (déjà vu ligne ${seenContrats.get(upperNum)})`);
        }
      } else {
        seenContrats.set(upperNum, rowNumber);
      }

      if (existingContrats.has(upperNum)) {
        if (skip_duplicates) {
          warnings.push(`Contrat "${numContrat}" existant — sera ignoré`);
          parsed._skip_duplicate = true;
        } else if (update_existing) {
          parsed._existing_contrat_id = existingContrats.get(upperNum);
          warnings.push(`Contrat "${numContrat}" existant — sera mis à jour`);
        } else {
          parsed._existing_contrat_id = existingContrats.get(upperNum);
          if (parsed.type_contrat === 'Copieur') {
            warnings.push(`Contrat "${numContrat}" existant — machine ajoutée au contrat`);
          } else {
            warnings.push(`Contrat "${numContrat}" existant — lignes d'abonnement mises à jour`);
          }
        }
      }
    }

    // --- Compute auto-generated lines ---
    let autoLignes;
    if (isLigneParLigne) {
      // Format "ligne par rubrique": each row = one contrat_ligne
      const prixUnit = parsed.ligne_prix_unitaire_ht;
      const montant = parsed.ligne_montant_ht;
      const qte = parsed.ligne_quantite || 1;
      const cat = parsed.ligne_categorie || null;
      const desig = parsed.ligne_designation || cat || 'Abonnement';
      const effectivePrix = prixUnit != null ? prixUnit : (montant != null ? montant / qte : 0);
      if (effectivePrix > 0 || cat) {
        autoLignes = [{
          ordre: 0,
          categorie_ligne: cat || 'Autre',
          reference: null,
          designation: desig,
          quantite: qte,
          prix_unitaire_ht: effectivePrix,
          taux_tva: defaultTva,
          actif: true,
          inclus_abonnement: true,
        }];
      } else {
        autoLignes = [];
      }
    } else if (isRubriqueFormat) {
      autoLignes = generateContratLignesRubriques(parsed, defaultTva);
      if (autoLignes.length === 0) {
        contratsWithoutLines++;
        warnings.push('Aucune rubrique avec montant > 0 — contrat sans ligne d\'abonnement');
      }
    } else {
      const machineParams = {
        cout_copie_nb: parsed.cout_copie_nb || 0,
        cout_copie_couleur: parsed.cout_copie_couleur || 0,
        volume_forfait_nb: parsed.volume_forfait_nb || 0,
        volume_forfait_couleur: parsed.volume_forfait_couleur || 0,
        service_connectic: parsed.service_connectic || 0,
        service_collecteur: parsed.service_collecteur || 0,
        service_divers: parsed.service_divers || 0,
        service_autre: parsed.service_autre || 0,
      };
      autoLignes = generateContratLignesMachine(machineParams);
    }

    parsed._auto_lignes = autoLignes;
    parsed._auto_lignes_count = autoLignes.length;
    parsed._is_rubrique_format = isRubriqueFormat;
    parsed._is_ligne_par_ligne = isLigneParLigne;
    parsed._default_tva = defaultTva;
    totalLignes += autoLignes.length;

    if (parsed.type_contrat === 'Copieur' && (parsed.numero_serie || cleanText(data.designation_produit))) {
      totalMachines++;
    }

    parsed._warnings = warnings;

    let status;
    if (errors.length > 0) { status = 'error'; errorCount++; }
    else if (parsed._skip_duplicate) { status = 'skipped'; }
    else { status = 'valid'; validCount++; }

    validatedRows.push({ row_number: rowNumber, status, data: parsed, errors, warnings });
  }

  return {
    file_id,
    total: rows.length,
    valid: validCount,
    errors: errorCount,
    duplicates: duplicateContrats,
    duplicates_in_file: duplicatesInFile,
    skipped: rows.length - validCount - errorCount,
    missing_clients: [...missingClients],
    client_errors: clientErrors,
    total_machines: totalMachines,
    total_lignes_auto: totalLignes,
    contrats_without_lines: contratsWithoutLines,
    format: isLigneParLigne ? 'ligne_par_rubrique' : isRubriqueFormat ? 'colonnes_rubriques' : 'standard',
    type_contrat: typeContrat,
    rows: validatedRows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeImport({ file_id, mappings, options = {}, user_id, typeContrat = null }) {
  const tempPath = path.join(TEMP_DIR, `${file_id}.json`);
  let fileData;
  try {
    const raw = await fs.readFile(tempPath, 'utf-8');
    fileData = JSON.parse(raw);
  } catch {
    throw ApiError.badRequest('Fichier temporaire introuvable. Veuillez relancer le parsing.');
  }

  const validationResult = await validateData({ file_id, mappings, options, typeContrat });
  const validRows = validationResult.rows.filter(r => r.status === 'valid');

  if (validRows.length === 0) {
    throw ApiError.badRequest('Aucune ligne valide à importer');
  }

  const client = await pool.connect();
  let contratsCreated = 0;
  let contratsUpdated = 0;
  let machinesCreated = 0;
  let lignesCreated = 0;
  let contratsWithoutLines = 0;
  const importErrors = [];
  const createdContratsMap = new Map();

  try {
    await client.query('BEGIN');

    const customConfigRes = await client.query(
      "SELECT id, cle FROM champs_personnalises_config WHERE entite = 'CONTRAT' AND actif = true"
    );
    const customConfigMap = new Map(customConfigRes.rows.map(r => [r.cle, r.id]));

    // Track contrats whose existing lignes have been cleared (for ligne_par_ligne upsert)
    const clearedContratsLignes = new Set();

    for (const row of validRows) {
      try {
        await client.query('SAVEPOINT row_sp');
        const d = row.data;
        let contratId;
        const isUpdate = !!d._existing_contrat_id;
        const isRubrique = d._is_rubrique_format;
        const isLPL = d._is_ligne_par_ligne;

        // --- UPSERT: if contrat exists, UPDATE header + DELETE/INSERT lines ---
        if (d._existing_contrat_id && !createdContratsMap.has(d.numero_contrat.toUpperCase())) {
          contratId = d._existing_contrat_id;
          createdContratsMap.set(d.numero_contrat.toUpperCase(), contratId);

          await client.query(
            `UPDATE contrats SET
              type_contrat = COALESCE($2, type_contrat),
              type_facturation = COALESCE($3, type_facturation),
              client_id = COALESCE($4, client_id),
              periodicite = COALESCE($5, periodicite),
              date_signature = COALESCE($6, date_signature),
              date_debut = COALESCE($7, date_debut),
              date_echeance = COALESCE($8, date_echeance),
              date_prochaine_facture = COALESCE($9, date_prochaine_facture),
              prochaine_date_facturation = COALESCE($9, prochaine_date_facturation),
              date_renouvellement = COALESCE($10, date_renouvellement),
              duree_contrat_mois = COALESCE($11, duree_contrat_mois),
              statut = COALESCE($12, statut),
              notes = COALESCE($13, notes),
              ftc = COALESCE($14, ftc),
              ect = COALESCE($15, ect),
              updated_at = NOW()
            WHERE id = $1`,
            [
              contratId,
              d.type_contrat || null,
              d.type_facturation || null,
              d.client_id || null,
              d.periodicite || null,
              d.date_signature || null,
              d.date_debut || null,
              d.date_echeance || null,
              d.date_prochaine_facture || null,
              d.date_renouvellement || null,
              d.duree_contrat_mois || null,
              d.statut || null,
              d.notes || null,
              d.ftc || null,
              d.ect || null,
            ]
          );

          // Clear old lignes once per contrat when we have new data to insert
          const autoLignesForCheck = d._auto_lignes || [];
          if (autoLignesForCheck.length > 0) {
            await client.query('DELETE FROM contrat_lignes WHERE contrat_id = $1', [contratId]);
            clearedContratsLignes.add(contratId);
          }
          contratsUpdated++;

        } else if (createdContratsMap.has(d.numero_contrat.toUpperCase())) {
          contratId = createdContratsMap.get(d.numero_contrat.toUpperCase());
          // For ligne_par_ligne: clear old lignes on first additional row if not yet cleared
          if (isLPL && d._existing_contrat_id && !clearedContratsLignes.has(contratId)) {
            const autoLignesForCheck = d._auto_lignes || [];
            if (autoLignesForCheck.length > 0) {
              await client.query('DELETE FROM contrat_lignes WHERE contrat_id = $1', [contratId]);
              clearedContratsLignes.add(contratId);
            }
          }
        } else {
          // --- CREATE new contrat ---
          const insertRes = await client.query(
            `INSERT INTO contrats (
              numero_contrat, type_contrat, type_facturation, client_id,
              periodicite, date_signature, date_installation, date_debut,
              date_echeance, date_prochaine_facture, prochaine_date_facturation,
              date_renouvellement,
              duree_contrat_mois, numero_dossier_financement, organisme_credit,
              montant_finance, loyer_ht, location_interne, statut,
              derniere_facture_date, derniere_facture_numero, derniere_facture_montant_ht,
              notes, ftc, ect
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
            ) RETURNING id`,
            [
              d.numero_contrat,
              d.type_contrat,
              d.type_facturation || 'Periodique',
              d.client_id,
              d.periodicite || 'Mensuel',
              d.date_signature || null,
              d.date_installation || null,
              d.date_debut,
              d.date_echeance || null,
              d.date_prochaine_facture || null,
              d.date_renouvellement || null,
              d.duree_contrat_mois || null,
              d.numero_dossier || null,
              d.organisme_credit || null,
              d.montant_finance || 0,
              d.loyer_ht || 0,
              d.location_interne || false,
              d.statut || 'Actif',
              d.derniere_facture_date || null,
              d.derniere_facture_numero || null,
              d.derniere_facture_montant || null,
              d.notes || null,
              d.ftc || 0,
              d.ect || 0,
            ]
          );
          contratId = insertRes.rows[0].id;
          contratsCreated++;
          createdContratsMap.set(d.numero_contrat.toUpperCase(), contratId);
        }

        // --- INSERT contrat_lignes ---
        const autoLignes = d._auto_lignes || [];
        if (autoLignes.length === 0) {
          contratsWithoutLines++;
        }

        let currentOrdre = 0;
        if (!isUpdate || isLPL) {
          const ordreRes = await client.query(
            'SELECT COALESCE(MAX(ordre), -1) as max_ordre FROM contrat_lignes WHERE contrat_id = $1',
            [contratId]
          );
          currentOrdre = ordreRes.rows[0].max_ordre + 1;
        }

        for (const ligne of autoLignes) {
          await client.query(
            `INSERT INTO contrat_lignes (
              contrat_id, ordre, categorie_ligne, reference, designation,
              quantite, prix_unitaire_ht, taux_tva, actif, inclus_abonnement
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              contratId,
              currentOrdre++,
              ligne.categorie_ligne,
              ligne.reference || null,
              ligne.designation,
              ligne.quantite,
              ligne.prix_unitaire_ht,
              ligne.taux_tva,
              ligne.actif !== false,
              ligne.inclus_abonnement !== false,
            ]
          );
          lignesCreated++;
        }

        // --- Machine — uniquement pour Copieur ---
        if (d.type_contrat === 'Copieur') {
          const numSerie = d.numero_serie || `IMPORT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO contrat_machines (
              contrat_id, numero_serie, modele, marque, designation,
              cout_copie_nb, cout_copie_couleur, cout_copie_t1, cout_copie_t2, cout_copie_t3,
              volume_forfait_nb, volume_forfait_couleur, volume_forfait_t1, volume_forfait_t2,
              service_connectic, service_collecteur, service_divers, service_autre
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
            [
              contratId, numSerie,
              d._machine_modele || null, d._machine_marque || null,
              d._machine_designation || d.designation_produit || null,
              d.cout_copie_nb || 0, d.cout_copie_couleur || 0,
              d.cout_copie_t1 || 0, d.cout_copie_t2 || 0, d.cout_copie_t3 || 0,
              d.volume_forfait_nb || 0, d.volume_forfait_couleur || 0,
              d.volume_forfait_t1 || 0, d.volume_forfait_t2 || 0,
              d.service_connectic || 0, d.service_collecteur || 0,
              d.service_divers || 0, d.service_autre || 0,
            ]
          );
          machinesCreated++;

          if (numSerie && !numSerie.startsWith('IMPORT-')) {
            const existingParc = await client.query(
              'SELECT id FROM parc_machines WHERE numero_serie = $1', [numSerie]
            );
            if (existingParc.rows.length === 0) {
              await client.query(
                `INSERT INTO parc_machines (
                  numero_serie, designation, marque, modele, categorie,
                  client_id, contrat_id, numero_contrat, date_installation, statut
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [
                  numSerie,
                  d._machine_designation || d.designation_produit || 'Machine importée',
                  d._machine_marque || null, d._machine_modele || null, 'Copieur',
                  d.client_id, contratId, d.numero_contrat,
                  d.date_installation || null, 'En service',
                ]
              );
            }
          }
        }

        // --- Save custom field values ---
        for (const [key, val] of Object.entries(d)) {
          if (key.startsWith('custom_') && val !== null && val !== undefined) {
            const cle = key.replace('custom_', '');
            const configId = customConfigMap.get(cle);
            if (configId) {
              await client.query(
                `INSERT INTO champs_personnalises_valeurs (config_id, entite_id, valeur)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (config_id, entite_id) DO UPDATE SET valeur = $3, updated_at = NOW()`,
                [configId, contratId, String(val)]
              );
            }
          }
        }
        await client.query('RELEASE SAVEPOINT row_sp');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp');
        importErrors.push({ row_number: row.row_number, error: err.message });
      }
    }

    // Log the import
    await client.query(
      `INSERT INTO import_logs (entity_type, filename, total_rows, success_count, error_count, skipped_count, mapping_used, options_used, errors_detail, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        'contrats',
        'import',
        validationResult.total,
        contratsCreated + contratsUpdated,
        validationResult.errors + importErrors.length,
        validationResult.skipped,
        JSON.stringify(mappings),
        JSON.stringify({ ...options, typeContrat }),
        importErrors.length > 0 ? JSON.stringify(importErrors) : null,
        user_id || null,
      ]
    );

    await client.query('COMMIT');
    await fs.unlink(tempPath).catch(() => {});

    return {
      total: validationResult.total,
      contrats_created: contratsCreated,
      contrats_updated: contratsUpdated,
      machines_created: machinesCreated,
      lignes_created: lignesCreated,
      contrats_without_lines: contratsWithoutLines,
      errors: importErrors.length,
      skipped: validationResult.skipped,
      duplicates_in_file: validationResult.duplicates_in_file,
      missing_clients: validationResult.missing_clients,
      format: validationResult.format,
      type_contrat: typeContrat,
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
// SAVED MAPPINGS — filtered by type_contrat
// ═══════════════════════════════════════════════════════════════════════════════

export async function listSavedMappings(typeContrat = null) {
  let sql = "SELECT id, name, mapping, type_contrat, created_at, updated_at FROM import_mappings_saved WHERE entity_type = 'contrats'";
  const params = [];
  if (typeContrat) {
    sql += ' AND (type_contrat = $1 OR type_contrat IS NULL)';
    params.push(typeContrat);
  }
  sql += ' ORDER BY updated_at DESC';
  const result = await query(sql, params);
  return result.rows;
}

export async function saveMappingConfig({ name, mapping, user_id, typeContrat = null }) {
  const result = await query(
    `INSERT INTO import_mappings_saved (entity_type, name, mapping, type_contrat, created_by)
     VALUES ('contrats', $1, $2, $3, $4)
     ON CONFLICT (entity_type, name, type_contrat) DO UPDATE SET mapping = $2, updated_at = NOW()
     RETURNING id, name, mapping, type_contrat, created_at, updated_at`,
    [name, JSON.stringify(mapping), typeContrat, user_id || null]
  );
  return result.rows[0];
}

export async function deleteSavedMapping(id) {
  const result = await query(
    "DELETE FROM import_mappings_saved WHERE id = $1 AND entity_type = 'contrats' RETURNING id",
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Mapping non trouvé');
  return { deleted: true };
}
