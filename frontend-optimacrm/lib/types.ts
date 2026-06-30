export type PermissionKey =
  | 'dashboard' | 'activity_logs' | 'users_manage'
  | 'clients_read' | 'clients_write' | 'clients_import'
  | 'devis_read' | 'devis_write'
  | 'factures_read' | 'factures_write'
  | 'contrats_read' | 'contrats_write' | 'contrats_import'
  | 'parc_read' | 'parc_write' | 'parc_import'
  | 'catalogue_read' | 'catalogue_write' | 'catalogue_import'
  | 'fournisseurs' | 'marques' | 'familles_unites'
  | 'champs_personnalises' | 'champs_templates'
  | 'tickets_read' | 'tickets_write' | 'tickets_admin' | 'techniciens_manage'
  | 'parametres_societe';

export type UserRole = 'admin' | 'user' | 'admin_technique' | 'technicien';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  permissions?: PermissionKey[];
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Clients (CRM)
// ---------------------------------------------------------------------------

export type FormeJuridique = 'SARL' | 'SAS' | 'EURL' | 'SA' | 'SCI' | 'AUTO_ENTREPRENEUR' | 'ASSOCIATION' | 'AUTRE';
export type StatutClient = 'ACTIF' | 'INACTIF' | 'BLOQUE' | 'PROSPECT';
export type DelaiPaiement = 'COMPTANT' | '15_JOURS' | '30_JOURS' | '45_JOURS_FIN_MOIS' | '60_JOURS';
export type ModePaiement = 'VIREMENT' | 'PRELEVEMENT_SEPA' | 'CHEQUE' | 'CARTE' | 'ESPECES';
export type TauxTVA = 20 | 10 | 5.5 | 0;
export type TypeAdresse = 'FACTURATION' | 'LIVRAISON' | 'SIEGE';
export type RoleContact = 'PRINCIPAL' | 'COMPTABILITE' | 'TECHNIQUE' | 'AUTRE';
export type TypeDocument = 'CONTRAT' | 'RIB' | 'MANDAT_SEPA' | 'BON_COMMANDE' | 'AUTRE';

export interface ClientChampPersonnalise {
  label: string;
  valeur: string;
}

export interface Client {
  id: number;
  numero_client: string;
  raison_sociale: string;
  forme_juridique: FormeJuridique;
  siret: string | null;
  siren: string | null;
  tva_intracommunautaire: string | null;
  code_ape: string | null;
  numero_rcs: string | null;
  site_web: string | null;
  telephone_principal: string | null;
  email_principal: string;
  email_comptabilite: string | null;
  statut: StatutClient;
  blocage_raison: string | null;
  remise_globale: number;
  taux_tva_defaut: TauxTVA;
  devise: string;
  plafond_encours: number | null;
  delai_paiement: DelaiPaiement;
  mode_paiement_prefere: ModePaiement | null;
  iban: string | null;
  bic: string | null;
  reference_mandat_sepa: string | null;
  date_mandat_sepa: string | null;
  sequence_mandat: string | null;
  notes: string | null;
  champs_personnalises: ClientChampPersonnalise[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// SEPA
// ---------------------------------------------------------------------------

export interface SepaCreancier {
  id: number;
  nom: string;
  ics: string;
  iban: string;
  bic: string;
  updated_at: string;
}

export interface SepaFactureEligible {
  facture_id: number;
  numero_facture: string;
  total_ttc: number;
  statut: string;
  date_creation: string;
  client_id: number;
  code_client: string;
  client_raison_sociale: string;
  numero_client: string;
  raison_sociale: string;
  iban: string | null;
  bic: string | null;
  reference_mandat_sepa: string | null;
  date_mandat_sepa: string | null;
  sequence_mandat: string | null;
  pret: boolean;
  champs_manquants: string[];
}

export interface SepaRemise {
  id: number;
  msg_id: string;
  pmt_inf_id: string;
  date_creation: string;
  date_prelevement: string;
  nb_transactions: number;
  montant_total: number;
  statut: string;
  user_nom: string | null;
}

export interface SepaGenerationResult {
  remise_id: number;
  msg_id: string;
  pmt_inf_id: string;
  nb_transactions: number;
  montant_total: string;
  date_prelevement: string;
  xml: string;
}

export interface ClientAdresse {
  id: number;
  client_id: number;
  type: TypeAdresse;
  est_defaut: boolean;
  ligne1: string;
  ligne2: string | null;
  code_postal: string;
  ville: string;
  pays: string;
  label: string | null;
}

export interface ClientContact {
  id: number;
  client_id: number;
  role: RoleContact;
  nom: string;
  prenom: string;
  fonction: string | null;
  telephone: string | null;
  mobile: string | null;
  email: string | null;
  est_principal: boolean;
}

export interface ClientDocument {
  id: number;
  client_id: number;
  nom: string;
  type: TypeDocument;
  url: string;
  created_at: string;
}

export interface ClientDetail extends Client {
  adresses: ClientAdresse[];
  contacts: ClientContact[];
  documents: ClientDocument[];
}

export interface ClientStats {
  ca_total: number;
  nb_factures: number;
  factures_en_attente: number;
  montant_en_attente: number;
  solde_du: number;
  nb_contrats_actifs: number;
}

// ---------------------------------------------------------------------------
// Devis (Facturation)
// ---------------------------------------------------------------------------

export type StatutDevis = 'BROUILLON' | 'ENVOYE' | 'ACCEPTE' | 'REFUSE' | 'EXPIRE' | 'FACTURE';
export type TypeLigne = 'PRODUIT' | 'SERVICE' | 'COMMENTAIRE' | 'SAUT_DE_LIGNE' | 'SOUS_TOTAL';
export type RemiseType = 'POURCENTAGE' | 'MONTANT_FIXE';
export type TypeChamp = 'TEXTE' | 'NOMBRE' | 'DATE' | 'LISTE' | 'BOOLEEN';

export interface DevisLigne {
  id?: number;
  devis_id?: number;
  ordre: number;
  type: TypeLigne;
  reference: string | null;
  designation: string | null;
  description_detaillee: string | null;
  unite: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  remise_ligne_type: RemiseType;
  remise_ligne_valeur: number;
  taux_tva: number;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  est_optionnel: boolean;
  catalogue_id: number | null;
}

export interface DevisChamp {
  id?: number;
  devis_id?: number;
  cle: string;
  label: string;
  valeur: string | null;
  type: TypeChamp;
  ordre: number;
  afficher_sur_pdf: boolean;
}

export interface DevisHistorique {
  id: number;
  devis_id: number;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface Devis {
  id: number;
  numero_devis: string;
  client_id: number | null;
  nom_client_libre?: string | null;
  commercial?: string | null;
  client_raison_sociale_fiche?: string | null;
  contact_id: number | null;
  adresse_facturation_id: number | null;
  adresse_livraison_id: number | null;
  statut: StatutDevis;
  date_creation: string;
  date_emission: string | null;
  date_validite: string;
  date_acceptation: string | null;
  date_transformation: string | null;
  objet: string;
  reference_client: string | null;
  commercial_id: string | null;
  conditions_paiement: DelaiPaiement;
  mode_paiement: ModePaiement;
  devise: string;
  remise_globale_type: RemiseType;
  remise_globale_valeur: number;
  montant_ht: number;
  montant_remise: number;
  montant_ht_apres_remise: number;
  montant_tva: number;
  montant_ttc: number;
  notes_internes: string | null;
  conditions_generales: string | null;
  message_client: string | null;
  /** Signature électronique en ligne */
  signature_client: string | null;
  date_signature: string | null;
  ip_signature: string | null;
  token_public?: string | null;
  signataire_nom?: string | null;
  signataire_email?: string | null;
  email_verifie?: boolean;
  date_envoi_signature?: string | null;
  user_agent_signature?: string | null;
  facture_id: number | null;
  bon_commande_id: number | null;
  /** Métadonnées import Excel (ligne de synthèse si pas de devis_lignes) */
  situation_affaire?: string | null;
  type_produit?: string | null;
  ordre_service?: string | null;
  provenance?: string | null;
  client_nom?: string;
  numero_client?: string;
  created_at: string;
  updated_at: string;
}

export interface DevisDetail extends Devis {
  client: Client | null;
  contact: ClientContact | null;
  adresse_facturation: ClientAdresse | null;
  adresse_livraison: ClientAdresse | null;
  lignes: DevisLigne[];
  champs_personnalises: DevisChamp[];
  historique: DevisHistorique[];
}

export interface DevisStats {
  total_mois: { count: number; montant: number };
  en_attente: { count: number; montant: number };
  acceptes_mois: { count: number; montant: number };
  taux_conversion: number;
}

export interface CatalogueProduit {
  id: number;
  reference: string;
  designation: string;
  description: string | null;
  categorie: CategorieFamille | null;
  unite: string;
  prix_unitaire_ht: number;
  taux_tva: number;
  actif: boolean;
  type_document: 'MARCHANDISE' | 'PRESTATION';
  fournisseur_id: number | null;
  marque_id: number | null;
  famille_id: number | null;
  modele: string | null;
  reference_fournisseur: string | null;
  code_barre: string | null;
  contribution_environnement: number;
  frais_divers: number;
  prix_achat: number | null;
  prix_revient: number | null;
  prix_vendeur: number | null;
  prix_public: number | null;
  marge_pourcentage: number | null;
  quantite_stock: number;
  alerte_stock_mini: number;
  quantite_reapprovisionnement: number;
  hors_catalogue: boolean;
  image_url: string | null;
  fournisseur_nom?: string | null;
  marque_nom?: string | null;
  famille_nom?: string | null;
  details?: Record<string, unknown> | null;
  tarifs_clients?: TarifClient[];
  comptabilite?: ProduitComptabilite | null;
  created_at: string;
  updated_at: string;
}

export interface TarifClient {
  id: number;
  client_id: number;
  prix_vente: number;
  taux_tva: number;
  notes: string | null;
  numero_client?: string;
  client_nom?: string;
}

export interface ProduitComptabilite {
  compte_vente: string | null;
  compte_achat: string | null;
  code_analytique: string | null;
  centre_cout: string | null;
}

export interface ChampTemplate {
  id: number;
  label: string;
  cle: string;
  type: TypeChamp;
  valeur_defaut: string | null;
  options_liste: string[] | null;
  categorie: string;
  actif: boolean;
  afficher_sur_pdf: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Champs personnalisés unifiés
// ---------------------------------------------------------------------------

export type EntiteType = 'CLIENT' | 'DEVIS' | 'CATALOGUE' | 'CONTRAT';

export interface ChampConfig {
  id: number;
  entite: EntiteType;
  section: string;
  section_ordre: number;
  label: string;
  cle: string;
  type: TypeChamp;
  valeur_defaut: string | null;
  options_liste: string[] | null;
  obligatoire: boolean;
  ordre: number;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChampValeur {
  config_id: number;
  entite_id: number;
  valeur: string | null;
  label: string;
  cle: string;
  type: TypeChamp;
  section: string;
  section_ordre: number;
  ordre: number;
  obligatoire: boolean;
  options_liste: string[] | null;
  valeur_defaut: string | null;
  valeur_id: number | null;
}

export interface SectionInfo {
  entite: EntiteType;
  section: string;
  section_ordre: number;
}

// ---------------------------------------------------------------------------
// Société Config (Paramètres)
// ---------------------------------------------------------------------------

export interface SocieteConfig {
  id: number;
  raison_sociale: string | null;
  forme_juridique: FormeJuridique | null;
  siret: string | null;
  siren: string | null;
  tva_intracommunautaire: string | null;
  code_ape: string | null;
  capital_social: number | null;
  rcs_ville: string | null;
  numero_rcs: string | null;
  adresse_ligne1: string | null;
  adresse_ligne2: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string;
  telephone: string | null;
  email_contact: string | null;
  email_facturation: string | null;
  site_web: string | null;
  logo_url: string | null;
  couleur_principale: string;
  signature_email: string | null;
  mentions_legales: string | null;
  cgv: string | null;
  message_devis_defaut: string | null;
  message_facture_defaut: string | null;
  banque_nom: string | null;
  iban: string | null;
  bic: string | null;
  prefixe_devis: string;
  prefixe_facture: string;
  prefixe_client: string;
  prefixe_bon_commande: string;
  remise_a_zero_annuelle: boolean;
  updated_at: string;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// Email Config
// ---------------------------------------------------------------------------

export interface EmailConfig {
  id: number;
  smtp_host: string | null;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_from_name: string | null;
  smtp_from_email: string | null;
  reply_to_email: string | null;
  signature: string | null;
  template_facture_sujet: string | null;
  template_facture_corps: string | null;
  template_devis_sujet: string | null;
  template_devis_corps: string | null;
  est_configure: boolean;
  derniere_verification: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: number;
  type_document: string | null;
  document_id: number | null;
  document_numero: string | null;
  destinataire: string;
  sujet: string;
  statut: string;
  message_erreur: string | null;
  created_at: string;
}

export interface EmailTemplate {
  destinataire: string;
  sujet: string;
  corps: string;
}

export interface BonCommande {
  id: number;
  numero_bc: string;
  devis_id: number;
  client_id: number;
  statut: 'EN_ATTENTE' | 'CONFIRME' | 'ANNULE';
  date_emission: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Marques, Fournisseurs, Familles, Unités
// ---------------------------------------------------------------------------

export type TypeFournisseur = 'FOURNISSEUR' | 'OPERATEUR_TELECOM' | 'CONSTRUCTEUR' | 'DISTRIBUTEUR' | 'AUTRE';
export type CategorieFamille = 'COPIEUR' | 'TELEPHONIE' | 'INFORMATIQUE' | 'SECURITE';

export interface Marque {
  id: number;
  nom: string;
  logo_url: string | null;
  site_web: string | null;
  notes: string | null;
  actif: boolean;
  nb_produits: number;
  created_at: string;
  updated_at: string;
}

export interface Fournisseur {
  id: number;
  nom: string;
  code: string | null;
  type: TypeFournisseur;
  contact_nom: string | null;
  contact_prenom: string | null;
  contact_email: string | null;
  contact_telephone: string | null;
  adresse_ligne1: string | null;
  adresse_ligne2: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string;
  site_web: string | null;
  numero_compte_client: string | null;
  conditions_paiement: string | null;
  delai_livraison_jours: number | null;
  notes: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface FamilleProduit {
  id: number;
  nom: string;
  categorie: CategorieFamille;
  description: string | null;
  actif: boolean;
  nb_produits: number;
  created_at: string;
  updated_at: string;
}

export interface Unite {
  id: number;
  nom: string;
  actif: boolean;
  nb_produits: number;
}

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------

export type TypeContrat = 'Copieur' | 'Telephonie' | 'Informatique' | 'Securite';
export type TypeFacturation = 'Unique' | 'Periodique';
export type Periodicite = 'Mensuel' | 'Bimestriel' | 'Trimestriel' | 'Semestriel' | 'Annuel';
export type StatutContrat = 'Brouillon' | 'Actif' | 'Suspendu' | 'Résilié' | 'Échu' | 'Renouvelé';
export type CategorieLigne =
  | 'Forfait Fixe'
  | 'Forfait Mobile'
  | 'Lien Internet'
  | 'Location Matériel'
  | 'Services'
  | 'Autre'
  | 'Forfait Copie N&B'
  | 'Forfait Copie Couleur'
  | 'Service Connectic'
  | 'PLC'
  | 'Hors Forfait'
  | 'Personnalisé'
  | 'Vidéosurveillance'
  | 'Contrôle d\'accès'
  | 'Téléassistance'
  | 'Générateur de brouillard'
  | 'Maintenance serveur'
  | 'Maintenance informatique'
  | 'Cloud'
  | 'Office 365'
  | 'Logiciel / Licence';

export interface ContratLigne {
  id?: number;
  contrat_id?: number;
  ordre: number;
  categorie_ligne: CategorieLigne | null;
  reference: string | null;
  designation: string;
  complement_info: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  remise_pourcentage: number;
  taux_tva: number;
  catalogue_produit_id: number | null;
  actif: boolean;
  inclus_abonnement?: boolean;
}

export interface ContratMachine {
  id?: number;
  contrat_id?: number;
  numero_serie: string;
  modele: string | null;
  marque: string | null;
  designation: string | null;
  cout_copie_nb: number;
  cout_copie_couleur: number;
  cout_copie_t1: number;
  cout_copie_t2: number;
  cout_copie_t3: number;
  volume_forfait_nb: number;
  volume_forfait_couleur: number;
  volume_forfait_t1: number;
  volume_forfait_t2: number;
  dernier_compteur_nb: number;
  dernier_compteur_couleur: number;
  date_dernier_releve: string | null;
  service_connectic: number;
  service_collecteur: number;
  service_divers: number;
  service_autre: number;
  actif: boolean;
  catalogue_produit_id: number | null;
}

export interface Contrat {
  id: number;
  numero_contrat: string;
  type_contrat: TypeContrat;
  type_facturation: TypeFacturation;
  client_id: number;
  periodicite: Periodicite;
  date_signature: string | null;
  date_installation: string | null;
  date_debut: string;
  date_echeance: string | null;
  date_prochaine_facture: string | null;
  date_renouvellement: string | null;
  duree_contrat_mois: number;
  numero_dossier_financement: string | null;
  organisme_credit: string | null;
  montant_finance: number;
  loyer_ht: number;
  location_interne: boolean;
  statut: StatutContrat;
  derniere_facture_date: string | null;
  derniere_facture_numero: string | null;
  derniere_facture_montant_ht: number | null;
  ftc: number;
  ect: number;
  notes: string | null;
  devis_id: number | null;
  terme_facturation: 'TAE' | 'TEC';
  created_at: string;
  updated_at: string;
  // Champs joints
  client_raison_sociale?: string;
  client_code?: string;
  client_email?: string;
  client_mode_paiement?: string;
  client_delai_paiement?: string;
  montant_ht?: number;
  machines_resume?: string;
}

export interface ContratDetail extends Contrat {
  lignes: ContratLigne[];
  machines: ContratMachine[];
}

export interface ContratStats {
  total_actifs: number;
  par_type: Record<TypeContrat, number>;
  a_facturer_ce_mois: number;
  echeance_3_mois: number;
  ca_recurrent_mensuel: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Import Catalogue
// ═══════════════════════════════════════════════════════════════════════════════

export interface ImportFieldDef {
  key: string;
  label: string;
  required: boolean;
  type: string;
  custom_field_id?: number;
}

export interface ImportFieldGroup {
  group: string;
  fields: ImportFieldDef[];
}

export interface ImportMapping {
  source_header: string;
  suggested_field: string | null;
  confidence: number;
  field_group: string | null;
  is_custom_field: boolean;
}

export interface ImportParseResult {
  file_id: string;
  headers: string[];
  preview: Record<string, string>[];
  total_rows: number;
  mappings: ImportMapping[];
  available_fields: {
    standard: ImportFieldGroup[];
    custom: ImportFieldGroup[];
  };
  type_contrat?: string | null;
  detected_format?: 'colonnes_rubriques' | 'standard';
}

export interface ImportValidationRow {
  row_number: number;
  status: 'valid' | 'error' | 'skipped';
  data: Record<string, unknown>;
  errors: string[];
}

export interface ImportValidationResult {
  file_id: string;
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  skipped: number;
  new_fournisseurs: string[];
  new_marques: string[];
  new_familles: string[];
  rows: ImportValidationRow[];
}

export interface ImportExecuteResult {
  total: number;
  imported: number;
  updated: number;
  errors: number;
  skipped: number;
  new_fournisseurs_created: number;
  new_marques_created: number;
  new_familles_created: number;
  error_details: { row_number: number; error: string }[];
}

export interface ImportSavedMapping {
  id: number;
  name: string;
  mapping: Record<string, string>;
  type_contrat?: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Import Contrats
// ═══════════════════════════════════════════════════════════════════════════════

export interface ImportContratValidationRow {
  row_number: number;
  status: 'valid' | 'error' | 'skipped';
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ImportContratValidationResult {
  file_id: string;
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  duplicates_in_file?: { numero_contrat: string; row_first: number; row_duplicate: number }[];
  skipped: number;
  missing_clients: string[];
  client_errors: number;
  total_machines: number;
  total_lignes_auto: number;
  contrats_without_lines?: number;
  format?: string;
  type_contrat?: string | null;
  rows: ImportContratValidationRow[];
}

export interface ImportContratExecuteResult {
  total: number;
  contrats_created: number;
  contrats_updated: number;
  machines_created: number;
  lignes_created: number;
  contrats_without_lines?: number;
  errors: number;
  skipped: number;
  duplicates_in_file?: { numero_contrat: string; row_first: number; row_duplicate: number }[];
  missing_clients?: string[];
  format?: string;
  type_contrat?: string | null;
  error_details: { row_number: number; error: string }[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Import Clients
// ══════════════════════════════════════════════════════════════════════════════

export interface ImportClientMapping extends ImportMapping {
  auto_ignored?: boolean;
}

export interface ImportClientValidationRow {
  row_number: number;
  status: 'valid' | 'error' | 'skipped';
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ImportClientValidationResult {
  file_id: string;
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  skipped: number;
  rows: ImportClientValidationRow[];
}

export interface ImportClientErrorDetail {
  row_number: number;
  error: string;
  data?: Record<string, unknown>;
}

export interface ImportClientExecuteResult {
  total: number;
  imported: number;
  updated: number;
  errors: number;
  skipped: number;
  adresses_created: number;
  contacts_created: number;
  error_details: ImportClientErrorDetail[];
}

export interface ImportRetryRowResult {
  row_number: number;
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface ImportRetryResult {
  total: number;
  success: number;
  errors: number;
  adresses_created: number;
  contacts_created: number;
  results: ImportRetryRowResult[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parc Machine
// ═══════════════════════════════════════════════════════════════════════════════

export type CategorieMachine = 'Copieur' | 'Téléphonie' | 'Informatique';
export type StatutMachine = 'En service' | 'En stock' | 'En SAV' | 'Retourné' | 'Hors service';
export type SourceReleve = 'Manuel' | 'Import' | 'Automatique';

export interface ParcMachine {
  id: number;
  numero_serie: string;
  matricule: string | null;
  designation: string;
  marque: string | null;
  modele: string | null;
  categorie: CategorieMachine;
  reference_produit: string | null;
  client_id: number | null;
  site_installation: string | null;
  contrat_id: number | null;
  numero_contrat: string | null;
  date_installation: string | null;
  date_fin_garantie: string | null;
  date_retrait: string | null;
  statut: StatutMachine;
  dernier_compteur_nb: number;
  dernier_compteur_couleur: number;
  date_dernier_releve: string | null;
  cout_copie_nb: number | null;
  cout_copie_couleur: number | null;
  volume_offert_nb: number;
  volume_offert_couleur: number;
  vitesse_ppm: number | null;
  format_max: string | null;
  recto_verso: boolean;
  reseau: boolean;
  type_equipement_tel: string | null;
  nb_postes: number | null;
  protocole: string | null;
  type_equipement_info: string | null;
  processeur: string | null;
  ram: string | null;
  stockage: string | null;
  systeme_exploitation: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_raison_sociale?: string;
  client_code?: string;
  client_email?: string;
  client_telephone?: string;
  client_nb_machines?: number;
  derniers_releves?: ReleveCompteur[];
  contrat_detail?: {
    id: number;
    numero_contrat: string;
    type_contrat: string;
    statut: string;
    date_echeance: string | null;
    loyer_ht: number;
  } | null;
}

export interface ReleveCompteur {
  id: number;
  machine_id: number;
  date_releve: string;
  date_debut_periode: string | null;
  date_fin_periode: string | null;
  compteur_nb: number;
  compteur_couleur: number;
  volume_nb: number;
  volume_couleur: number;
  source: SourceReleve;
  facture_id: number | null;
  facture_numero: string | null;
  est_facture: boolean;
  notes: string | null;
  created_at: string;
}

export interface ParcStats {
  total: number;
  en_service: number;
  en_stock: number;
  en_sav: number;
  hors_service: number;
  retourne: number;
  par_categorie: Record<string, number>;
  alertes_compteurs: number;
}

export interface ImportParcValidationRow {
  row_number: number;
  status: 'valid' | 'error' | 'skipped';
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ImportParcValidationResult {
  file_id: string;
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  skipped: number;
  machine_not_found?: number;
  rows: ImportParcValidationRow[];
}

export interface ImportParcExecuteResult {
  total: number;
  imported: number;
  errors: number;
  skipped: number;
  error_details: { row_number: number; error: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Import Relevés Compteurs (V2 — métier intelligent)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ImportRelevesParseResult {
  file_id: string;
  headers: string[];
  preview: Record<string, string>[];
  total_rows: number;
  suggested_mapping: {
    numero_serie?: string;
    compteur_nb?: string;
    compteur_couleur?: string;
    date_releve?: string;
    numero_contrat?: string;
  };
  file_hash: string;
  file_size: number;
}

export type ReleveLigneStatut = 'OK' | 'DEPASSEMENT' | 'ANOMALIE' | 'PREMIER_RELEVE' | 'AU_COMPTEUR' | 'SANS_CONTRAT' | 'HORS_CONTRAT';

export interface ReleveLigneAnalyse {
  row_number: number;
  numero_serie: string;
  statut: ReleveLigneStatut;
  alertes: string[];
  client_nom: string | null;
  client_id: number | null;
  machine_designation: string | null;
  machine_id: number | null;
  contrat_numero: string | null;
  contrat_id: number | null;
  ancien_compteur_nb: number;
  nouveau_compteur_nb: number;
  volume_nb: number;
  forfait_nb: number;
  depassement_nb: number;
  cout_copie_nb: number;
  montant_depassement_nb: number;
  ancien_compteur_couleur: number;
  nouveau_compteur_couleur: number;
  volume_couleur: number;
  forfait_couleur: number;
  depassement_couleur: number;
  cout_copie_couleur: number;
  montant_depassement_couleur: number;
  montant_total_ht: number;
  date_releve: string;
  selected?: boolean;
}

export interface ImportRelevesAnalyseResult {
  summary: {
    total_lignes: number;
    machines_trouvees: number;
    machines_inconnues: number;
    avec_depassement: number;
    sans_contrat: number;
    au_compteur: number;
    anomalies: number;
    premier_releve: number;
    hors_contrat: number;
    montant_total_depassement_ht: number;
  };
  lignes: ReleveLigneAnalyse[];
}

export interface ImportRelevesExecuteResult {
  total: number;
  imported: number;
  ignored: number;
  errors: number;
  depassements: number;
  montant_total_depassement_ht: number;
  anomalies_ignorees: number;
  machines_inconnues_ignorees: number;
  error_details: { row_number: number; numero_serie: string; error: string }[];
  numero_batch: string | null;
  import_id: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Imports Relevés (Historique)
// ═══════════════════════════════════════════════════════════════════════════════

export type StatutImport = 'Actif' | 'Annule';

export interface ImportReleve {
  id: number;
  numero_batch: string;
  nom_fichier: string;
  taille_fichier: number | null;
  hash_fichier: string;
  user_id: number | null;
  user_nom: string | null;
  date_import: string;
  nb_lignes_fichier: number;
  nb_releves_crees: number;
  nb_lignes_ignorees: number;
  nb_lignes_erreur: number;
  periode_debut: string | null;
  periode_fin: string | null;
  statut: StatutImport;
  date_annulation: string | null;
  user_annulation_id: number | null;
  motif_annulation: string | null;
  rapport_erreurs: ImportRapportErreur[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  nb_factures?: number;
  montant_total_ht?: number;
}

export interface ImportRapportErreur {
  ligne: number;
  matricule: string;
  type_erreur: string;
  detail: string;
}

export interface ImportReleveDetail extends ImportReleve {
  releves?: ImportReleveRow[];
  factures?: ImportFactureRow[];
}

export interface ImportReleveRow {
  id: number;
  date_releve: string;
  machine_id: number;
  numero_serie: string;
  modele: string | null;
  marque: string | null;
  designation: string | null;
  client_raison_sociale: string | null;
  compteur_nb: number;
  compteur_couleur: number;
  volume_nb: number;
  volume_couleur: number;
  est_facture: boolean;
  facture_numero: string | null;
  facture_id: number | null;
}

export interface ImportFactureRow {
  id: number;
  numero_facture: string;
  date_creation: string;
  client_id: number;
  client_nom: string;
  total_ht: number;
  total_ttc: number;
  statut: string;
  nb_releves_source: number;
}

export interface ImportsRelevesStats {
  total_imports: number;
  imports_ce_mois: number;
  releves_non_factures: number;
  imports_annules: number;
}

export interface MachineTimelineEntry {
  releve_id: number;
  date_releve: string;
  compteur_nb: number;
  compteur_couleur: number;
  volume_nb: number;
  volume_couleur: number;
  est_facture: boolean;
  import_id: number | null;
  numero_batch: string | null;
  date_import: string | null;
  import_statut: string | null;
  factures: {
    id: number;
    numero: string;
    date: string;
    montant_ttc: number;
    statut: string;
  }[] | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factures
// ═══════════════════════════════════════════════════════════════════════════════

export type StatutFacture = 'Brouillon' | 'Validée' | 'Envoyée' | 'Annulée';
export type TypeOrigineFacture = 'Manuelle' | 'Contrat' | 'Devis';
export type TypeLigneFacture =
  | 'PRODUIT' | 'FORFAIT_NB' | 'FORFAIT_COULEUR'
  | 'REGULARISATION_NB' | 'REGULARISATION_COULEUR'
  | 'SERVICE' | 'ABONNEMENT' | 'LOCATION'
  | 'COMMENTAIRE' | 'SOUS_TOTAL' | 'SAUT_DE_LIGNE';

export interface FactureLigne {
  id?: number;
  facture_id?: number;
  position: number;
  type_ligne: TypeLigneFacture;
  reference: string | null;
  designation: string;
  description: string | null;
  ligne_periode_debut: string | null;
  ligne_periode_fin: string | null;
  ancien_compteur: number | null;
  nouveau_compteur: number | null;
  compteur_periode_debut: string | null;
  compteur_periode_fin: string | null;
  quantite: number;
  prix_unitaire: number;
  remise_pourcentage: number;
  remise_montant: number;
  taux_tva: number;
  total_ht: number;
  releve_compteur_id?: number | null;
  releve_info?: {
    id: number;
    date_releve: string;
    machine_numero_serie: string;
    compteur_nb: number;
    compteur_couleur: number;
    import_id: number | null;
    numero_batch: string | null;
    date_import: string | null;
    user_nom: string | null;
  } | null;
}

export interface FactureReglement {
  id: number;
  facture_id: number;
  date_reglement: string;
  montant: number;
  mode_reglement: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface FactureHistorique {
  id: number;
  facture_id: number;
  action: string;
  description: string | null;
  utilisateur: string | null;
  created_at: string;
}

export interface Facture {
  id: number;
  numero_facture: string;
  type_origine: TypeOrigineFacture;
  contrat_id: number | null;
  devis_id: number | null;
  client_id: number;
  code_client: string | null;
  client_raison_sociale: string | null;
  client_adresse: string | null;
  client_cp: string | null;
  client_ville: string | null;
  client_email: string | null;
  client_tva_numero: string | null;
  site_concerne_nom: string | null;
  site_concerne_adresse: string | null;
  site_concerne_cp: string | null;
  site_concerne_ville: string | null;
  site_concerne_email: string | null;
  numero_contrat: string | null;
  numero_serie: string | null;
  modele_machine: string | null;
  date_creation: string;
  date_echeance: string;
  periode_debut: string | null;
  periode_fin: string | null;
  mode_reglement: string | null;
  total_ht: number;
  frais_techniques: number;
  eco_contribution: number;
  taux_tva: number;
  montant_tva: number;
  total_ttc: number;
  total_regle: number;
  net_a_payer: number;
  statut: StatutFacture;
  avoir_id: number | null;
  est_avoir: boolean;
  facture_origine_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_nom?: string;
  client_telephone?: string;
}

export interface FactureDetail extends Facture {
  lignes: FactureLigne[];
  reglements: FactureReglement[];
  historique: FactureHistorique[];
}

export interface FactureStats {
  ca_mois: { count: number; montant: number };
  en_attente: { count: number; montant: number };
  envoyees_mois: { count: number; montant: number };
}

export interface ContratAFacturer {
  id: number;
  numero_contrat: string;
  type_contrat: TypeContrat;
  client_id: number;
  client_raison_sociale: string;
  periodicite: string;
  prochaine_date_facturation: string | null;
  derniere_date_facturation: string | null;
  montant_mensuel_ht: number;
  en_retard: boolean;
  /** @deprecated use client_raison_sociale */
  client_nom?: string;
  /** @deprecated use prochaine_date_facturation */
  date_prochaine_facture?: string;
}

export interface ReleveCompteur {
  id: number;
  date_releve: string;
  compteur_nb: number;
  compteur_couleur: number;
  volume_nb: number;
  volume_couleur: number;
  date_debut_periode: string | null;
  date_fin_periode: string | null;
  numero_serie: string;
  modele: string | null;
  marque: string | null;
  est_facture: boolean;
  facture_id: number | null;
  facture_numero: string | null;
  contrat_id: number | null;
  numero_contrat: string | null;
  client_raison_sociale: string | null;
}

export interface GenerationLotReleveInfo {
  id: number;
  date_releve: string | null;
  periode_debut: string | null;
  periode_fin: string | null;
  compteur_nb: number;
  compteur_couleur: number;
  statut: string;
  est_facture: boolean;
}

export interface GenerationLotMachineReleves {
  numero_serie: string;
  modele: string;
  releves: GenerationLotReleveInfo[];
}

export interface GenerationLotErreur {
  contrat_id: number;
  message: string;
  numero_contrat?: string;
  client?: string;
  type_contrat?: string;
  periodicite?: string;
  statut?: string;
  date_debut?: string | null;
  date_echeance?: string | null;
  date_prochaine_facture?: string | null;
  derniere_facture_date?: string | null;
  nb_machines?: number;
  nb_machines_actives?: number;
  nb_lignes_actives?: number;
  raison?: 'aucune_machine_active' | 'pas_de_tarification' | 'releves_manquants' | 'aucune_ligne_active' | 'inconnu';
  releves_disponibles?: GenerationLotMachineReleves[];
  periode_demandee?: { debut: string; fin: string };
}

export interface GenerationLotResult {
  generees: {
    contrat_id: number;
    facture_id: number;
    numero_facture: string;
    numero_contrat: string;
    client: string;
    total_ttc: number;
  }[];
  erreurs: GenerationLotErreur[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Avoirs (Notes de crédit)
// ═══════════════════════════════════════════════════════════════════════════════

export type StatutAvoir = 'Brouillon' | 'Validé' | 'Remboursé' | 'Imputé' | 'Annulé';
export type TypeAvoir = 'TOTAL' | 'PARTIEL';
export type ModeUtilisation = 'REMBOURSEMENT' | 'IMPUTATION';

export interface AvoirLigne {
  id?: number;
  avoir_id?: number;
  facture_ligne_id?: number | null;
  designation: string;
  quantite: number;
  prix_unitaire_ht: number;
  taux_tva: number;
  montant_ht: number;
  montant_ttc: number;
}

export interface Avoir {
  id: number;
  numero: string;
  facture_id: number;
  client_id: number;
  type_avoir: TypeAvoir;
  motif: string | null;
  date_avoir: string;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  statut: StatutAvoir;
  mode_utilisation: ModeUtilisation | null;
  facture_imputee_id: number | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  client_nom?: string;
  numero_facture?: string;
  facture_client_raison_sociale?: string;
  facture_date_creation?: string;
  facture_total_ttc?: number;
  facture_imputee_numero?: string;
}

export interface AvoirDetail extends Avoir {
  lignes: AvoirLigne[];
  total_avoirs_existants?: number;
  reste_avoirable?: number;
}

export interface AvoirsPossibles {
  facture: Facture;
  lignes: FactureLigne[];
  total_ttc: number;
  total_avoirs_existants: number;
  reste_avoirable: number;
  avoirs_existants: { id: number; numero: string; montant_ttc: number; statut: string; type_avoir: string; date_avoir: string }[];
}

export interface AvoirsFacture {
  avoirs: Avoir[];
  facture_total_ttc: number;
  total_avoirs: number;
  net_du: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tickets (Support)
// ═══════════════════════════════════════════════════════════════════════════════

export type StatutTicket = 'nouveau' | 'assigne' | 'en_cours' | 'en_attente' | 'resolu';
export type PrioriteTicket = 'basse' | 'normale' | 'haute' | 'urgente';
export type SlaStatus = 'ok' | 'warning' | 'depasse';
export type SourceTicket = 'manuel' | 'email';

export interface TicketCategorie {
  id: number;
  nom: string;
  description: string | null;
  couleur: string;
  ordre: number;
  technicien_defaut_id: string | null;
  tech_prenom: string | null;
  tech_nom: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketSla {
  prise_en_charge: SlaStatus;
  resolution: SlaStatus;
}

export interface Ticket {
  id: number;
  numero: string;
  sujet: string;
  description: string | null;
  categorie_id: number | null;
  priorite: PrioriteTicket;
  statut: StatutTicket;
  client_id: number | null;
  machine_id: number | null;
  cree_par_id: string | null;
  technicien_id: string | null;
  date_prise_en_charge: string | null;
  date_resolution: string | null;
  sla_prise_en_charge_echeance: string | null;
  sla_resolution_echeance: string | null;
  pieces_jointes: string[];
  source: SourceTicket;
  email_message_id: string | null;
  email_from: string | null;
  email_received_at: string | null;
  created_at: string;
  updated_at: string;
  client_nom?: string;
  numero_client?: string;
  categorie_nom?: string;
  categorie_couleur?: string;
  technicien_prenom?: string;
  technicien_nom_famille?: string;
  sla?: TicketSla;
}

export interface TicketDetail extends Ticket {
  client_email?: string;
  createur_prenom?: string;
  createur_nom_famille?: string;
  machine_numero_serie?: string;
  machine_designation?: string;
  technicien_email?: string;
  commentaires: TicketCommentaire[];
  historique: TicketHistorique[];
}

export interface TicketCommentaire {
  id: number;
  ticket_id: number;
  user_id: string | null;
  user_nom: string | null;
  contenu: string;
  est_interne: boolean;
  pieces_jointes: string[];
  created_at: string;
}

export interface TicketHistorique {
  id: number;
  ticket_id: number;
  ancien_statut: string | null;
  nouveau_statut: string;
  user_id: string | null;
  user_nom: string | null;
  motif: string | null;
  created_at: string;
}

export interface TicketStats {
  total: number;
  par_statut: Record<string, number>;
  par_priorite: Record<string, number>;
  sla_depasses: number;
  temps_moyen_resolution_heures: number;
  temps_moyen_prise_en_charge_heures: number;
  par_technicien: { id: string; nom: string; ouverts: number; resolus_ce_mois: number }[];
  par_categorie: { id: number; nom: string; count: number; couleur?: string }[];
}

export interface TicketSlaRule {
  id: number;
  priorite: PrioriteTicket;
  delai_prise_en_charge_heures: number;
  delai_resolution_heures: number;
  couleur: string;
  created_at: string;
  updated_at: string;
}

export interface TicketEmailConfig {
  imap_host: string | null;
  imap_port: number;
  imap_user: string | null;
  imap_tls: boolean;
  folder: string;
  actif: boolean;
  derniere_synchro: string | null;
  password_defini: boolean;
}

export interface TicketEmailSyncResult {
  created: number;
  skipped: number;
  errors: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Planning des techniciens
// ═══════════════════════════════════════════════════════════════════════════════

export type StatutCreneau = 'planifie' | 'en_cours' | 'termine' | 'annule';

export interface PlanningCreneau {
  id: number;
  ticket_id: number;
  technicien_id: string;
  date_debut: string;
  date_fin: string;
  statut_creneau: StatutCreneau;
  cree_par: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ticket_numero: string;
  ticket_sujet: string;
  ticket_priorite: PrioriteTicket;
  ticket_statut: StatutTicket | 'cloture';
  ticket_technicien_id: string | null;
  client_nom: string | null;
  technicien_prenom: string | null;
  technicien_nom_famille: string | null;
}

export interface TicketPlanifiable {
  id: number;
  numero: string;
  sujet: string;
  priorite: PrioriteTicket;
  statut: StatutTicket;
  technicien_id: string | null;
  client_nom: string | null;
  technicien_prenom: string | null;
  technicien_nom_famille: string | null;
}
