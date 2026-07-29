export interface ClientUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'client';
  client_id: number;
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
  pagination: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Branding {
  raison_sociale: string | null;
  logo_url: string | null;
  couleur_principale: string | null;
}

export interface DashboardData {
  factures_en_attente: number;
  tickets_ouverts: number;
  derniere_facture: {
    numero_facture: string;
    total_ttc: string;
    date_creation: string;
    statut: string;
  } | null;
  dernier_ticket: {
    numero: string;
    sujet: string;
    statut: string;
    created_at: string;
  } | null;
}

export interface Facture {
  id: number;
  numero_facture: string;
  date_creation: string;
  date_echeance: string;
  total_ht: string;
  total_ttc: string;
  statut: string;
  type_origine: string;
  periode_debut: string | null;
  periode_fin: string | null;
}

export interface FactureDetail extends Facture {
  frais_techniques: string;
  eco_contribution: string;
  taux_tva: string;
  montant_tva: string;
  total_regle: string;
  net_a_payer: string;
  mode_reglement: string;
  notes: string | null;
  client_raison_sociale: string;
  client_adresse: string;
  client_cp: string;
  client_ville: string;
  numero_contrat: string | null;
  numero_serie: string | null;
  modele_machine: string | null;
  lignes: FactureLigne[];
}

export interface FactureLigne {
  designation: string;
  quantite: string;
  prix_unitaire: string;
  remise_pourcentage: string;
  remise_montant: string;
  total_ht: string;
  type_ligne: string;
  reference: string;
}

export interface Ticket {
  id: number;
  numero: string;
  sujet: string;
  priorite: string;
  statut: string;
  created_at: string;
  updated_at: string;
  categorie_nom: string | null;
  categorie_couleur: string | null;
}

export interface TicketDetail extends Ticket {
  description: string;
  machine_numero_serie: string | null;
  machine_designation: string | null;
  commentaires: TicketCommentaire[];
}

export interface TicketCommentaire {
  id: number;
  user_nom: string;
  contenu: string;
  created_at: string;
}

export interface Machine {
  id: number;
  numero_serie: string;
  designation: string;
  marque: string;
  modele: string;
  categorie: string;
  statut: string;
  site_installation: string | null;
  date_installation: string | null;
  numero_contrat: string | null;
  dernier_compteur_nb: number | null;
  dernier_compteur_couleur: number | null;
  date_dernier_releve: string | null;
}

export interface MachineDetail extends Machine {
  matricule: string | null;
  date_fin_garantie: string | null;
  cout_copie_nb: string | null;
  cout_copie_couleur: string | null;
  volume_offert_nb: number | null;
  volume_offert_couleur: number | null;
  derniers_releves: {
    id: number;
    date_releve: string;
    compteur_nb: number | null;
    compteur_couleur: number | null;
  }[];
}

export interface Contrat {
  id: number;
  numero_contrat: string;
  type_contrat: string;
  type_facturation: string;
  periodicite: string;
  statut: string;
  date_debut: string;
  date_echeance: string;
  loyer_ht: string | null;
  date_prochaine_facture: string | null;
  terme_facturation: string | null;
}

export interface ContratDetail extends Contrat {
  date_signature: string | null;
  date_renouvellement: string | null;
  duree_contrat_mois: number;
  ftc: string | null;
  ect: string | null;
  notes: string | null;
  lignes: ContratLigne[];
  machines: ContratMachine[];
}

export interface ContratLigne {
  designation: string;
  reference: string;
  quantite: string;
  prix_unitaire_ht: string;
  remise_pourcentage: string;
  total_ht: string;
  categorie_ligne: string;
  inclus_abonnement: boolean;
}

export interface ContratMachine {
  numero_serie: string;
  modele: string;
  designation: string;
  actif: boolean;
}
