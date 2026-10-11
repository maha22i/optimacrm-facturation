// Recense les endpoints d'écriture (POST/PUT/PATCH/DELETE) et vérifie que le
// handler correspondant journalise bien l'action. Suit les helpers locaux qui
// enveloppent activityLog (logSurContrat, logPortail, etc.).
//
// Usage : node scripts/audit-journal.mjs [--verbose]

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const RACINE = new URL('../src/modules/', import.meta.url).pathname;
const VERBEUX = process.argv.includes('--verbose');

// Handlers volontairement muets, avec la raison. Tout ce qui n'est pas ici et
// n'écrit pas de log est un trou de couverture à combler.
const EXEMPTES = new Map([
  ['previewImportContrats', 'prévisualisation, aucune écriture'],
  ['importParse', 'prévisualisation, aucune écriture'],
  ['parse', 'prévisualisation, aucune écriture'],
  ['parseMachines', 'prévisualisation, aucune écriture'],
  ['parseReleves', 'prévisualisation, aucune écriture'],
  ['validate', 'contrôle préalable, aucune écriture'],
  ['validateMachines', 'contrôle préalable, aucune écriture'],
  ['validateReleves', 'contrôle préalable, aucune écriture'],
  ['analyze', 'contrôle préalable, aucune écriture'],
  ['checkDuplicate', 'contrôle préalable, aucune écriture'],
  ['importContratsExecute', 'journalisé par contrat.service.js#importContrats'],
  ['genererFacturesTelephonie', 'délègue à facturationAbonnement.controller.js'],
]);

async function fichiers(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await fichiers(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Corps d'une fonction exportée, délimité par la prochaine déclaration de même niveau. */
function corpsHandler(source, nom) {
  const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${nom}\\s*\\(`);
  const m = re.exec(source);
  if (!m) return null;
  const suite = source.slice(m.index);
  const fin = suite.slice(1).search(/\n(?:export\s+)?(?:async\s+)?function\s/);
  return fin === -1 ? suite : suite.slice(0, fin + 1);
}

/** Noms des helpers locaux qui appellent activityLog : leur usage vaut journalisation. */
function helpersJournalisants(source) {
  const noms = new Set();
  const re = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(source))) {
    const corps = corpsHandler(source, m[1]);
    if (corps && /activityLog\.(log|logRequest)\s*\(/.test(corps)) noms.add(m[1]);
  }
  return noms;
}

const tousFichiers = await fichiers(RACINE);
const routes = tousFichiers.filter(f => f.endsWith('.routes.js'));

let total = 0;
let exemptes = 0;
const trous = [];

for (const fRoutes of routes) {
  const srcRoutes = await readFile(fRoutes, 'utf8');
  const dossier = path.dirname(fRoutes);

  // Sources des contrôleurs importés par ce fichier de routes, indexées par alias.
  const controleurs = new Map();
  const reImport = /import\s+\*\s+as\s+(\w+)\s+from\s+'(\.[^']+)'/g;
  let mi;
  while ((mi = reImport.exec(srcRoutes))) {
    try {
      controleurs.set(mi[1], await readFile(path.resolve(dossier, mi[2]), 'utf8'));
    } catch { /* module hors disque (index, alias) : ignoré */ }
  }

  const reRoute = /router\.(post|put|patch|delete)\s*\(([\s\S]*?)\)\s*;/g;
  let mr;
  while ((mr = reRoute.exec(srcRoutes))) {
    const [, verbe, args] = mr;
    const mh = /(\w+)\.(\w+)\s*,?\s*$/.exec(args.trim());
    if (!mh) continue;

    const [, alias, handler] = mh;
    const src = controleurs.get(alias);
    if (!src) continue;

    total++;
    const corps = corpsHandler(src, handler);
    if (!corps) continue;

    const helpers = helpersJournalisants(src);
    const journalise = /activityLog\.(log|logRequest)\s*\(/.test(corps)
      || [...helpers].some(h => h !== handler && new RegExp(`\\b${h}\\s*\\(`).test(corps));

    if (journalise) continue;
    if (EXEMPTES.has(handler)) { exemptes++; continue; }

    trous.push(`${verbe.toUpperCase().padEnd(6)} ${path.relative(RACINE, fRoutes).padEnd(48)} ${handler}`);
  }
}

console.log(`Endpoints d'écriture analysés : ${total}`);
console.log(`Journalisés                   : ${total - trous.length - exemptes}`);
console.log(`Exemptés (voir EXEMPTES)      : ${exemptes}`);
console.log(`Trous de couverture           : ${trous.length}`);
if (trous.length && VERBEUX) console.log('\n' + trous.join('\n'));

process.exit(trous.length > 0 ? 1 : 0);
