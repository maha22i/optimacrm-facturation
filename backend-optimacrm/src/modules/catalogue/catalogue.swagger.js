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

const idParam = { in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID du produit' };
const tidParam = { in: 'path', name: 'tid', required: true, schema: { type: 'integer' }, description: 'ID du tarif client' };

export const catalogueSwaggerSchemas = {
  CatalogueProduit: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      reference: { type: 'string', example: 'COP-SHARP-3051' },
      designation: { type: 'string', example: 'Copieur Sharp MX-3051' },
      description: { type: 'string', nullable: true },
      categorie: { type: 'string', enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'], nullable: true },
      unite: { type: 'string', example: 'mois' },
      prix_unitaire_ht: { type: 'number', example: 149.90 },
      taux_tva: { type: 'number', example: 20 },
      actif: { type: 'boolean' },
      type_document: { type: 'string', enum: ['MARCHANDISE', 'PRESTATION'] },
      fournisseur_id: { type: 'integer', nullable: true },
      marque_id: { type: 'integer', nullable: true },
      famille_id: { type: 'integer', nullable: true },
      modele: { type: 'string', nullable: true },
      reference_fournisseur: { type: 'string', nullable: true },
      code_barre: { type: 'string', nullable: true },
      contribution_environnement: { type: 'number', default: 0 },
      frais_divers: { type: 'number', default: 0 },
      prix_achat: { type: 'number', nullable: true },
      prix_revient: { type: 'number', nullable: true, description: 'Calculé: prix_achat + contribution_environnement + frais_divers' },
      prix_vendeur: { type: 'number', nullable: true },
      prix_public: { type: 'number', nullable: true },
      marge_pourcentage: { type: 'number', nullable: true },
      quantite_stock: { type: 'integer', default: 0 },
      alerte_stock_mini: { type: 'number', default: 0 },
      quantite_reapprovisionnement: { type: 'integer', default: 0 },
      hors_catalogue: { type: 'boolean', default: false },
      image_url: { type: 'string', nullable: true },
      fournisseur_nom: { type: 'string', nullable: true },
      marque_nom: { type: 'string', nullable: true },
      famille_nom: { type: 'string', nullable: true },
      details: { type: 'object', nullable: true, description: 'Détails spécifiques à la catégorie (copieur/telephonie/informatique/securite)' },
      tarifs_clients: { type: 'array', items: { $ref: '#/components/schemas/TarifClient' } },
      comptabilite: { $ref: '#/components/schemas/ProduitComptabilite', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  CreateCatalogueRequest: {
    type: 'object',
    required: ['reference', 'designation'],
    properties: {
      reference: { type: 'string', example: 'COP-SHARP-3051' },
      designation: { type: 'string', example: 'Copieur Sharp MX-3051' },
      description: { type: 'string' },
      categorie: { type: 'string', enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'] },
      unite: { type: 'string', default: 'unité' },
      prix_unitaire_ht: { type: 'number', default: 0 },
      taux_tva: { type: 'number', enum: [20, 10, 5.5, 0], default: 20 },
      type_document: { type: 'string', enum: ['MARCHANDISE', 'PRESTATION'], default: 'MARCHANDISE' },
      fournisseur_id: { type: 'integer' },
      marque_id: { type: 'integer' },
      famille_id: { type: 'integer' },
      modele: { type: 'string' },
      reference_fournisseur: { type: 'string' },
      code_barre: { type: 'string' },
      contribution_environnement: { type: 'number', default: 0 },
      frais_divers: { type: 'number', default: 0 },
      prix_achat: { type: 'number' },
      prix_vendeur: { type: 'number' },
      prix_public: { type: 'number' },
      marge_pourcentage: { type: 'number' },
      quantite_stock: { type: 'integer', default: 0 },
      alerte_stock_mini: { type: 'number', default: 0 },
      quantite_reapprovisionnement: { type: 'integer', default: 0 },
      hors_catalogue: { type: 'boolean', default: false },
      details: { type: 'object', description: 'Détails spécifiques à la catégorie' },
      comptabilite: { $ref: '#/components/schemas/ProduitComptabilite' },
    },
  },
  UpdateCatalogueRequest: {
    type: 'object',
    properties: {
      reference: { type: 'string' },
      designation: { type: 'string' },
      description: { type: 'string' },
      categorie: { type: 'string', enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'] },
      unite: { type: 'string' },
      prix_unitaire_ht: { type: 'number' },
      taux_tva: { type: 'number', enum: [20, 10, 5.5, 0] },
      actif: { type: 'boolean' },
      type_document: { type: 'string', enum: ['MARCHANDISE', 'PRESTATION'] },
      fournisseur_id: { type: 'integer' },
      marque_id: { type: 'integer' },
      famille_id: { type: 'integer' },
      modele: { type: 'string' },
      reference_fournisseur: { type: 'string' },
      code_barre: { type: 'string' },
      contribution_environnement: { type: 'number' },
      frais_divers: { type: 'number' },
      prix_achat: { type: 'number' },
      prix_vendeur: { type: 'number' },
      prix_public: { type: 'number' },
      marge_pourcentage: { type: 'number' },
      quantite_stock: { type: 'integer' },
      alerte_stock_mini: { type: 'number' },
      quantite_reapprovisionnement: { type: 'integer' },
      hors_catalogue: { type: 'boolean' },
      details: { type: 'object' },
      comptabilite: { $ref: '#/components/schemas/ProduitComptabilite' },
    },
  },
  TarifClient: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      client_id: { type: 'integer' },
      prix_vente: { type: 'number' },
      taux_tva: { type: 'number' },
      notes: { type: 'string', nullable: true },
      numero_client: { type: 'string' },
      client_nom: { type: 'string' },
      client_prenom: { type: 'string' },
    },
  },
  CreateTarifClientRequest: {
    type: 'object',
    required: ['client_id', 'prix_vente'],
    properties: {
      client_id: { type: 'integer' },
      prix_vente: { type: 'number', example: 120.00 },
      taux_tva: { type: 'number', default: 20 },
      notes: { type: 'string' },
    },
  },
  ProduitComptabilite: {
    type: 'object',
    properties: {
      compte_vente: { type: 'string', example: '706000' },
      compte_achat: { type: 'string', example: '607000' },
      code_analytique: { type: 'string' },
      centre_cout: { type: 'string' },
    },
  },
  PaginatedCatalogue: {
    type: 'object',
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/CatalogueProduit' } },
      pagination: {
        type: 'object',
        properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } },
      },
    },
  },
};

export const catalogueSwaggerPaths = {
  '/api/catalogue': {
    get: {
      tags: ['Catalogue'],
      summary: 'Liste paginée du catalogue produits/services',
      security: bearer,
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        { in: 'query', name: 'categorie', schema: { type: 'string', enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'] } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'actif', schema: { type: 'boolean' } },
        { in: 'query', name: 'fournisseur_id', schema: { type: 'integer' }, description: 'Filtrer par fournisseur' },
      ],
      responses: { ...res200('Liste catalogue', 'PaginatedCatalogue'), ...resErr(401) },
    },
    post: {
      tags: ['Catalogue'],
      summary: 'Créer un produit/service (avec détails catégorie et comptabilité)',
      security: bearer,
      requestBody: jsonBody('CreateCatalogueRequest'),
      responses: { ...res201('Produit créé', 'CatalogueProduit'), ...resErr(400, 401, 409) },
    },
  },
  '/api/catalogue/categories': {
    get: {
      tags: ['Catalogue'],
      summary: 'Liste des catégories distinctes du catalogue',
      security: bearer,
      responses: { ...res200('Liste des catégories'), ...resErr(401) },
    },
  },
  '/api/catalogue/{id}': {
    get: {
      tags: ['Catalogue'],
      summary: 'Détail complet d\'un produit (inclut détails catégorie, tarifs clients, comptabilité)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Produit complet', 'CatalogueProduit'), ...resErr(401, 404) },
    },
    put: {
      tags: ['Catalogue'],
      summary: 'Modifier un produit (avec détails catégorie et comptabilité)',
      description: 'Si la catégorie change, les anciens détails sont supprimés et les nouveaux créés.',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('UpdateCatalogueRequest'),
      responses: { ...res200('Produit mis à jour', 'CatalogueProduit'), ...resErr(400, 401, 404, 409) },
    },
    delete: {
      tags: ['Catalogue'],
      summary: 'Désactiver un produit (soft delete)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Produit désactivé'), ...resErr(401, 404) },
    },
  },
  '/api/catalogue/{id}/adjacent': {
    get: {
      tags: ['Catalogue'],
      summary: 'IDs du produit précédent et suivant (navigation)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('IDs adjacents'), ...resErr(401) },
    },
  },
  '/api/catalogue/{id}/duplicate': {
    post: {
      tags: ['Catalogue'],
      summary: 'Dupliquer un produit (copie tout sauf l\'image)',
      security: bearer,
      parameters: [idParam],
      responses: { ...res201('Produit dupliqué', 'CatalogueProduit'), ...resErr(401, 404) },
    },
  },
  '/api/catalogue/{id}/image': {
    post: {
      tags: ['Catalogue'],
      summary: 'Uploader l\'image d\'un produit',
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } } },
      },
      responses: { ...res200('Image uploadée'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Catalogue'],
      summary: 'Supprimer l\'image d\'un produit',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Image supprimée'), ...resErr(401, 404) },
    },
  },
  '/api/catalogue/{id}/tarifs-clients': {
    get: {
      tags: ['Catalogue - Tarifs'],
      summary: 'Liste des tarifs clients pour un produit',
      security: bearer,
      parameters: [idParam],
      responses: { ...res200('Tarifs clients'), ...resErr(401) },
    },
    post: {
      tags: ['Catalogue - Tarifs'],
      summary: 'Ajouter un tarif client',
      security: bearer,
      parameters: [idParam],
      requestBody: jsonBody('CreateTarifClientRequest'),
      responses: { ...res201('Tarif créé', 'TarifClient'), ...resErr(400, 401, 409) },
    },
  },
  '/api/catalogue/{id}/tarifs-clients/{tid}': {
    put: {
      tags: ['Catalogue - Tarifs'],
      summary: 'Modifier un tarif client',
      security: bearer,
      parameters: [idParam, tidParam],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { prix_vente: { type: 'number' }, taux_tva: { type: 'number' }, notes: { type: 'string' } } } } } },
      responses: { ...res200('Tarif mis à jour', 'TarifClient'), ...resErr(400, 401, 404) },
    },
    delete: {
      tags: ['Catalogue - Tarifs'],
      summary: 'Supprimer un tarif client',
      security: bearer,
      parameters: [idParam, tidParam],
      responses: { ...res200('Tarif supprimé'), ...resErr(401, 404) },
    },
  },
};
