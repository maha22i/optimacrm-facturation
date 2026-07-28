import XLSX from 'xlsx';
import { pool, getClient } from '../../config/database.js';
import { calculerMontantsLigne, recalculerDevis } from './devis.service.js';

const COLUMN_MAP = {
  'Numéro\ndu devis': 'numero',
  'Numéro du devis': 'numero',
  'Devis\nsaisi le': 'date_creation',
  'Devis saisi le': 'date_creation',
  'Nom du \nclient': 'nom_client_libre',
  'Nom du\nclient': 'nom_client_libre',
  'Nom du client': 'nom_client_libre',
  'Nom du\ncommercial': 'commercial',
  'Nom du commercial': 'commercial',
  'Objet\ndu devis': 'objet',
  'Objet du devis': 'objet',
  'Date\nrelance': 'date_relance',
  'Date relance': 'date_relance',
  'Prévision\nSignature': 'prevision_signature',
  'Prévision Signature': 'prevision_signature',
  'Probabilité\nsignature': 'probabilite_signature',
  'Probabilité signature': 'probabilite_signature',
  'Situation\naffaire': 'situation_affaire',
  'Situation affaire': 'situation_affaire',
  'Date\nvalidation': 'date_validation',
  'Date validation': 'date_validation',
  'Type\nproduit': 'type_produit',
  'Type produit': 'type_produit',
  'Total\nachat': 'total_achat_ht',
  'Total achat': 'total_achat_ht',
  'Total\nHT': 'total_ht',
  'Total HT': 'total_ht',
  'Marge\nréalisée': 'marge_realisee',
  'Marge réalisée': 'marge_realisee',
  'Taux(%)\nMarge': 'taux_marge',
  'Taux(%) Marge': 'taux_marge',
  'Taux (%)\nMarque': 'taux_marque',
  'Taux (%) Marque': 'taux_marque',
  'Montant\nTTC': 'montant_ttc',
  'Montant TTC': 'montant_ttc',
  'N°\nFacture': 'facture_liee',
  'N° Facture': 'facture_liee',
  'Ordre de\nservice': 'ordre_service',
  'Ordre de service': 'ordre_service',
  'Provenance\ninformation': 'provenance',
  'Provenance information': 'provenance',
};

function normalizeHeader(raw) {
  return String(raw || '').replace(/\r/g, '').trim();
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const str = String(val).trim();
  const frMatch = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (frMatch) {
    const year = frMatch[3].length === 2 ? '20' + frMatch[3] : frMatch[3];
    return `${year}-${frMatch[2].padStart(2, '0')}-${frMatch[1].padStart(2, '0')}`;
  }
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return null;
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/\s/g, '').replace(/€/g, '').replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseInt10(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  const n = parseInt(String(val).replace(/\s/g, '').replace('%', ''), 10);
  return isNaN(n) ? 0 : n;
}

function inferTauxTva(totalHt, montantTva) {
  if (totalHt <= 0) return 20;
  const implied = (montantTva / totalHt) * 100;
  const allowed = [0, 5.5, 10, 20];
  let best = 20;
  let bestDiff = Infinity;
  for (const t of allowed) {
    const d = Math.abs(t - implied);
    if (d < bestDiff) {
      bestDiff = d;
      best = t;
    }
  }
  return best;
}

/**
 * L'import Excel ne remplit que l'en-tête du devis : sans ligne, l'UI / PDF sont vides.
 * Si le devis n'a aucune ligne, on crée une ligne de synthèse à partir des colonnes import.
 */
async function ensureImportSummaryLigne(dbClient, devisId, row) {
  const { rows: cnt } = await dbClient.query(
    'SELECT COUNT(*)::int AS c FROM devis_lignes WHERE devis_id = $1',
    [devisId],
  );
  if (cnt[0].c > 0) return;

  const totalHt = parseNumber(row.total_ht);
  const montantTtc = parseNumber(row.montant_ttc);
  if (totalHt <= 0 && montantTtc <= 0) return;

  const montantTva = Math.round((montantTtc - totalHt) * 100) / 100;
  const typeProduit = String(row.type_produit || '').trim();
  const situation = String(row.situation_affaire || '').trim();
  const objet = String(row.objet || '').trim();
  const parts = [typeProduit, situation, objet].filter(Boolean);
  const designation = parts.length ? parts.join(' — ') : 'Synthèse import (Excel)';

  const tauxTva = inferTauxTva(totalHt, montantTva);
  const ligneType = typeProduit.toLowerCase().includes('service') ? 'SERVICE' : 'PRODUIT';
  const extraBits = [row.ordre_service, row.provenance].map((s) => String(s || '').trim()).filter(Boolean);
  const descriptionDetaillee = extraBits.length ? extraBits.join('\n') : null;

  const ligneInput = {
    type: ligneType,
    quantite: 1,
    prix_unitaire_ht: totalHt,
    remise_ligne_type: 'POURCENTAGE',
    remise_ligne_valeur: 0,
    taux_tva: tauxTva,
  };
  const montants = calculerMontantsLigne(ligneInput);

  await dbClient.query(
    `INSERT INTO devis_lignes (
      devis_id, ordre, type, reference, designation, description_detaillee, unite,
      quantite, prix_unitaire_ht, remise_ligne_type, remise_ligne_valeur, taux_tva,
      montant_ht, montant_tva, montant_ttc, est_optionnel, catalogue_id
    ) VALUES ($1, 0, $2, NULL, $3, $4, 'unité',
      1, $5, 'POURCENTAGE', 0, $6, $7, $8, $9, false, NULL)`,
    [
      devisId,
      ligneType,
      designation.slice(0, 500),
      descriptionDetaillee ? descriptionDetaillee.slice(0, 5000) : null,
      totalHt,
      tauxTva,
      montants.montant_ht,
      montants.montant_tva,
      montants.montant_ttc,
    ],
  );

  await recalculerDevis(dbClient, devisId);
}

export function parseDevisFile(buffer, originalName) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'dd/mm/yyyy' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Le fichier ne contient aucune feuille');

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rawRows.length === 0) throw new Error('Le fichier est vide');

  const rawHeaders = Object.keys(rawRows[0]);
  const mapping = {};
  for (const rawH of rawHeaders) {
    const normalized = normalizeHeader(rawH);
    const field = COLUMN_MAP[normalized] || COLUMN_MAP[rawH];
    if (field) mapping[rawH] = field;
  }

  const rows = rawRows.map((raw, idx) => {
    const mapped = {};
    for (const [rawKey, fieldName] of Object.entries(mapping)) {
      mapped[fieldName] = raw[rawKey];
    }
    return { _rowIndex: idx + 2, ...mapped };
  });

  const detectedColumns = Object.values(mapping);

  return {
    totalRows: rows.length,
    rows,
    preview: rows.slice(0, 5),
    detectedColumns,
    sheetName,
    fileName: originalName,
  };
}

export async function executeDevisImport(rows, options = {}) {
  const { updateExisting = true, linkClients = true } = options;
  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;

  const results = { imported: 0, updated: 0, errors: [] };

  let clientMap = {};
  if (linkClients) {
    const { rows: allClients } = await dbClient.query(
      "SELECT id, raison_sociale FROM clients WHERE statut <> 'INACTIF'"
    );
    for (const c of allClients) {
      clientMap[c.raison_sociale.toLowerCase().trim()] = c.id;
    }
  }

  try {
    if (ownConnection) await dbClient.query('BEGIN');

    for (const row of rows) {
      try {
        const numero = String(row.numero || '').trim();
        if (!numero) {
          results.errors.push({ row: row._rowIndex, message: 'Numéro de devis manquant — ligne ignorée' });
          continue;
        }

        const dateCreation = parseDate(row.date_creation) || new Date().toISOString().split('T')[0];
        const nomClient = String(row.nom_client_libre || '').trim();
        const commercial = String(row.commercial || '').trim();
        const objet = String(row.objet || '').trim();
        const dateRelance = parseDate(row.date_relance);
        const previsionSignature = parseDate(row.prevision_signature);
        const probabilite = parseInt10(row.probabilite_signature);
        const situationAffaire = String(row.situation_affaire || '').trim();
        const dateValidation = parseDate(row.date_validation);
        const typeProduit = String(row.type_produit || '').trim();
        const totalAchatHt = parseNumber(row.total_achat_ht);
        const totalHt = parseNumber(row.total_ht);
        const margeRealisee = parseNumber(row.marge_realisee);
        const tauxMarge = parseNumber(row.taux_marge);
        const tauxMarque = parseNumber(row.taux_marque);
        const montantTtc = parseNumber(row.montant_ttc);
        const factureliee = String(row.facture_liee || '').trim() || null;
        const ordreService = String(row.ordre_service || '').trim() || null;
        const provenance = String(row.provenance || '').trim() || null;

        const montantTva = Math.round((montantTtc - totalHt) * 100) / 100;

        let clientId = null;
        if (linkClients && nomClient) {
          clientId = clientMap[nomClient.toLowerCase().trim()] || null;
        }

        const dateValidite = dateCreation
          ? (() => { const d = new Date(dateCreation); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })()
          : null;

        const existingRes = await dbClient.query(
          'SELECT id FROM devis WHERE numero_devis = $1 AND deleted_at IS NULL',
          [numero]
        );

        if (existingRes.rows.length > 0 && updateExisting) {
          await dbClient.query(
            `UPDATE devis SET
              date_creation = $1, nom_client_libre = $2, commercial = $3, objet = COALESCE(NULLIF($4, ''), objet),
              date_relance = $5, prevision_signature = $6, probabilite_signature = $7,
              situation_affaire = $8, date_validation = $9, type_produit = $10,
              total_achat_ht = $11, montant_ht = $12, marge_realisee = $13,
              taux_marge = $14, taux_marque = $15, montant_ttc = $16, montant_tva = $17,
              facture_liee = COALESCE($18, facture_liee), ordre_service = COALESCE($19, ordre_service),
              provenance = COALESCE($20, provenance),
              client_id = COALESCE($21, client_id),
              updated_at = NOW()
            WHERE id = $22`,
            [
              dateCreation, nomClient, commercial, objet,
              dateRelance, previsionSignature, probabilite,
              situationAffaire, dateValidation, typeProduit,
              totalAchatHt, totalHt, margeRealisee,
              tauxMarge, tauxMarque, montantTtc, montantTva,
              factureliee, ordreService, provenance,
              clientId,
              existingRes.rows[0].id,
            ]
          );
          await ensureImportSummaryLigne(dbClient, existingRes.rows[0].id, row);
          results.updated++;
        } else if (existingRes.rows.length > 0 && !updateExisting) {
          results.errors.push({ row: row._rowIndex, message: `Doublon ignoré : ${numero}` });
        } else {
          const insertRes = await dbClient.query(
            `INSERT INTO devis (
              numero_devis, date_creation, date_validite, nom_client_libre, client_id, commercial, objet,
              date_relance, prevision_signature, probabilite_signature,
              situation_affaire, date_validation, type_produit,
              total_achat_ht, montant_ht, marge_realisee,
              taux_marge, taux_marque, montant_ttc, montant_tva,
              facture_liee, ordre_service, provenance,
              statut, montant_remise, montant_ht_apres_remise
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'BROUILLON',0,$15)
            RETURNING id`,
            [
              numero, dateCreation, dateValidite, nomClient, clientId, commercial, objet || null,
              dateRelance, previsionSignature, probabilite,
              situationAffaire, dateValidation, typeProduit,
              totalAchatHt, totalHt, margeRealisee,
              tauxMarge, tauxMarque, montantTtc, montantTva,
              factureliee, ordreService, provenance,
            ]
          );
          await ensureImportSummaryLigne(dbClient, insertRes.rows[0].id, row);
          results.imported++;
        }
      } catch (rowErr) {
        results.errors.push({ row: row._rowIndex, message: rowErr.message });
      }
    }

    if (ownConnection) await dbClient.query('COMMIT');
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }

  return results;
}
