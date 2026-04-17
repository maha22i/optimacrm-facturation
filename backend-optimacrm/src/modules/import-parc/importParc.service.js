import { pool, query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { PARC_FIELD_GROUPS, RELEVES_FIELD_GROUPS, getAllParcFields, getAllRelevesFields } from '../../config/parcFieldSynonyms.js';
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

function parseInteger(val) {
  if (val == null || val === '') return null;
  const s = String(val).replace(/\s/g, '').replace(',', '.');
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const dmySlash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2].padStart(2, '0')}-${dmySlash[1].padStart(2, '0')}`;
  const ymd = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
}

function shouldAutoIgnoreColumn(header) {
  const h = normalize(header);
  return ['', 'vide', 'empty', 'unused', 'ignore'].includes(h);
}

function suggestMapping(header, fieldGroups) {
  const h = normalize(header);
  if (!h || shouldAutoIgnoreColumn(header)) return { field: null, confidence: 0, group: null };

  let bestField = null;
  let bestScore = 0;
  let bestGroup = null;

  for (const group of fieldGroups) {
    for (const field of group.fields) {
      if (normalize(field.key) === h || normalize(field.label) === h) {
        return { field: field.key, confidence: 1.0, group: group.group };
      }
      for (const syn of (field.synonyms || [])) {
        const ns = normalize(syn);
        if (ns === h) return { field: field.key, confidence: 0.95, group: group.group };
        if (h.includes(ns) || ns.includes(h)) {
          const score = 0.7 + (0.2 * Math.min(ns.length, h.length) / Math.max(ns.length, h.length));
          if (score > bestScore) { bestField = field.key; bestScore = score; bestGroup = group.group; }
        }
      }
      const dist = levenshtein(h, normalize(field.label));
      const maxLen = Math.max(h.length, normalize(field.label).length);
      if (maxLen > 0) {
        const score = 1 - dist / maxLen;
        if (score > 0.6 && score > bestScore) { bestField = field.key; bestScore = score; bestGroup = group.group; }
      }
    }
  }

  return { field: bestField, confidence: bestScore, group: bestGroup };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE
// ═══════════════════════════════════════════════════════════════════════════════

async function parseFileBuffer(buffer, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  let rows = [];
  let headers = [];

  if (ext === '.csv' || ext === '.txt') {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) throw ApiError.badRequest('Fichier vide');
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    headers = lines[0].split(sep).map(h => h.replace(/^["']|["']$/g, '').trim());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(sep).map(v => v.replace(/^["']|["']$/g, '').trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
  } else if (ext === '.xlsx' || ext === '.xls') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length === 0) throw ApiError.badRequest('Fichier vide');
    headers = data[0].map(h => String(h).trim());
    for (let i = 1; i < data.length; i++) {
      const row = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        const val = data[i][idx] != null ? String(data[i][idx]).trim() : '';
        row[h] = val;
        if (val) hasData = true;
      });
      if (hasData) rows.push(row);
    }
  } else {
    throw ApiError.badRequest('Format de fichier non supporté. Utilisez CSV ou Excel.');
  }

  return { headers, rows };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT MACHINES
// ═══════════════════════════════════════════════════════════════════════════════

export async function parseMachines(fileBuffer, originalname) {
  const { headers, rows } = await parseFileBuffer(fileBuffer, originalname);
  const fileId = `parc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.writeFile(path.join(TEMP_DIR, `${fileId}.json`), JSON.stringify({ headers, rows }));

  const mappings = headers.map(h => {
    const suggestion = suggestMapping(h, PARC_FIELD_GROUPS);
    return {
      source_header: h,
      suggested_field: suggestion.field,
      confidence: suggestion.confidence,
      field_group: suggestion.group,
      is_custom_field: false,
    };
  });

  return {
    file_id: fileId,
    headers,
    preview: rows.slice(0, 5),
    total_rows: rows.length,
    mappings,
    available_fields: { standard: PARC_FIELD_GROUPS, custom: [] },
  };
}

export async function validateMachines(fileId, mappings, options = {}) {
  const filePath = path.join(TEMP_DIR, `${fileId}.json`);
  let fileData;
  try { fileData = JSON.parse(await fs.readFile(filePath, 'utf-8')); }
  catch { throw ApiError.badRequest('Fichier expiré ou introuvable. Veuillez re-uploader.'); }

  const { rows } = fileData;
  const { skip_duplicates = true, update_existing = false } = options;

  const fieldMap = {};
  for (const [source, target] of Object.entries(mappings)) {
    if (target && target !== '__ignore__') fieldMap[target] = source;
  }

  const existingSeries = new Map();
  const seriesResult = await query('SELECT id, numero_serie FROM parc_machines');
  seriesResult.rows.forEach(r => existingSeries.set(r.numero_serie?.toUpperCase(), r.id));

  const validatedRows = [];
  let valid = 0, errors = 0, duplicates = 0, skipped = 0;
  const seenSeries = new Set();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped = {};
    for (const [field, header] of Object.entries(fieldMap)) {
      mapped[field] = raw[header] || '';
    }

    const rowErrors = [];
    const rowWarnings = [];

    const ns = (mapped.numero_serie || '').trim();
    if (!ns) { rowErrors.push('Numéro de série obligatoire'); }
    else {
      if (seenSeries.has(ns.toUpperCase())) rowErrors.push(`Doublon dans le fichier : "${ns}"`);
      else if (existingSeries.has(ns.toUpperCase())) {
        duplicates++;
        if (update_existing) {
          mapped._existing_id = existingSeries.get(ns.toUpperCase());
          rowWarnings.push(`Machine existante : "${ns}" — sera mise à jour`);
        } else if (skip_duplicates) {
          mapped._skip = true;
          rowWarnings.push(`Machine existante : "${ns}" — sera ignorée`);
        } else {
          rowErrors.push(`Machine existante : "${ns}"`);
        }
      }
      seenSeries.add(ns.toUpperCase());
    }

    if (!(mapped.designation || '').trim()) rowErrors.push('Désignation obligatoire');

    if (mapped.categorie) {
      const cat = mapped.categorie.trim();
      if (!['Copieur', 'Téléphonie', 'Informatique'].includes(cat)) {
        const catLower = cat.toLowerCase();
        if (catLower.includes('copieur') || catLower.includes('copie')) mapped.categorie = 'Copieur';
        else if (catLower.includes('tel') || catLower.includes('téléph')) mapped.categorie = 'Téléphonie';
        else if (catLower.includes('info') || catLower.includes('pc') || catLower.includes('serv')) mapped.categorie = 'Informatique';
        else rowWarnings.push(`Catégorie inconnue "${cat}", défaut = Copieur`);
      }
    }

    if (mapped.statut) {
      const validStatuts = ['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'];
      if (!validStatuts.includes(mapped.statut.trim())) {
        rowWarnings.push(`Statut inconnu "${mapped.statut}", défaut = En service`);
      }
    }

    let status = 'valid';
    if (rowErrors.length > 0) { status = 'error'; errors++; }
    else if (mapped._skip) { status = 'skipped'; skipped++; }
    else { valid++; }

    validatedRows.push({
      row_number: i + 1,
      status,
      data: mapped,
      errors: rowErrors,
      warnings: rowWarnings,
    });
  }

  return {
    file_id: fileId,
    total: rows.length,
    valid,
    errors,
    duplicates,
    skipped,
    rows: validatedRows,
  };
}

export async function executeMachines(fileId, mappings, options = {}) {
  const validation = await validateMachines(fileId, mappings, options);
  const validRows = validation.rows.filter(r => r.status === 'valid');

  let imported = 0, updated = 0, errorCount = 0;
  const errorDetails = [];

  const clientCache = {};
  async function findClientId(code, name) {
    if (!code && !name) return null;
    const key = code || name;
    if (clientCache[key] !== undefined) return clientCache[key];
    let result;
    if (code) result = await query('SELECT id FROM clients WHERE numero_client = $1', [code]);
    if ((!result || result.rows.length === 0) && name)
      result = await query('SELECT id FROM clients WHERE raison_sociale ILIKE $1 LIMIT 1', [`%${name}%`]);
    const id = result?.rows[0]?.id || null;
    clientCache[key] = id;
    return id;
  }

  for (const row of validRows) {
    try {
      const d = row.data;
      const clientId = await findClientId(d.code_client, d.nom_client);
      const categorie = d.categorie?.trim() || 'Copieur';
      const statut = d.statut?.trim() || 'En service';
      const validStatuts = ['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'];
      const safeCat = ['Copieur', 'Téléphonie', 'Informatique'].includes(categorie) ? categorie : 'Copieur';
      const safeStatut = validStatuts.includes(statut) ? statut : 'En service';

      if (d._existing_id) {
        await query(
          `UPDATE parc_machines SET
            designation = COALESCE($2, designation), marque = COALESCE($3, marque),
            modele = COALESCE($4, modele), categorie = $5,
            client_id = COALESCE($6, client_id), site_installation = COALESCE($7, site_installation),
            numero_contrat = COALESCE($8, numero_contrat), statut = $9, updated_at = NOW()
          WHERE id = $1`,
          [d._existing_id, d.designation?.trim(), d.marque?.trim() || null, d.modele?.trim() || null,
           safeCat, clientId, d.site_installation?.trim() || null, d.numero_contrat?.trim() || null, safeStatut],
        );
        updated++;
      } else {
        await query(
          `INSERT INTO parc_machines (
            numero_serie, matricule, designation, marque, modele, categorie,
            reference_produit, client_id, site_installation, numero_contrat,
            date_installation, date_fin_garantie, statut, notes
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            d.numero_serie?.trim(), d.matricule?.trim() || null, d.designation?.trim(),
            d.marque?.trim() || null, d.modele?.trim() || null, safeCat,
            d.reference_produit?.trim() || null, clientId,
            d.site_installation?.trim() || null, d.numero_contrat?.trim() || null,
            parseDate(d.date_installation), parseDate(d.date_fin_garantie), safeStatut,
            d.notes?.trim() || null,
          ],
        );
        imported++;
      }
    } catch (err) {
      errorCount++;
      errorDetails.push({ row_number: row.row_number, error: err.message });
    }
  }

  try { await fs.unlink(path.join(TEMP_DIR, `${fileId}.json`)); } catch {}

  return {
    total: validation.total,
    imported,
    updated,
    errors: errorCount,
    skipped: validation.skipped,
    error_details: errorDetails,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT RELEVÉS
// ═══════════════════════════════════════════════════════════════════════════════

export async function parseReleves(fileBuffer, originalname) {
  const { headers, rows } = await parseFileBuffer(fileBuffer, originalname);
  const fileId = `releves_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.writeFile(path.join(TEMP_DIR, `${fileId}.json`), JSON.stringify({ headers, rows }));

  const mappings = headers.map(h => {
    const suggestion = suggestMapping(h, RELEVES_FIELD_GROUPS);
    return {
      source_header: h,
      suggested_field: suggestion.field,
      confidence: suggestion.confidence,
      field_group: suggestion.group,
      is_custom_field: false,
    };
  });

  return {
    file_id: fileId,
    headers,
    preview: rows.slice(0, 5),
    total_rows: rows.length,
    mappings,
    available_fields: { standard: RELEVES_FIELD_GROUPS, custom: [] },
  };
}

export async function validateReleves(fileId, mappings) {
  const filePath = path.join(TEMP_DIR, `${fileId}.json`);
  let fileData;
  try { fileData = JSON.parse(await fs.readFile(filePath, 'utf-8')); }
  catch { throw ApiError.badRequest('Fichier expiré ou introuvable. Veuillez re-uploader.'); }

  const { rows } = fileData;
  const fieldMap = {};
  for (const [source, target] of Object.entries(mappings)) {
    if (target && target !== '__ignore__') fieldMap[target] = source;
  }

  const machineCache = {};
  const machineResult = await query('SELECT id, numero_serie, dernier_compteur_nb, dernier_compteur_couleur FROM parc_machines');
  machineResult.rows.forEach(r => { machineCache[r.numero_serie?.toUpperCase()] = r; });

  const validatedRows = [];
  let valid = 0, errors = 0, skipped = 0;
  let machineNotFound = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped = {};
    for (const [field, header] of Object.entries(fieldMap)) {
      mapped[field] = raw[header] || '';
    }

    const rowErrors = [];
    const rowWarnings = [];

    const ns = (mapped.numero_serie || '').trim();
    if (!ns) {
      rowErrors.push('Numéro de série obligatoire');
    } else {
      const machine = machineCache[ns.toUpperCase()];
      if (!machine) {
        rowErrors.push(`Machine inconnue : "${ns}"`);
        machineNotFound++;
      } else {
        mapped._machine_id = machine.id;
        const compteurNb = parseInteger(mapped.compteur_nb) || 0;
        const compteurCouleur = parseInteger(mapped.compteur_couleur) || 0;

        if (compteurNb < (machine.dernier_compteur_nb || 0)) {
          rowWarnings.push(`Compteur N/B (${compteurNb}) inférieur au dernier relevé (${machine.dernier_compteur_nb})`);
        }
        if (compteurCouleur < (machine.dernier_compteur_couleur || 0)) {
          rowWarnings.push(`Compteur Couleur (${compteurCouleur}) inférieur au dernier relevé (${machine.dernier_compteur_couleur})`);
        }
      }
    }

    let status = 'valid';
    if (rowErrors.length > 0) { status = 'error'; errors++; }
    else { valid++; }

    validatedRows.push({
      row_number: i + 1,
      status,
      data: mapped,
      errors: rowErrors,
      warnings: rowWarnings,
    });
  }

  return {
    file_id: fileId,
    total: rows.length,
    valid,
    errors,
    skipped,
    machine_not_found: machineNotFound,
    rows: validatedRows,
  };
}

export async function executeReleves(fileId, mappings) {
  const validation = await validateReleves(fileId, mappings);
  const validRows = validation.rows.filter(r => r.status === 'valid');

  let imported = 0, errorCount = 0;
  const errorDetails = [];

  const machineCache = {};
  const machineResult = await query('SELECT id, numero_serie, dernier_compteur_nb, dernier_compteur_couleur FROM parc_machines');
  machineResult.rows.forEach(r => { machineCache[r.numero_serie?.toUpperCase()] = r; });

  for (const row of validRows) {
    const d = row.data;
    const ns = (d.numero_serie || '').trim().toUpperCase();
    const machine = machineCache[ns];
    if (!machine) { errorCount++; errorDetails.push({ row_number: row.row_number, error: `Machine inconnue : ${ns}` }); continue; }

    try {
      const compteur_nb = parseInteger(d.compteur_nb) || 0;
      const compteur_couleur = parseInteger(d.compteur_couleur) || 0;
      const volume_nb = Math.max(0, compteur_nb - (machine.dernier_compteur_nb || 0));
      const volume_couleur = Math.max(0, compteur_couleur - (machine.dernier_compteur_couleur || 0));

      const dateReleve = parseDate(d.date_releve) || new Date().toISOString().split('T')[0];
      const dateDebut = parseDate(d.date_debut_periode) || null;

      await query(
        `INSERT INTO releves_compteurs (
          machine_id, date_releve, date_debut_periode, date_fin_periode,
          compteur_nb, compteur_couleur, volume_nb, volume_couleur,
          source, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Import',$9)`,
        [machine.id, dateReleve, dateDebut, dateReleve, compteur_nb, compteur_couleur, volume_nb, volume_couleur, d.notes || null],
      );

      if (compteur_nb >= (machine.dernier_compteur_nb || 0)) {
        await query(
          `UPDATE parc_machines SET dernier_compteur_nb = $1, dernier_compteur_couleur = $2, date_dernier_releve = $3, updated_at = NOW() WHERE id = $4`,
          [compteur_nb, compteur_couleur, dateReleve, machine.id],
        );
        machine.dernier_compteur_nb = compteur_nb;
        machine.dernier_compteur_couleur = compteur_couleur;
      }

      imported++;
    } catch (err) {
      errorCount++;
      errorDetails.push({ row_number: row.row_number, error: err.message });
    }
  }

  try { await fs.unlink(path.join(TEMP_DIR, `${fileId}.json`)); } catch {}

  return {
    total: validation.total,
    imported,
    errors: errorCount,
    skipped: validation.skipped,
    error_details: errorDetails,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAPPINGS SAUVEGARDÉS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getSavedMappings(entityType) {
  const result = await query(
    `SELECT * FROM import_mappings_saved WHERE entity_type = $1 ORDER BY updated_at DESC`,
    [entityType],
  );
  return result.rows;
}

export async function saveMappingTemplate(entityType, name, mapping) {
  const existing = await query(
    'SELECT id FROM import_mappings_saved WHERE entity_type = $1 AND name = $2',
    [entityType, name],
  );
  if (existing.rows.length > 0) {
    const result = await query(
      `UPDATE import_mappings_saved SET mapping = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(mapping), existing.rows[0].id],
    );
    return result.rows[0];
  }
  const result = await query(
    `INSERT INTO import_mappings_saved (entity_type, name, mapping) VALUES ($1, $2, $3) RETURNING *`,
    [entityType, name, JSON.stringify(mapping)],
  );
  return result.rows[0];
}

export async function deleteSavedMapping(id) {
  await query('DELETE FROM import_mappings_saved WHERE id = $1', [id]);
  return { id };
}
