const bearer = [{ bearerAuth: [] }];

function jsonBody(ref) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}
function inlineBody(schema) {
  return { required: true, content: { 'application/json': { schema } } };
}
function res200(desc, ref) {
  return { 200: { description: desc, content: { 'application/json': { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function res201(desc, ref) {
  return { 201: { description: desc, content: { 'application/json': { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { $ref: '#/components/schemas/SuccessResponse' } } } } };
}
function resErr(...codes) {
  const map = {};
  if (codes.includes(400)) map[400] = { description: 'Erreur de validation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(401)) map[401] = { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(403)) map[403] = { description: 'Accès interdit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(409)) map[409] = { description: 'Conflit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID du contrat' };
const ligneIdParam = { in: 'path', name: 'ligneId', required: true, schema: { type: 'integer' }, description: 'ID de la ligne' };
const machineIdParam = { in: 'path', name: 'machineId', required: true, schema: { type: 'integer' }, description: 'ID de la machine' };

export const contratSwaggerSchemas = {
  Contrat: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero_contrat: { type: 'string', example: 'CTR-2025-001' },
      type_contrat: { type: 'string', enum: ['Copieur', 'Telephonie', 'Informatique', 'Securite'] },
      type_facturation: { type: 'string', enum: ['Unique', 'Periodique'] },
      periodicite: { type: 'string', enum: ['Mensuel', 'Bimestriel', 'Trimestriel', 'Semestriel', 'Annuel'] },
      statut: { type: 'string', enum: ['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé'] },
      client_id: { type: 'integer' },
      client_raison_sociale: { type: 'string' },
      date_signature: { type: 'string', format: 'date' },
      date_debut: { type: 'string', format: 'date' },
      date_echeance: { type: 'string', format: 'date' },
      date_prochaine_facture: { type: 'string', format: 'date' },
      duree_contrat_mois: { type: 'integer' },
      loyer_ht: { type: 'number' },
      montant_ht: { type: 'number' },
      location_interne: { type: 'boolean' },
      numero_dossier_financement: { type: 'string' },
      organisme_credit: { type: 'string' },
      montant_finance: { type: 'number' },
      ftc: { type: 'number' },
      ect: { type: 'number' },
      notes: { type: 'string' },
      lignes: { type: 'array', items: { $ref: '#/components/schemas/ContratLigne' } },
      machines: { type: 'array', items: { $ref: '#/components/schemas/ContratMachine' } },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  ContratLigne: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      contrat_id: { type: 'integer' },
      ordre: { type: 'integer' },
      categorie_ligne: { type: 'string', enum: ['Forfait Fixe', 'Forfait Mobile', 'Lien Internet', 'Location Matériel', 'Services', 'Autre', 'Forfait Copie N&B', 'Forfait Copie Couleur', 'Service Connectic', 'PLC', 'Hors Forfait'] },
      reference: { type: 'string' },
      designation: { type: 'string' },
      complement_info: { type: 'string' },
      quantite: { type: 'number' },
      prix_unitaire_ht: { type: 'number' },
      remise_pourcentage: { type: 'number' },
      taux_tva: { type: 'number' },
      actif: { type: 'boolean' },
    },
  },
  ContratMachine: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      contrat_id: { type: 'integer' },
      numero_serie: { type: 'string' },
      modele: { type: 'string' },
      marque: { type: 'string' },
      designation: { type: 'string' },
      cout_copie_nb: { type: 'number' },
      cout_copie_couleur: { type: 'number' },
      volume_forfait_nb: { type: 'integer' },
      volume_forfait_couleur: { type: 'integer' },
      dernier_compteur_nb: { type: 'integer' },
      dernier_compteur_couleur: { type: 'integer' },
      date_dernier_releve: { type: 'string', format: 'date' },
      actif: { type: 'boolean' },
    },
  },
  CreateContratRequest: {
    type: 'object',
    required: ['type_contrat', 'client_id', 'date_debut'],
    properties: {
      type_contrat: { type: 'string', enum: ['Copieur', 'Telephonie', 'Informatique', 'Securite'] },
      client_id: { type: 'integer' },
      date_debut: { type: 'string', format: 'date' },
      date_echeance: { type: 'string', format: 'date' },
      type_facturation: { type: 'string', enum: ['Unique', 'Periodique'] },
      periodicite: { type: 'string', enum: ['Mensuel', 'Bimestriel', 'Trimestriel', 'Semestriel', 'Annuel'] },
      statut: { type: 'string', enum: ['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé'] },
      loyer_ht: { type: 'number' },
      duree_contrat_mois: { type: 'integer' },
      notes: { type: 'string' },
      location_interne: { type: 'boolean' },
      numero_dossier_financement: { type: 'string' },
      organisme_credit: { type: 'string' },
      montant_finance: { type: 'number' },
      ftc: { type: 'number' },
      ect: { type: 'number' },
    },
  },
  CreateContratLigneRequest: {
    type: 'object',
    required: ['designation'],
    properties: {
      designation: { type: 'string', example: 'Location photocopieur' },
      categorie_ligne: { type: 'string', enum: ['Forfait Fixe', 'Forfait Mobile', 'Lien Internet', 'Location Matériel', 'Services', 'Autre', 'Forfait Copie N&B', 'Forfait Copie Couleur', 'Service Connectic', 'PLC', 'Hors Forfait'] },
      reference: { type: 'string' },
      complement_info: { type: 'string' },
      quantite: { type: 'number', default: 1 },
      prix_unitaire_ht: { type: 'number' },
      remise_pourcentage: { type: 'number', default: 0 },
      taux_tva: { type: 'number', default: 20 },
    },
  },
  CreateContratMachineRequest: {
    type: 'object',
    required: ['numero_serie'],
    properties: {
      numero_serie: { type: 'string', example: 'SN-12345' },
      modele: { type: 'string' },
      marque: { type: 'string' },
      designation: { type: 'string' },
      cout_copie_nb: { type: 'number' },
      cout_copie_couleur: { type: 'number' },
      volume_forfait_nb: { type: 'integer' },
      volume_forfait_couleur: { type: 'integer' },
    },
  },
  GenererFactureContratRequest: {
    type: 'object',
    properties: {
      periode_debut: { type: 'string', format: 'date' },
      periode_fin: { type: 'string', format: 'date' },
      releve_compteur_nb_id: { type: 'integer' },
      releve_compteur_coul_id: { type: 'integer' },
    },
  },
};

export const contratSwaggerPaths = {
  '/api/contrats': {
    get: {
      tags: ['Contrats'],
      summary: 'Lister les contrats (paginé)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        { in: 'query', name: 'type_contrat', schema: { type: 'string', enum: ['Copieur', 'Telephonie', 'Informatique', 'Securite'] } },
        { in: 'query', name: 'statut', schema: { type: 'string', enum: ['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé'] } },
        { in: 'query', name: 'client_id', schema: { type: 'integer' } },
        { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Recherche (numéro, client...)' },
        { in: 'query', name: 'echeance_avant', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'prochaine_facture_avant', schema: { type: 'string', format: 'date' } },
      ],
      responses: { ...res200('Liste paginée des contrats'), ...resErr(401) },
    },
    post: {
      tags: ['Contrats'],
      summary: 'Créer un contrat',
      security: bearer,
      requestBody: jsonBody('CreateContratRequest'),
      responses: { ...res201('Contrat créé', 'Contrat'), ...resErr(400, 401) },
    },
  },
  '/api/contrats/stats': {
    get: {
      tags: ['Contrats'],
      summary: 'Statistiques des contrats',
      security: bearer,
      responses: { ...res200('Statistiques'), ...resErr(401) },
    },
  },
  '/api/contrats/client/{clientId}': {
    get: {
      tags: ['Contrats'],
      summary: 'Contrats d\'un client',
      security: bearer,
      parameters: [{ in: 'path', name: 'clientId', required: true, schema: { type: 'integer' }, description: 'ID du client' }],
      responses: { ...res200('Liste des contrats du client'), ...resErr(401) },
    },
  },
  '/api/contrats/export': {
    get: {
      tags: ['Contrats'],
      summary: 'Exporter les contrats (CSV/XLSX)',
      security: bearer,
      parameters: [
        { in: 'query', name: 'format', schema: { type: 'string', enum: ['csv', 'xlsx'], default: 'csv' } },
        { in: 'query', name: 'lignes', schema: { type: 'string', enum: ['0', '1'] }, description: 'Inclure les lignes' },
        { in: 'query', name: 'machines', schema: { type: 'string', enum: ['0', '1'] }, description: 'Inclure les machines' },
        { in: 'query', name: 'type_contrat', schema: { type: 'string' } },
        { in: 'query', name: 'statut', schema: { type: 'string' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Fichier exporté', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } }, 'text/csv': { schema: { type: 'string' } } } },
        ...resErr(401),
      },
    },
  },
  '/api/contrats/{id}': {
    get: {
      tags: ['Contrats'],
      summary: 'Détails d\'un contrat',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Contrat', 'Contrat'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Contrats'],
      summary: 'Modifier un contrat',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateContratRequest'),
      responses: { ...res200('Contrat mis à jour', 'Contrat'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Contrats'],
      summary: 'Supprimer un contrat',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Contrat supprimé'), ...resErr(401, 404) },
    },
  },
  '/api/contrats/{id}/duplicate': {
    post: {
      tags: ['Contrats'],
      summary: 'Dupliquer un contrat',
      security: bearer,
      parameters: [idParam],
      responses: { ...res201('Contrat dupliqué', 'Contrat'), ...resErr(401, 404) },
    },
  },
  '/api/contrats/{id}/generer-facture': {
    post: {
      tags: ['Contrats'],
      summary: 'Générer une facture depuis un contrat',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('GenererFactureContratRequest'),
      responses: { ...res201('Facture générée'), ...resErr(400, 401, 404) },
    },
  },
  '/api/contrats/{id}/lignes': {
    post: {
      tags: ['Contrats - Lignes'],
      summary: 'Ajouter une ligne au contrat',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateContratLigneRequest'),
      responses: { ...res201('Ligne ajoutée', 'ContratLigne'), ...resErr(400, 401, 404) },
    },
  },
  '/api/contrats/{id}/lignes/{ligneId}': {
    put: {
      tags: ['Contrats - Lignes'],
      summary: 'Modifier une ligne du contrat',
      security: bearer,
      parameters: [idParam, ligneIdParam],
      requestBody: jsonBody('CreateContratLigneRequest'),
      responses: { ...res200('Ligne mise à jour', 'ContratLigne'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Contrats - Lignes'],
      summary: 'Supprimer une ligne du contrat',
      security: bearer,
      parameters: [idParam, ligneIdParam],
      responses: { ...res200('Ligne supprimée'), ...resErr(401, 404) },
    },
  },
  '/api/contrats/{id}/machines': {
    post: {
      tags: ['Contrats - Machines'],
      summary: 'Ajouter une machine au contrat',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateContratMachineRequest'),
      responses: { ...res201('Machine ajoutée', 'ContratMachine'), ...resErr(400, 401, 404) },
    },
  },
  '/api/contrats/{id}/machines/{machineId}': {
    put: {
      tags: ['Contrats - Machines'],
      summary: 'Modifier une machine du contrat',
      security: bearer,
      parameters: [idParam, machineIdParam],
      requestBody: jsonBody('CreateContratMachineRequest'),
      responses: { ...res200('Machine mise à jour', 'ContratMachine'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Contrats - Machines'],
      summary: 'Supprimer une machine du contrat',
      security: bearer,
      parameters: [idParam, machineIdParam],
      responses: { ...res200('Machine supprimée'), ...resErr(401, 404) },
    },
  },
};
