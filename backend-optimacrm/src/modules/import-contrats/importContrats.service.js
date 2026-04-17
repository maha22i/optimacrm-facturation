import { pool, query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { CONTRATS_FIELD_GROUPS, getAllContratFields } from '../../config/contratsFieldSynonyms.js';
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
  let s = String(val).trim().replace(/€/g, '').trim();
  if (s.includes(',')) {
    s = s.replace(/\s/g, '').replace(',', '.');
  } else {
    s = s.replace(/\s/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function parseDecimal6(val) {
  if (val == null || val === '') return null;
  let s = String(val).trim().replace(/€/g, '').trim();
  if (s.includes(',')) {
    s = s.replace(/\s/g, '').replace(',', '.');
  } else {
    s = s.replace(/\s/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 1000000) / 1000000;
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
  // Excel serial date
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
  'suspendu': 'Suspendu',
  'résilié': 'Résilié',
  'resilie': 'Résilié',
  'échu': 'Échu',
  'echu': 'Échu',
};

const PERIODICITE_MAP = {
  't': 'Trimestriel',
  'm': 'Mensuel',
  'b': 'Bimestriel',
  's': 'Semestriel',
  'a': 'Annuel',
};

const KNOWN_BRANDS = [
  'canon', 'ricoh', 'xerox', 'konica', 'minolta', 'konica minolta',
  'hp', 'brother', 'sharp', 'epson', 'kyocera', 'toshiba', 'lexmark',
  'samsung', 'oki', 'dell', 'panasonic', 'olivetti',
];

function mapStatut(val) {
  if (!val) return 'Actif';
  const key = normalize(val);
  return STATUT_MAP[key] || 'Actif';
}

function mapPeriodicite(val) {
  if (!val) return 'Trimestriel';
  const key = String(val).trim().toLowerCase();
  return PERIODICITE_MAP[key] || 'Trimestriel';
}

function mapLocationInterne(val) {
  if (!val) return false;
  const key = normalize(val);
  return key === 'location interne';
}

function extractBrandModel(designation) {
  if (!designation) return { marque: null, modele: null, designation_clean: null };

  const firstLine = designation.split(/[\r\n]/)[0].trim();
  if (!firstLine) return { marque: null, modele: null, designation_clean: designation };

  const words = firstLine.split(/\s+/);
  const firstWord = words[0]?.toLowerCase();

  // Check 2-word brands first (Konica Minolta)
  if (words.length >= 2) {
    const twoWords = `${words[0]} ${words[1]}`.toLowerCase();
    if (KNOWN_BRANDS.includes(twoWords)) {
      return {
        marque: `${words[0]} ${words[1]}`.toUpperCase(),
        modele: words.slice(2).join(' ') || null,
        designation_clean: firstLine,
      };
    }
  }

  if (KNOWN_BRANDS.includes(firstWord)) {
    return {
      marque: words[0].toUpperCase(),
      modele: words.slice(1).join(' ') || null,
      designation_clean: firstLine,
    };
  }

  return { marque: null, modele: null, designation_clean: firstLine };
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
// PARSE
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

  // Normalize headers (may contain \n)
  const headers = rows[0].map(h => String(h ?? '').replace(/\r?\n/g, ' ').trim());
  const dataRows = rows.slice(1).filter(row =>
    row.some(cell => cell != null && String(cell).trim() !== '')
  );

  const fileId = `temp_contrats_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempPath = path.join(TEMP_DIR, `${fileId}.json`);
  await fs.writeFile(tempPath, JSON.stringify({ headers, rows: dataRows }));

  const preview = dataRows.slice(0, 5).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  const standardFields = getAllContratFields();
  const customFieldsGrouped = await loadCustomFields();

  const allTargetFields = [...standardFields];
  for (const [, fields] of customFieldsGrouped) {
    allTargetFields.push(...fields);
  }

  const usedFields = new Set();
  const mappings = headers.map(header => {
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
// VALIDATE
// ═══════════════════════════════════════════════════════════════════════════════

function parseFieldValue(field, rawVal, customFieldsFlat) {
  const val = rawVal;
  if (val == null || String(val).trim() === '') return null;

  const decimal6Fields = [
    'cout_copie_nb', 'cout_copie_couleur',
    'cout_copie_t1', 'cout_copie_t2', 'cout_copie_t3',
  ];
  const decimalFields = [
    'montant_finance', 'loyer_ht',
    'service_connectic', 'service_collecteur', 'service_divers', 'service_autre',
    'derniere_facture_montant',
  ];
  const integerFields = [
    'duree_contrat_mois',
    'volume_forfait_nb', 'volume_forfait_couleur',
    'volume_forfait_t1', 'volume_forfait_t2',
  ];
  const dateFields = [
    'date_signature', 'date_installation', 'date_prochaine_facture',
    'date_renouvellement', 'date_echeance', 'derniere_facture_date',
  ];

  if (decimal6Fields.includes(field)) return parseDecimal6(val);
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

function generateContratLignes(machine) {
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

  const connectic = parseFloat(machine.service_connectic) || 0;
  if (connectic > 0) {
    lignes.push({
      ordre: ordre++,
      categorie_ligne: 'Service Connectic',
      reference: 'CNTC',
      designation: 'Service Pass',
      quantite: 1,
      prix_unitaire_ht: connectic,
      taux_tva: 20,
    });
  }

  const collecteur = parseFloat(machine.service_collecteur) || 0;
  if (collecteur > 0) {
    lignes.push({
      ordre: ordre++,
      categorie_ligne: 'PLC',
      reference: 'AUT',
      designation: 'Service Collecteur',
      quantite: 1,
      prix_unitaire_ht: collecteur,
      taux_tva: 20,
    });
  }

  const divers = parseFloat(machine.service_divers) || 0;
  if (divers > 0) {
    lignes.push({
      ordre: ordre++,
      categorie_ligne: 'PLC',
      reference: 'AUT',
      designation: 'Service Divers',
      quantite: 1,
      prix_unitaire_ht: divers,
      taux_tva: 20,
    });
  }

  const autre = parseFloat(machine.service_autre) || 0;
  if (autre > 0) {
    lignes.push({
      ordre: ordre++,
      categorie_ligne: 'PLC',
      reference: 'AUT',
      designation: 'Service Autre',
      quantite: 1,
      prix_unitaire_ht: autre,
      taux_tva: 20,
    });
  }

  return lignes;
}

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
  const { skip_duplicates = false, update_existing = false } = options;

  const headerToField = {};
  for (const [sourceHeader, targetField] of Object.entries(mappings)) {
    if (targetField) headerToField[sourceHeader] = targetField;
  }

  // Load custom fields
  const customFieldsGrouped = await loadCustomFields();
  const customFieldsFlat = new Map();
  for (const [, fields] of customFieldsGrouped) {
    for (const f of fields) customFieldsFlat.set(f.key, f);
  }

  // Load clients from DB
  const clientsRes = await query(
    'SELECT id, numero_client, raison_sociale FROM clients'
  );
  const clientMap = new Map();
  for (const c of clientsRes.rows) {
    if (c.numero_client) clientMap.set(c.numero_client.trim().toUpperCase(), c);
  }

  // Load existing contrats to detect duplicates
  const existingContratsRes = await query(
    'SELECT id, numero_contrat FROM contrats'
  );
  const existingContrats = new Map(
    existingContratsRes.rows.map(r => [r.numero_contrat.trim().toUpperCase(), r.id])
  );

  // Load brands from DB for brand extraction
  const marquesRes = await query('SELECT LOWER(nom) as nom_lower FROM marques WHERE actif = true');
  const dbBrands = marquesRes.rows.map(r => r.nom_lower);
  const allBrands = [...new Set([...KNOWN_BRANDS, ...dbBrands])];

  const validatedRows = [];
  let validCount = 0;
  let errorCount = 0;
  let clientErrors = 0;
  let duplicateContrats = 0;
  let totalMachines = 0;
  let totalLignes = 0;
  const missingClients = new Set();
  const seenContrats = new Map();

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

    // Parse all field values
    const parsed = {};
    for (const [field, rawVal] of Object.entries(data)) {
      parsed[field] = parseFieldValue(field, rawVal, customFieldsFlat);
    }

    // --- Validate required: numero_contrat ---
    const numContrat = cleanText(data.numero_contrat);
    if (!numContrat) {
      errors.push('Le numéro de contrat est obligatoire');
    }
    parsed.numero_contrat = numContrat;

    // --- Validate required: type_contrat ---
    const typeContrat = cleanText(data.type_contrat);
    if (typeContrat) {
      const validTypes = ['Copieur', 'Telephonie', 'Informatique', 'Securite'];
      const normalized = validTypes.find(t => normalize(t) === normalize(typeContrat));
      if (normalized) {
        parsed.type_contrat = normalized;
      } else {
        parsed.type_contrat = 'Copieur';
        warnings.push(`Type contrat "${typeContrat}" inconnu, défaut: Copieur`);
      }
    } else {
      parsed.type_contrat = 'Copieur';
    }

    // --- Client resolution ---
    const codeClient = cleanText(data.code_client);
    if (codeClient) {
      const client = clientMap.get(codeClient.toUpperCase());
      if (client) {
        parsed.client_id = client.id;
        parsed.client_raison_sociale = client.raison_sociale;

        // Cross-check name
        const nomClient = cleanText(data.nom_client);
        if (nomClient && client.raison_sociale) {
          if (normalize(nomClient) !== normalize(client.raison_sociale)) {
            warnings.push(
              `Le nom "${nomClient}" ne correspond pas au client ${codeClient} en base ("${client.raison_sociale}")`
            );
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

    // --- Statut, periodicite, location ---
    parsed.statut = mapStatut(data.statut);
    parsed.periodicite = mapPeriodicite(data.periodicite);
    parsed.location_interne = mapLocationInterne(data.location_interne);

    // --- Type facturation ---
    if (data.type_facturation) {
      const tf = cleanText(data.type_facturation);
      parsed.type_facturation = ['Unique', 'Periodique'].find(
        t => normalize(t) === normalize(tf)
      ) || 'Periodique';
    } else {
      parsed.type_facturation = 'Periodique';
    }

    // --- date_debut computation ---
    parsed.date_debut = parsed.date_signature || parsed.date_installation || new Date().toISOString().split('T')[0];

    // --- Brand/model extraction ---
    const designation = cleanText(data.designation_produit);
    if (designation) {
      const { marque, modele, designation_clean } = extractBrandModel(designation);
      parsed._machine_marque = marque;
      parsed._machine_modele = modele;
      parsed._machine_designation = designation_clean;
    }

    // --- Duplicate check ---
    if (numContrat) {
      const upperNum = numContrat.toUpperCase();
      if (existingContrats.has(upperNum)) {
        duplicateContrats++;
        if (skip_duplicates) {
          warnings.push(`Contrat "${numContrat}" déjà existant en base — sera ignoré`);
          parsed._skip_duplicate = true;
        } else if (update_existing) {
          parsed._existing_contrat_id = existingContrats.get(upperNum);
          warnings.push(`Contrat "${numContrat}" existant — machine ajoutée au contrat`);
        } else {
          parsed._existing_contrat_id = existingContrats.get(upperNum);
          warnings.push(`Contrat "${numContrat}" existant — machine ajoutée au contrat`);
        }
      } else if (seenContrats.has(upperNum)) {
        parsed._existing_in_batch_row = seenContrats.get(upperNum);
        duplicateContrats++;
      } else {
        seenContrats.set(upperNum, rowNumber);
      }
    }

    // --- Compute auto-generated lines ---
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
    const autoLignes = generateContratLignes(machineParams);
    parsed._auto_lignes_count = autoLignes.length;
    totalLignes += autoLignes.length;

    if (parsed.numero_serie || designation) {
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
    skipped: rows.length - validCount - errorCount,
    missing_clients: [...missingClients],
    client_errors: clientErrors,
    total_machines: totalMachines,
    total_lignes_auto: totalLignes,
    rows: validatedRows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE
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

  const client = await pool.connect();
  let contratsCreated = 0;
  let machinesCreated = 0;
  let lignesCreated = 0;
  const importErrors = [];
  // Track contrats created within this execution for multi-machine grouping
  const createdContratsMap = new Map();

  try {
    await client.query('BEGIN');

    // Load custom fields config for saving values
    const customConfigRes = await client.query(
      "SELECT id, cle FROM champs_personnalises_config WHERE entite = 'CONTRAT' AND actif = true"
    );
    const customConfigMap = new Map(customConfigRes.rows.map(r => [r.cle, r.id]));

    for (const row of validRows) {
      try {
        const d = row.data;
        let contratId;

        // Check if contrat already exists in DB
        if (d._existing_contrat_id) {
          contratId = d._existing_contrat_id;
        }
        // Check if contrat was created earlier in this batch
        else if (d._existing_in_batch_row && createdContratsMap.has(d.numero_contrat.toUpperCase())) {
          contratId = createdContratsMap.get(d.numero_contrat.toUpperCase());
        }
        // Create new contrat
        else {
          const insertRes = await client.query(
            `INSERT INTO contrats (
              numero_contrat, type_contrat, type_facturation, client_id,
              periodicite, date_signature, date_installation, date_debut,
              date_echeance, date_prochaine_facture, date_renouvellement,
              duree_contrat_mois, numero_dossier_financement, organisme_credit,
              montant_finance, loyer_ht, location_interne, statut,
              derniere_facture_date, derniere_facture_numero, derniere_facture_montant_ht,
              notes
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
            ) RETURNING id`,
            [
              d.numero_contrat,
              d.type_contrat,
              d.type_facturation || 'Periodique',
              d.client_id,
              d.periodicite || 'Trimestriel',
              d.date_signature || null,
              d.date_installation || null,
              d.date_debut,
              d.date_echeance || null,
              d.date_prochaine_facture || null,
              d.date_renouvellement || null,
              d.duree_contrat_mois || 63,
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
            ]
          );
          contratId = insertRes.rows[0].id;
          contratsCreated++;
          createdContratsMap.set(d.numero_contrat.toUpperCase(), contratId);
        }

        // Create machine
        const numSerie = d.numero_serie || `IMPORT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const machineRes = await client.query(
          `INSERT INTO contrat_machines (
            contrat_id, numero_serie, modele, marque, designation,
            cout_copie_nb, cout_copie_couleur, cout_copie_t1, cout_copie_t2, cout_copie_t3,
            volume_forfait_nb, volume_forfait_couleur, volume_forfait_t1, volume_forfait_t2,
            service_connectic, service_collecteur, service_divers, service_autre
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
          [
            contratId,
            numSerie,
            d._machine_modele || null,
            d._machine_marque || null,
            d._machine_designation || d.designation_produit || null,
            d.cout_copie_nb || 0,
            d.cout_copie_couleur || 0,
            d.cout_copie_t1 || 0,
            d.cout_copie_t2 || 0,
            d.cout_copie_t3 || 0,
            d.volume_forfait_nb || 0,
            d.volume_forfait_couleur || 0,
            d.volume_forfait_t1 || 0,
            d.volume_forfait_t2 || 0,
            d.service_connectic || 0,
            d.service_collecteur || 0,
            d.service_divers || 0,
            d.service_autre || 0,
          ]
        );
        machinesCreated++;

        // Sync to parc_machines if real serial number
        if (numSerie && !numSerie.startsWith('IMPORT-')) {
          const existingParc = await client.query(
            'SELECT id FROM parc_machines WHERE numero_serie = $1',
            [numSerie]
          );
          if (existingParc.rows.length === 0) {
            await client.query(
              `INSERT INTO parc_machines (
                numero_serie, designation, marque, modele, categorie,
                client_id, contrat_id, numero_contrat,
                date_installation, statut
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [
                numSerie,
                d._machine_designation || d.designation_produit || 'Machine importée',
                d._machine_marque || null,
                d._machine_modele || null,
                'Copieur',
                d.client_id,
                contratId,
                d.numero_contrat,
                d.date_installation || null,
                'En service',
              ]
            );
          }
        }

        // Auto-generate contrat lines
        const machineParams = {
          cout_copie_nb: d.cout_copie_nb || 0,
          cout_copie_couleur: d.cout_copie_couleur || 0,
          volume_forfait_nb: d.volume_forfait_nb || 0,
          volume_forfait_couleur: d.volume_forfait_couleur || 0,
          service_connectic: d.service_connectic || 0,
          service_collecteur: d.service_collecteur || 0,
          service_divers: d.service_divers || 0,
          service_autre: d.service_autre || 0,
        };
        const autoLignes = generateContratLignes(machineParams);

        // Get current max ordre for this contrat
        const ordreRes = await client.query(
          'SELECT COALESCE(MAX(ordre), -1) as max_ordre FROM contrat_lignes WHERE contrat_id = $1',
          [contratId]
        );
        let currentOrdre = ordreRes.rows[0].max_ordre + 1;

        for (const ligne of autoLignes) {
          await client.query(
            `INSERT INTO contrat_lignes (
              contrat_id, ordre, categorie_ligne, reference, designation,
              quantite, prix_unitaire_ht, taux_tva
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              contratId,
              currentOrdre++,
              ligne.categorie_ligne,
              ligne.reference,
              ligne.designation,
              ligne.quantite,
              ligne.prix_unitaire_ht,
              ligne.taux_tva,
            ]
          );
          lignesCreated++;
        }

        // Save custom field values for this contrat
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
      } catch (err) {
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
        contratsCreated + machinesCreated,
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
      contrats_created: contratsCreated,
      machines_created: machinesCreated,
      lignes_created: lignesCreated,
      errors: importErrors.length,
      skipped: validationResult.skipped,
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
// SAVED MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listSavedMappings() {
  const result = await query(
    "SELECT id, name, mapping, created_at, updated_at FROM import_mappings_saved WHERE entity_type = 'contrats' ORDER BY updated_at DESC"
  );
  return result.rows;
}

export async function saveMappingConfig({ name, mapping, user_id }) {
  const result = await query(
    `INSERT INTO import_mappings_saved (entity_type, name, mapping, created_by)
     VALUES ('contrats', $1, $2, $3)
     ON CONFLICT (entity_type, name) DO UPDATE SET mapping = $2, updated_at = NOW()
     RETURNING id, name, mapping, created_at, updated_at`,
    [name, JSON.stringify(mapping), user_id || null]
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
