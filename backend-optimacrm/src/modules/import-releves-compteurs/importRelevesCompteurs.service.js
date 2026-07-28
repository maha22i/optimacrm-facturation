import { pool, query, getClient } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const TEMP_DIR = path.resolve('uploads/import-temp');

const HORS_CONTRAT_KEYWORDS = [
  'hors contrat', 'contrat resilie', 'contrat rompu', 'bloque', 'debranchee',
  'résilié', 'résiliée', 'bloqué', 'bloquée', 'débranchée',
];

// Lignes de récapitulatif Excel à ignorer silencieusement (somme par contrat/machine)
const TOTAL_LINE_KEYWORDS = [
  'total machine', 'total contrat', 'total client', 'sous total', 'sous-total',
  'total general', 'total général',
];

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

function isHorsContrat(designation, statut, notes) {
  const text = normalize([designation, statut, notes].filter(Boolean).join(' '));
  return HORS_CONTRAT_KEYWORDS.some(kw => text.includes(normalize(kw)));
}

// Détecte une ligne "TOTAL MACHINE/CONTRAT/CLIENT" (récap Excel, à ignorer)
function isTotalLine(row) {
  const concatenated = Object.values(row || {}).map(v => String(v || '')).join(' ');
  const norm = normalize(concatenated);
  return TOTAL_LINE_KEYWORDS.some(kw => norm.includes(normalize(kw)));
}

// Auto-mapping synonymes pour les 5 champs
const FIELD_SYNONYMS = {
  numero_serie: [
    'numéro de série', 'numero de serie', 'n° série', 'n° serie',
    'num série', 'num serie', 'serial', 'serial number', 'sn',
    'numéro série', 'numero serie', 'matricule',
  ],
  compteur_nb: [
    'total mono', 'compteur nb', 'compteur n/b', 'compteur noir',
    'compteur noir et blanc', 'mono', 'nb', 'n/b', 'noir blanc',
    'total n/b', 'noir et blanc',
  ],
  compteur_couleur: [
    'total couleur', 'compteur couleur', 'couleur', 'color',
    'total color', 'compteur color', 'couelur', 'couleurs',
  ],
  date_releve: [
    'date de fin', 'dernière collecte', 'derniere collecte', 'date relevé',
    'date releve', 'date', 'date fin', 'date du relevé', 'date du releve',
    'date de fin période', 'date fin période', 'date fin periode',
  ],
  numero_contrat: [
    'numéro contrat', 'numero contrat', 'n° contrat', 'no contrat',
    'num contrat', 'contrat', 'référence contrat', 'reference contrat',
    'ref contrat', 'réf contrat', 'code contrat', 'numero de contrat',
    'numéro de contrat', 'n° de contrat',
  ],
};

function suggestSimpleMapping(headers) {
  const suggestions = {};
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    let bestHeader = null;
    let bestScore = 0;
    for (const header of headers) {
      const h = normalize(header);
      if (!h) continue;
      for (const syn of synonyms) {
        const ns = normalize(syn);
        if (ns === h) { bestHeader = header; bestScore = 1.0; break; }
        if (h.includes(ns) || ns.includes(h)) {
          const score = 0.7 + (0.2 * Math.min(ns.length, h.length) / Math.max(ns.length, h.length));
          if (score > bestScore) { bestHeader = header; bestScore = score; }
        }
      }
      if (bestScore >= 1.0) break;
    }
    if (bestHeader && bestScore >= 0.6) suggestions[field] = bestHeader;
  }
  return suggestions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE — Step 1
// ═══════════════════════════════════════════════════════════════════════════════

export async function parseFile(fileBuffer, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  let rows = [];
  let headers = [];

  if (ext === '.csv' || ext === '.txt') {
    const text = fileBuffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) throw ApiError.badRequest('Fichier vide');
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    headers = lines[0].split(sep).map(h => h.replace(/^["']|["']$/g, '').trim());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(sep).map(v => v.replace(/^["']|["']$/g, '').trim());
      const row = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        row[h] = vals[idx] || '';
        if (vals[idx]) hasData = true;
      });
      if (hasData) rows.push(row);
    }
  } else if (ext === '.xlsx' || ext === '.xls') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
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

  // Filter out empty headers
  headers = headers.filter(h => h && h.trim());

  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const fileId = `releves_v2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.writeFile(path.join(TEMP_DIR, `${fileId}.json`), JSON.stringify({
    headers, rows,
    file_meta: { hash: fileHash, name: originalname, size: fileBuffer.length },
  }));

  const suggestions = suggestSimpleMapping(headers);

  return {
    file_id: fileId,
    headers,
    preview: rows.slice(0, 5),
    total_rows: rows.length,
    suggested_mapping: suggestions,
    file_hash: fileHash,
    file_size: fileBuffer.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZE — Step 2 (le cœur du système)
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeReleves(fileId, mapping, periode = {}) {
  const filePath = path.join(TEMP_DIR, `${fileId}.json`);
  let fileData;
  try { fileData = JSON.parse(await fs.readFile(filePath, 'utf-8')); }
  catch { throw ApiError.badRequest('Fichier expiré ou introuvable. Veuillez re-uploader.'); }

  const { rows } = fileData;
  const { numero_serie: colSerie, compteur_nb: colNb, compteur_couleur: colCouleur, date_releve: colDate, numero_contrat: colContrat } = mapping;

  if (!colSerie) throw ApiError.badRequest('Le mapping "Numéro de série" est obligatoire');
  if (!colNb) throw ApiError.badRequest('Le mapping "Compteur N/B" est obligatoire');

  // Batch-load all machines with clients and contracts
  const machinesResult = await query(`
    SELECT pm.id, pm.numero_serie, pm.designation, pm.marque, pm.modele, pm.categorie,
           pm.client_id, pm.contrat_id, pm.numero_contrat, pm.statut AS machine_statut,
           pm.dernier_compteur_nb, pm.dernier_compteur_couleur, pm.date_dernier_releve,
           pm.cout_copie_nb AS pm_cout_copie_nb, pm.cout_copie_couleur AS pm_cout_copie_couleur,
           pm.volume_offert_nb AS pm_volume_offert_nb, pm.volume_offert_couleur AS pm_volume_offert_couleur,
           pm.notes AS machine_notes,
           cl.raison_sociale AS client_nom, cl.numero_client AS client_code
    FROM parc_machines pm
    LEFT JOIN clients cl ON pm.client_id = cl.id
  `);
  const machineMap = new Map();
  for (const m of machinesResult.rows) {
    machineMap.set(m.numero_serie?.toUpperCase(), m);
  }

  // Batch-load all contrat_machines by numero_serie
  const contratMachinesResult = await query(`
    SELECT cm.numero_serie, cm.contrat_id,
           cm.cout_copie_nb, cm.cout_copie_couleur,
           cm.volume_forfait_nb, cm.volume_forfait_couleur,
           cm.dernier_compteur_nb AS cm_dernier_compteur_nb,
           cm.dernier_compteur_couleur AS cm_dernier_compteur_couleur,
           c.numero_contrat, c.statut AS contrat_statut, c.periodicite,
           c.client_id AS contrat_client_id
    FROM contrat_machines cm
    JOIN contrats c ON cm.contrat_id = c.id AND c.deleted_at IS NULL
    WHERE cm.actif = true
  `);
  const contratMachineMap = new Map();
  const contratByNumeroMap = new Map();
  for (const cm of contratMachinesResult.rows) {
    const key = cm.numero_serie?.toUpperCase();
    if (!contratMachineMap.has(key)) contratMachineMap.set(key, []);
    contratMachineMap.get(key).push(cm);
    // Index par (numero_serie + numero_contrat) pour matching précis depuis le fichier
    if (cm.numero_contrat) {
      const contratKey = `${key}::${cm.numero_contrat.trim().toUpperCase()}`;
      contratByNumeroMap.set(contratKey, cm);
    }
  }

  // Batch-load last relevés per machine
  const lastRelevesResult = await query(`
    SELECT DISTINCT ON (machine_id)
           machine_id, compteur_nb, compteur_couleur, date_releve
    FROM releves_compteurs
    ORDER BY machine_id, date_releve DESC, id DESC
  `);
  const lastReleveMap = new Map();
  for (const r of lastRelevesResult.rows) {
    lastReleveMap.set(r.machine_id, r);
  }

  const summary = {
    total_lignes: rows.length,
    lignes_ignorees: 0,
    au_compteur: 0,
    machines_trouvees: 0,
    machines_inconnues: 0,
    avec_depassement: 0,
    sans_contrat: 0,
    anomalies: 0,
    premier_releve: 0,
    hors_contrat: 0,
    montant_total_depassement_ht: 0,
  };

  const lignes = [];

  // ─── Étape A — Pré-traitement : parsing + filtrage des lignes TOTAL ─────────
  const parsedRows = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const ns = (raw[colSerie] || '').trim();
    const nouveauNb = parseInteger(raw[colNb]) || 0;
    const nouveauCouleur = colCouleur ? (parseInteger(raw[colCouleur]) || 0) : 0;
    const dateReleve = (colDate ? parseDate(raw[colDate]) : null)
      || (periode.date_fin ? periode.date_fin : null)
      || new Date().toISOString().split('T')[0];
    const fileContratNumero = colContrat ? (raw[colContrat] || '').trim() : '';

    // Ligne de récap Excel ("TOTAL MACHINE …") → ignorée silencieusement
    if (!ns && isTotalLine(raw)) {
      summary.lignes_ignorees++;
      continue;
    }

    parsedRows.push({ row_number: i + 1, raw, ns, nouveauNb, nouveauCouleur, dateReleve, fileContratNumero });
  }

  // ─── Étape B — Tri par (numéro de série, date croissante) pour chaîner les compteurs ─
  parsedRows.sort((a, b) => {
    const nsA = a.ns.toUpperCase();
    const nsB = b.ns.toUpperCase();
    if (nsA !== nsB) return nsA.localeCompare(nsB);
    return String(a.dateReleve).localeCompare(String(b.dateReleve));
  });

  // ─── Étape C — Boucle d'analyse avec cache dynamique des compteurs ─────────
  // Le cache part de la DB et est mis à jour à chaque ligne traitée pour
  // permettre le chaînage des relevés du même fichier.
  const compteurCache = new Map();
  for (const [machineId, r] of lastReleveMap.entries()) {
    compteurCache.set(machineId, {
      compteur_nb: r.compteur_nb || 0,
      compteur_couleur: r.compteur_couleur || 0,
      date_releve: r.date_releve,
    });
  }

  for (const parsed of parsedRows) {
    const { row_number, ns, nouveauNb, nouveauCouleur, dateReleve, fileContratNumero } = parsed;

    if (!ns) {
      lignes.push({
        row_number,
        numero_serie: '',
        statut: 'ANOMALIE',
        alertes: ['Numéro de série vide'],
        client_nom: null, client_id: null,
        machine_designation: null, machine_id: null,
        contrat_numero: null, contrat_id: null,
        ancien_compteur_nb: 0, nouveau_compteur_nb: nouveauNb, volume_nb: 0,
        forfait_nb: 0, depassement_nb: 0, cout_copie_nb: 0, montant_depassement_nb: 0,
        ancien_compteur_couleur: 0, nouveau_compteur_couleur: nouveauCouleur, volume_couleur: 0,
        forfait_couleur: 0, depassement_couleur: 0, cout_copie_couleur: 0, montant_depassement_couleur: 0,
        montant_total_ht: 0, date_releve: dateReleve,
      });
      summary.anomalies++;
      continue;
    }

    const machine = machineMap.get(ns.toUpperCase());
    if (!machine) {
      lignes.push({
        row_number,
        numero_serie: ns,
        statut: 'ANOMALIE',
        alertes: ['Machine inconnue — numéro de série non trouvé dans le parc'],
        client_nom: null, client_id: null,
        machine_designation: null, machine_id: null,
        contrat_numero: null, contrat_id: null,
        ancien_compteur_nb: 0, nouveau_compteur_nb: nouveauNb, volume_nb: 0,
        forfait_nb: 0, depassement_nb: 0, cout_copie_nb: 0, montant_depassement_nb: 0,
        ancien_compteur_couleur: 0, nouveau_compteur_couleur: nouveauCouleur, volume_couleur: 0,
        forfait_couleur: 0, depassement_couleur: 0, cout_copie_couleur: 0, montant_depassement_couleur: 0,
        montant_total_ht: 0, date_releve: dateReleve,
      });
      summary.machines_inconnues++;
      summary.anomalies++;
      continue;
    }

    summary.machines_trouvees++;

    // Find contract info: priorité au numéro de contrat du fichier si mappé
    const contratEntries = contratMachineMap.get(ns.toUpperCase()) || [];
    let matchedContrat = null;

    if (fileContratNumero) {
      // Chercher par clé exacte (numero_serie + numero_contrat du fichier)
      const contratKey = `${ns.toUpperCase()}::${fileContratNumero.toUpperCase()}`;
      matchedContrat = contratByNumeroMap.get(contratKey) || null;
      // Fallback : chercher parmi les contrats de cette machine par numéro partiel
      if (!matchedContrat) {
        matchedContrat = contratEntries.find(c =>
          c.numero_contrat && c.numero_contrat.trim().toUpperCase() === fileContratNumero.toUpperCase()
        ) || null;
      }
    }

    // Si pas trouvé via fichier, fallback au comportement existant
    if (!matchedContrat) {
      matchedContrat = contratEntries.find(c => c.contrat_statut === 'Actif') || contratEntries[0] || null;
    }

    let forfaitNb = 0, forfaitCouleur = 0, coutCopieNb = 0, coutCopieCouleur = 0;
    let contratNumero = null, contratId = null;
    let hasContrat = false;

    if (matchedContrat) {
      hasContrat = true;
      contratNumero = matchedContrat.numero_contrat;
      contratId = matchedContrat.contrat_id;
      forfaitNb = matchedContrat.volume_forfait_nb || 0;
      forfaitCouleur = matchedContrat.volume_forfait_couleur || 0;
      coutCopieNb = parseFloat(matchedContrat.cout_copie_nb) || 0;
      coutCopieCouleur = parseFloat(matchedContrat.cout_copie_couleur) || 0;
    } else if (machine.numero_contrat) {
      contratNumero = machine.numero_contrat;
      contratId = machine.contrat_id;
      forfaitNb = machine.pm_volume_offert_nb || 0;
      forfaitCouleur = machine.pm_volume_offert_couleur || 0;
      coutCopieNb = parseFloat(machine.pm_cout_copie_nb) || 0;
      coutCopieCouleur = parseFloat(machine.pm_cout_copie_couleur) || 0;
      hasContrat = true;
    }

    // Check HORS CONTRAT
    const horsContrat = isHorsContrat(machine.designation, machine.machine_statut, machine.machine_notes);

    // Le cache contient soit le dernier relevé en DB, soit le dernier relevé déjà
    // analysé dans CE fichier pour cette machine. C'est ce qui permet de chaîner
    // correctement plusieurs trimestres importés en une seule fois.
    const cached = compteurCache.get(machine.id);
    let ancienNb = 0, ancienCouleur = 0;
    let premierReleve = false;

    if (cached) {
      ancienNb = cached.compteur_nb || 0;
      ancienCouleur = cached.compteur_couleur || 0;
    } else if ((machine.dernier_compteur_nb || 0) > 0 || (machine.dernier_compteur_couleur || 0) > 0) {
      ancienNb = machine.dernier_compteur_nb || 0;
      ancienCouleur = machine.dernier_compteur_couleur || 0;
    } else {
      premierReleve = true;
    }

    const volumeNb = nouveauNb - ancienNb;
    const volumeCouleur = nouveauCouleur - ancienCouleur;

    // Mise à jour du cache APRÈS calcul, pour la prochaine ligne de cette machine
    compteurCache.set(machine.id, {
      compteur_nb: nouveauNb,
      compteur_couleur: nouveauCouleur,
      date_releve: dateReleve,
    });

    // Build line data
    const ligne = {
      row_number,
      numero_serie: ns,
      statut: 'OK',
      alertes: [],
      client_nom: machine.client_nom || null,
      client_id: machine.client_id || null,
      machine_designation: [machine.marque, machine.modele, machine.designation].filter(Boolean).join(' ') || machine.designation,
      machine_id: machine.id,
      contrat_numero: contratNumero,
      contrat_id: contratId,
      ancien_compteur_nb: ancienNb,
      nouveau_compteur_nb: nouveauNb,
      volume_nb: volumeNb,
      forfait_nb: forfaitNb,
      depassement_nb: 0,
      cout_copie_nb: coutCopieNb,
      montant_depassement_nb: 0,
      ancien_compteur_couleur: ancienCouleur,
      nouveau_compteur_couleur: nouveauCouleur,
      volume_couleur: volumeCouleur,
      forfait_couleur: forfaitCouleur,
      depassement_couleur: 0,
      cout_copie_couleur: coutCopieCouleur,
      montant_depassement_couleur: 0,
      montant_total_ht: 0,
      date_releve: dateReleve,
    };

    // Anomaly: counter going down
    if (volumeNb < 0) {
      ligne.statut = 'ANOMALIE';
      ligne.alertes.push(`Compteur N/B en baisse : ${nouveauNb} < ancien ${ancienNb} (remplacement machine probable)`);
      summary.anomalies++;
      lignes.push(ligne);
      continue;
    }
    if (volumeCouleur < 0 && nouveauCouleur > 0) {
      ligne.statut = 'ANOMALIE';
      ligne.alertes.push(`Compteur Couleur en baisse : ${nouveauCouleur} < ancien ${ancienCouleur} (remplacement machine probable)`);
      summary.anomalies++;
      lignes.push(ligne);
      continue;
    }

    // HORS CONTRAT
    if (horsContrat) {
      ligne.statut = 'HORS_CONTRAT';
      ligne.alertes.push('Machine HORS CONTRAT — compteur enregistré sans calcul de dépassement');
      summary.hors_contrat++;
      lignes.push(ligne);
      continue;
    }

    // SANS CONTRAT
    if (!hasContrat) {
      ligne.statut = 'SANS_CONTRAT';
      ligne.alertes.push('Machine sans contrat — pas de calcul de dépassement');
      summary.sans_contrat++;
      lignes.push(ligne);
      continue;
    }

    // PREMIER RELEVE
    if (premierReleve) {
      ligne.statut = 'PREMIER_RELEVE';
      ligne.alertes.push('Premier relevé — initialisation des compteurs');
      // Still calculate overage for first reading if forfait exists
      if (forfaitNb > 0 && volumeNb > forfaitNb) {
        ligne.depassement_nb = volumeNb - forfaitNb;
        ligne.montant_depassement_nb = Math.round(ligne.depassement_nb * coutCopieNb * 100) / 100;
      }
      if (forfaitCouleur > 0 && volumeCouleur > forfaitCouleur) {
        ligne.depassement_couleur = volumeCouleur - forfaitCouleur;
        ligne.montant_depassement_couleur = Math.round(ligne.depassement_couleur * coutCopieCouleur * 100) / 100;
      }
      ligne.montant_total_ht = Math.round((ligne.montant_depassement_nb + ligne.montant_depassement_couleur) * 100) / 100;
      summary.premier_releve++;
      if (ligne.montant_total_ht > 0) summary.avec_depassement++;
      summary.montant_total_depassement_ht += ligne.montant_total_ht;
      lignes.push(ligne);
      continue;
    }

    // Contrat AU COMPTEUR — pas de forfait, facturé à la copie
    if (forfaitNb === 0 && forfaitCouleur === 0) {
      ligne.statut = 'AU_COMPTEUR';
      const montantNb = Math.round(volumeNb * coutCopieNb * 100) / 100;
      const montantCoul = Math.round(volumeCouleur * coutCopieCouleur * 100) / 100;
      ligne.montant_total_ht = Math.round((montantNb + montantCoul) * 100) / 100;
      ligne.alertes.push('Contrat au compteur (sans forfait) — facturation à la copie');
      summary.au_compteur++;
      summary.montant_total_depassement_ht += ligne.montant_total_ht;
      lignes.push(ligne);
      continue;
    }

    // Calculate overages
    if (forfaitNb > 0) {
      ligne.depassement_nb = Math.max(0, volumeNb - forfaitNb);
      ligne.montant_depassement_nb = Math.round(ligne.depassement_nb * coutCopieNb * 100) / 100;
    }
    if (forfaitCouleur > 0) {
      ligne.depassement_couleur = Math.max(0, volumeCouleur - forfaitCouleur);
      ligne.montant_depassement_couleur = Math.round(ligne.depassement_couleur * coutCopieCouleur * 100) / 100;
    }
    ligne.montant_total_ht = Math.round((ligne.montant_depassement_nb + ligne.montant_depassement_couleur) * 100) / 100;

    // Abnormally high volume (>10x forfait)
    if ((forfaitNb > 0 && volumeNb > forfaitNb * 10) || (forfaitCouleur > 0 && volumeCouleur > forfaitCouleur * 10)) {
      ligne.alertes.push('Volume anormalement élevé (> 10× le forfait) — vérifiez les compteurs');
    }

    if (ligne.depassement_nb > 0 || ligne.depassement_couleur > 0) {
      ligne.statut = 'DEPASSEMENT';
      if (ligne.depassement_nb > 0) {
        ligne.alertes.push(`Dépassement N/B : ${ligne.depassement_nb.toLocaleString('fr-FR')} copies au-delà du forfait`);
      }
      if (ligne.depassement_couleur > 0) {
        ligne.alertes.push(`Dépassement Couleur : ${ligne.depassement_couleur.toLocaleString('fr-FR')} copies au-delà du forfait`);
      }
      summary.avec_depassement++;
    }

    summary.montant_total_depassement_ht += ligne.montant_total_ht;
    lignes.push(ligne);
  }

  summary.montant_total_depassement_ht = Math.round(summary.montant_total_depassement_ht * 100) / 100;

  // Sort by montant_total_ht descending
  lignes.sort((a, b) => {
    const statusOrder = { ANOMALIE: 0, DEPASSEMENT: 1, PREMIER_RELEVE: 2, AU_COMPTEUR: 3, SANS_CONTRAT: 4, HORS_CONTRAT: 5, OK: 6 };
    const sa = statusOrder[a.statut] ?? 5;
    const sb = statusOrder[b.statut] ?? 5;
    if (sa !== sb) return sa - sb;
    return (b.montant_total_ht || 0) - (a.montant_total_ht || 0);
  });

  return { summary, lignes };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE — Step 3
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeImport(lignes, periode = {}, fileMeta = {}, user = null) {
  const validStatuts = ['OK', 'DEPASSEMENT', 'PREMIER_RELEVE', 'AU_COMPTEUR', 'SANS_CONTRAT', 'HORS_CONTRAT'];
  const toImport = lignes.filter(l => l.selected !== false && validStatuts.includes(l.statut) && l.machine_id);

  if (toImport.length === 0) throw ApiError.badRequest('Aucune ligne valide à importer');

  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;
  let imported = 0, ignoredCount = 0, errorCount = 0;
  const errorDetails = [];
  const rapportErreurs = [];
  let totalDepassementHt = 0;
  let depassementCount = 0;
  let numeroBatch = null;
  let importRecordId = null;

  try {
    if (ownConnection) await dbClient.query('BEGIN');

    // Generate batch number IMP-YYYY-NNNN
    const year = new Date().getFullYear();
    const seqResult = await dbClient.query("SELECT nextval('imports_releves_batch_seq')::int AS seq");
    numeroBatch = `IMP-${year}-${String(seqResult.rows[0].seq).padStart(4, '0')}`;

    const fileHash = fileMeta.hash || crypto.createHash('sha256').update(String(Date.now())).digest('hex');
    const fileName = fileMeta.name || 'unknown';
    const fileSize = fileMeta.size || 0;
    const userName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : null;

    // Build error report for anomalies
    for (const l of lignes) {
      if (l.statut === 'ANOMALIE' || (!l.machine_id && l.numero_serie)) {
        rapportErreurs.push({
          ligne: l.row_number,
          matricule: l.numero_serie,
          type_erreur: !l.machine_id ? 'Machine inconnue' : 'Anomalie',
          detail: l.alertes?.join('; ') || 'Erreur',
        });
      }
    }

    // Create imports_releves record
    const importResult = await dbClient.query(
      `INSERT INTO imports_releves (
        numero_batch, nom_fichier, taille_fichier, hash_fichier,
        user_id, user_nom, nb_lignes_fichier,
        statut, rapport_erreurs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Actif', $8)
      RETURNING id`,
      [
        numeroBatch, fileName, fileSize, fileHash,
        user?.id || null, userName, lignes.length,
        rapportErreurs.length > 0 ? JSON.stringify(rapportErreurs) : null,
      ],
    );
    importRecordId = importResult.rows[0].id;

    let minDate = null, maxDate = null;

    for (const ligne of toImport) {
      try {
        const existingReleve = await dbClient.query(
          `SELECT id FROM releves_compteurs WHERE machine_id = $1 AND date_releve = $2`,
          [ligne.machine_id, ligne.date_releve],
        );

        if (existingReleve.rows.length > 0) {
          ignoredCount++;
          continue;
        }

        await dbClient.query(
          `INSERT INTO releves_compteurs (
            machine_id, date_releve, date_debut_periode, date_fin_periode,
            compteur_nb, compteur_couleur,
            ancien_compteur_nb, ancien_compteur_couleur,
            volume_nb, volume_couleur,
            depassement_nb, depassement_couleur,
            montant_depassement_nb, montant_depassement_couleur,
            forfait_nb, forfait_couleur,
            statut, source, source_import, import_id, ligne_fichier
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'Import','Import_Releve',$18,$19)`,
          [
            ligne.machine_id, ligne.date_releve,
            periode.date_debut || null, periode.date_fin || ligne.date_releve,
            ligne.nouveau_compteur_nb, ligne.nouveau_compteur_couleur,
            ligne.ancien_compteur_nb, ligne.ancien_compteur_couleur,
            Math.max(0, ligne.volume_nb), Math.max(0, ligne.volume_couleur),
            ligne.depassement_nb || 0, ligne.depassement_couleur || 0,
            ligne.montant_depassement_nb || 0, ligne.montant_depassement_couleur || 0,
            ligne.forfait_nb || 0, ligne.forfait_couleur || 0,
            ligne.statut, importRecordId, ligne.row_number,
          ],
        );

        await dbClient.query(
          `UPDATE parc_machines SET
            dernier_compteur_nb = GREATEST(dernier_compteur_nb, $1),
            dernier_compteur_couleur = GREATEST(dernier_compteur_couleur, $2),
            date_dernier_releve = GREATEST(date_dernier_releve, $3::date),
            updated_at = NOW()
          WHERE id = $4`,
          [ligne.nouveau_compteur_nb, ligne.nouveau_compteur_couleur, ligne.date_releve, ligne.machine_id],
        );

        imported++;
        if (ligne.statut === 'DEPASSEMENT') {
          depassementCount++;
          totalDepassementHt += ligne.montant_total_ht || 0;
        }

        // Track period
        const d = ligne.date_releve;
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      } catch (err) {
        errorCount++;
        errorDetails.push({ row_number: ligne.row_number, numero_serie: ligne.numero_serie, error: err.message });
        rapportErreurs.push({
          ligne: ligne.row_number,
          matricule: ligne.numero_serie,
          type_erreur: 'Erreur insertion',
          detail: err.message,
        });
      }
    }

    // Update imports_releves with final stats
    await dbClient.query(
      `UPDATE imports_releves SET
        nb_releves_crees = $1, nb_lignes_ignorees = $2, nb_lignes_erreur = $3,
        periode_debut = $4, periode_fin = $5,
        rapport_erreurs = $6, updated_at = NOW()
      WHERE id = $7`,
      [
        imported, ignoredCount,
        errorCount + lignes.filter(l => l.statut === 'ANOMALIE').length,
        minDate, maxDate,
        rapportErreurs.length > 0 ? JSON.stringify(rapportErreurs) : null,
        importRecordId,
      ],
    );

    if (ownConnection) await dbClient.query('COMMIT');
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }

  return {
    total: toImport.length,
    imported,
    ignored: ignoredCount,
    errors: errorCount,
    depassements: depassementCount,
    montant_total_depassement_ht: Math.round(totalDepassementHt * 100) / 100,
    anomalies_ignorees: lignes.filter(l => l.statut === 'ANOMALIE').length,
    machines_inconnues_ignorees: lignes.filter(l => !l.machine_id && l.statut === 'ANOMALIE').length,
    error_details: errorDetails,
    numero_batch: numeroBatch,
    import_id: importRecordId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

export async function cleanupTempFile(fileId) {
  try { await fs.unlink(path.join(TEMP_DIR, `${fileId}.json`)); } catch { /* noop */ }
}
