const bearer = [{ bearerAuth: [] }];

function jsonBody(ref) {
  return { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
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
  if (codes.includes(404)) map[404] = { description: 'Non trouvé', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  if (codes.includes(409)) map[409] = { description: 'Conflit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
  return map;
}

const devisIdParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID du devis' };
const ligneIdParam = { in: 'path', name: 'ligneId', required: true, schema: { type: 'integer' }, description: 'ID de la ligne' };
const champIdParam = { in: 'path', name: 'champId', required: true, schema: { type: 'integer' }, description: 'ID du champ' };
const templateIdParam = { in: 'path', name: 'templateId', required: true, schema: { type: 'integer' }, description: 'ID du template' };

export const devisSwaggerSchemas = {
  Devis: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero_devis: { type: 'string', example: 'DEV-2026-00001' },
      client_id: { type: 'integer' },
      contact_id: { type: 'integer', nullable: true },
      adresse_facturation_id: { type: 'integer', nullable: true },
      adresse_livraison_id: { type: 'integer', nullable: true },
      statut: { type: 'string', enum: ['BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'FACTURE'] },
      date_creation: { type: 'string', format: 'date' },
      date_emission: { type: 'string', format: 'date', nullable: true },
      date_validite: { type: 'string', format: 'date' },
      date_acceptation: { type: 'string', format: 'date', nullable: true },
      date_transformation: { type: 'string', format: 'date', nullable: true },
      objet: { type: 'string', example: 'Location copieur Sharp MX-3051' },
      reference_client: { type: 'string', nullable: true },
      commercial_id: { type: 'string', format: 'uuid', nullable: true },
      conditions_paiement: { type: 'string', enum: ['COMPTANT', '15_JOURS', '30_JOURS', '45_JOURS_FIN_MOIS', '60_JOURS'] },
      mode_paiement: { type: 'string', enum: ['VIREMENT', 'PRELEVEMENT_SEPA', 'CHEQUE', 'CARTE', 'ESPECES'] },
      devise: { type: 'string', example: 'EUR' },
      remise_globale_type: { type: 'string', enum: ['POURCENTAGE', 'MONTANT_FIXE'] },
      remise_globale_valeur: { type: 'number', example: 0 },
      montant_ht: { type: 'number' },
      montant_remise: { type: 'number' },
      montant_ht_apres_remise: { type: 'number' },
      montant_tva: { type: 'number' },
      montant_ttc: { type: 'number' },
      notes_internes: { type: 'string', nullable: true },
      conditions_generales: { type: 'string', nullable: true },
      message_client: { type: 'string', nullable: true },
      facture_id: { type: 'integer', nullable: true },
      bon_commande_id: { type: 'integer', nullable: true },
      client_nom: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  DevisDetail: {
    allOf: [
      { $ref: '#/components/schemas/Devis' },
      {
        type: 'object',
        properties: {
          client: { $ref: '#/components/schemas/Client' },
          contact: { $ref: '#/components/schemas/ClientContact' },
          adresse_facturation: { $ref: '#/components/schemas/ClientAdresse' },
          adresse_livraison: { $ref: '#/components/schemas/ClientAdresse' },
          lignes: { type: 'array', items: { $ref: '#/components/schemas/DevisLigne' } },
          champs_personnalises: { type: 'array', items: { $ref: '#/components/schemas/DevisChamp' } },
          historique: { type: 'array', items: { $ref: '#/components/schemas/DevisHistorique' } },
        },
      },
    ],
  },
  CreateDevisRequest: {
    type: 'object',
    required: ['client_id', 'objet'],
    properties: {
      client_id: { type: 'integer', example: 1 },
      contact_id: { type: 'integer' },
      adresse_facturation_id: { type: 'integer' },
      adresse_livraison_id: { type: 'integer' },
      date_emission: { type: 'string', format: 'date' },
      date_validite: { type: 'string', format: 'date' },
      objet: { type: 'string', example: 'Location copieur Sharp MX-3051' },
      reference_client: { type: 'string' },
      commercial_id: { type: 'string', format: 'uuid' },
      conditions_paiement: { type: 'string', enum: ['COMPTANT', '15_JOURS', '30_JOURS', '45_JOURS_FIN_MOIS', '60_JOURS'], default: '30_JOURS' },
      mode_paiement: { type: 'string', enum: ['VIREMENT', 'PRELEVEMENT_SEPA', 'CHEQUE', 'CARTE', 'ESPECES'], default: 'VIREMENT' },
      remise_globale_type: { type: 'string', enum: ['POURCENTAGE', 'MONTANT_FIXE'] },
      remise_globale_valeur: { type: 'number', default: 0 },
      notes_internes: { type: 'string' },
      conditions_generales: { type: 'string' },
      message_client: { type: 'string' },
      lignes: { type: 'array', items: { $ref: '#/components/schemas/CreateDevisLigneRequest' } },
    },
  },
  UpdateDevisRequest: {
    type: 'object',
    properties: {
      client_id: { type: 'integer' },
      contact_id: { type: 'integer' },
      adresse_facturation_id: { type: 'integer' },
      adresse_livraison_id: { type: 'integer' },
      date_emission: { type: 'string', format: 'date' },
      date_validite: { type: 'string', format: 'date' },
      objet: { type: 'string' },
      reference_client: { type: 'string' },
      commercial_id: { type: 'string', format: 'uuid' },
      conditions_paiement: { type: 'string', enum: ['COMPTANT', '15_JOURS', '30_JOURS', '45_JOURS_FIN_MOIS', '60_JOURS'] },
      mode_paiement: { type: 'string', enum: ['VIREMENT', 'PRELEVEMENT_SEPA', 'CHEQUE', 'CARTE', 'ESPECES'] },
      remise_globale_type: { type: 'string', enum: ['POURCENTAGE', 'MONTANT_FIXE'] },
      remise_globale_valeur: { type: 'number' },
      notes_internes: { type: 'string' },
      conditions_generales: { type: 'string' },
      message_client: { type: 'string' },
      lignes: { type: 'array', items: { $ref: '#/components/schemas/CreateDevisLigneRequest' } },
    },
  },
  DevisLigne: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      devis_id: { type: 'integer' },
      ordre: { type: 'integer' },
      type: { type: 'string', enum: ['PRODUIT', 'SERVICE', 'COMMENTAIRE', 'SAUT_DE_LIGNE', 'SOUS_TOTAL'] },
      reference: { type: 'string', nullable: true },
      designation: { type: 'string' },
      description_detaillee: { type: 'string', nullable: true },
      unite: { type: 'string', nullable: true },
      quantite: { type: 'number', default: 1 },
      prix_unitaire_ht: { type: 'number', default: 0 },
      remise_ligne_type: { type: 'string', enum: ['POURCENTAGE', 'MONTANT_FIXE'] },
      remise_ligne_valeur: { type: 'number', default: 0 },
      taux_tva: { type: 'number', default: 20 },
      montant_ht: { type: 'number' },
      montant_tva: { type: 'number' },
      montant_ttc: { type: 'number' },
      est_optionnel: { type: 'boolean', default: false },
      catalogue_id: { type: 'integer', nullable: true },
    },
  },
  CreateDevisLigneRequest: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['PRODUIT', 'SERVICE', 'COMMENTAIRE', 'SAUT_DE_LIGNE', 'SOUS_TOTAL'], default: 'PRODUIT' },
      reference: { type: 'string' },
      designation: { type: 'string', example: 'Location copieur mensuelle' },
      description_detaillee: { type: 'string' },
      unite: { type: 'string', example: 'mois' },
      quantite: { type: 'number', default: 1 },
      prix_unitaire_ht: { type: 'number', default: 0 },
      remise_ligne_type: { type: 'string', enum: ['POURCENTAGE', 'MONTANT_FIXE'] },
      remise_ligne_valeur: { type: 'number', default: 0 },
      taux_tva: { type: 'number', default: 20 },
      est_optionnel: { type: 'boolean', default: false },
      catalogue_id: { type: 'integer' },
    },
  },
  DevisChamp: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      devis_id: { type: 'integer' },
      cle: { type: 'string', example: 'duree_contrat' },
      label: { type: 'string', example: 'Durée du contrat' },
      valeur: { type: 'string' },
      type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'] },
      ordre: { type: 'integer' },
      afficher_sur_pdf: { type: 'boolean' },
    },
  },
  CreateDevisChampRequest: {
    type: 'object',
    required: ['cle', 'label'],
    properties: {
      cle: { type: 'string', example: 'duree_contrat' },
      label: { type: 'string', example: 'Durée du contrat' },
      valeur: { type: 'string' },
      type: { type: 'string', enum: ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'], default: 'TEXTE' },
      afficher_sur_pdf: { type: 'boolean', default: true },
    },
  },
  DevisHistorique: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      devis_id: { type: 'integer' },
      user_id: { type: 'string', format: 'uuid', nullable: true },
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      action: { type: 'string' },
      detail: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  DevisStats: {
    type: 'object',
    properties: {
      total_mois: { type: 'object', properties: { count: { type: 'integer' }, montant: { type: 'number' } } },
      en_attente: { type: 'object', properties: { count: { type: 'integer' }, montant: { type: 'number' } } },
      acceptes_mois: { type: 'object', properties: { count: { type: 'integer' }, montant: { type: 'number' } } },
      taux_conversion: { type: 'number' },
    },
  },
  ReorderLignesRequest: {
    type: 'object',
    required: ['ordre'],
    properties: {
      ordre: { type: 'array', items: { type: 'integer' }, description: 'Liste ordonnée des IDs de lignes' },
    },
  },
  EnvoyerDevisRequest: {
    type: 'object',
    properties: {
      destinataire: { type: 'string', format: 'email' },
      objet: { type: 'string' },
      corps: { type: 'string' },
    },
  },
  BonCommande: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      numero_bc: { type: 'string', example: 'BC-2026-00001' },
      devis_id: { type: 'integer' },
      client_id: { type: 'integer' },
      statut: { type: 'string', enum: ['EN_ATTENTE', 'CONFIRME', 'ANNULE'] },
      date_emission: { type: 'string', format: 'date' },
      notes: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  PaginatedDevis: {
    type: 'object',
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/Devis' } },
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
    },
  },
};

export const devisSwaggerPaths = {
  '/api/devis': {
    get: {
      tags: ['Devis'],
      summary: 'Liste paginée des devis',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        { in: 'query', name: 'statut', schema: { type: 'string', enum: ['BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'FACTURE'] } },
        { in: 'query', name: 'client_id', schema: { type: 'integer' } },
        { in: 'query', name: 'commercial_id', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'date_debut', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'date_fin', schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Recherche sur numéro, objet, client, référence' },
      ],
      responses: { ...res200('Liste des devis', 'PaginatedDevis'), ...resErr(401) },
    },
    post: {
      tags: ['Devis'],
      summary: 'Créer un nouveau devis',
      security: bearer,
      requestBody: jsonBody('CreateDevisRequest'),
      responses: { ...res201('Devis créé', 'DevisDetail'), ...resErr(400, 401) },
    },
  },
  '/api/devis/stats': {
    get: {
      tags: ['Devis'],
      summary: 'Statistiques des devis',
      security: bearer,
      responses: { ...res200('Statistiques', 'DevisStats'), ...resErr(401) },
    },
  },
  '/api/devis/{id}': {
    get: {
      tags: ['Devis'],
      summary: 'Détail complet d\'un devis',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res200('Détail du devis', 'DevisDetail'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Devis'],
      summary: 'Modifier un devis',
      security: bearer,
      parameters: [devisIdParam],
      requestBody: jsonBody('UpdateDevisRequest'),
      responses: { ...res200('Devis mis à jour', 'DevisDetail'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Devis'],
      summary: 'Supprimer un devis (soft delete)',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res200('Devis supprimé'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/envoyer': {
    post: {
      tags: ['Devis'],
      summary: 'Envoyer le devis au client',
      security: bearer,
      parameters: [devisIdParam],
      requestBody: jsonBody('EnvoyerDevisRequest'),
      responses: { ...res200('Devis envoyé', 'DevisDetail'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/accepter': {
    post: {
      tags: ['Devis'],
      summary: 'Marquer le devis comme accepté',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res200('Devis accepté', 'DevisDetail'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/refuser': {
    post: {
      tags: ['Devis'],
      summary: 'Marquer le devis comme refusé',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res200('Devis refusé', 'DevisDetail'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/dupliquer': {
    post: {
      tags: ['Devis'],
      summary: 'Dupliquer un devis',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res201('Devis dupliqué', 'DevisDetail'), ...resErr(401, 404) },
    },
  },
  '/api/devis/{id}/transformer-facture': {
    post: {
      tags: ['Devis'],
      summary: 'Transformer le devis en facture',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res200('Devis transformé en facture', 'DevisDetail'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/transformer-bc': {
    post: {
      tags: ['Devis'],
      summary: 'Créer un bon de commande depuis le devis',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res201('Bon de commande créé', 'BonCommande'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/pdf': {
    get: {
      tags: ['Devis'],
      summary: 'Générer le PDF HTML du devis',
      security: bearer,
      parameters: [devisIdParam],
      responses: {
        200: { description: 'PDF HTML du devis', content: { 'text/html': { schema: { type: 'string' } } } },
        ...resErr(401, 404),
      },
    },
  },

  // ── Lignes ──────────────────────────────────────────────────────────
  '/api/devis/{id}/lignes': {
    post: {
      tags: ['Devis - Lignes'],
      summary: 'Ajouter une ligne au devis',
      security: bearer,
      parameters: [devisIdParam],
      requestBody: jsonBody('CreateDevisLigneRequest'),
      responses: { ...res201('Ligne ajoutée', 'DevisLigne'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/lignes/{ligneId}': {
    put: {
      tags: ['Devis - Lignes'],
      summary: 'Modifier une ligne',
      security: bearer,
      parameters: [devisIdParam, ligneIdParam],
      requestBody: jsonBody('CreateDevisLigneRequest'),
      responses: { ...res200('Ligne mise à jour', 'DevisLigne'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Devis - Lignes'],
      summary: 'Supprimer une ligne',
      security: bearer,
      parameters: [devisIdParam, ligneIdParam],
      responses: { ...res200('Ligne supprimée'), ...resErr(401, 404) },
    },
  },
  '/api/devis/{id}/lignes/reorder': {
    put: {
      tags: ['Devis - Lignes'],
      summary: 'Réordonner les lignes du devis',
      security: bearer,
      parameters: [devisIdParam],
      requestBody: jsonBody('ReorderLignesRequest'),
      responses: { ...res200('Lignes réordonnées'), ...resErr(400, 401, 404) },
    },
  },

  // ── Champs personnalisés ────────────────────────────────────────────
  '/api/devis/{id}/champs': {
    get: {
      tags: ['Devis - Champs personnalisés'],
      summary: 'Lister les champs personnalisés du devis',
      security: bearer,
      parameters: [devisIdParam],
      responses: { ...res200('Liste des champs'), ...resErr(401, 404) },
    },
    post: {
      tags: ['Devis - Champs personnalisés'],
      summary: 'Ajouter un champ personnalisé',
      security: bearer,
      parameters: [devisIdParam],
      requestBody: jsonBody('CreateDevisChampRequest'),
      responses: { ...res201('Champ ajouté', 'DevisChamp'), ...resErr(400, 401, 404) },
    },
  },
  '/api/devis/{id}/champs/{champId}': {
    put: {
      tags: ['Devis - Champs personnalisés'],
      summary: 'Modifier un champ personnalisé',
      security: bearer,
      parameters: [devisIdParam, champIdParam],
      requestBody: jsonBody('CreateDevisChampRequest'),
      responses: { ...res200('Champ mis à jour', 'DevisChamp'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Devis - Champs personnalisés'],
      summary: 'Supprimer un champ personnalisé',
      security: bearer,
      parameters: [devisIdParam, champIdParam],
      responses: { ...res200('Champ supprimé'), ...resErr(401, 404) },
    },
  },
  '/api/devis/{id}/champs/depuis-template/{templateId}': {
    post: {
      tags: ['Devis - Champs personnalisés'],
      summary: 'Ajouter un champ depuis un template',
      security: bearer,
      parameters: [devisIdParam, templateIdParam],
      responses: { ...res201('Champ ajouté depuis template', 'DevisChamp'), ...resErr(401, 404) },
    },
  },
};
