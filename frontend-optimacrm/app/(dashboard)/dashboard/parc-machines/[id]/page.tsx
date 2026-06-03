'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { ApiResponse, PaginatedResponse, ParcMachine, ReleveCompteur, MachineTimelineEntry } from '@/lib/types';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatNumber(n: number | null | undefined) {
  if (n == null) return '0';
  return n.toLocaleString('fr-FR');
}
function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 6 }) + ' €';
}
function daysSince(d: string | null) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

const CATEGORIE_BADGES: Record<string, string> = {
  Copieur: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'Téléphonie': 'bg-blue-50 text-blue-700 ring-blue-600/20',
  Informatique: 'bg-purple-50 text-purple-700 ring-purple-600/20',
};
const STATUT_BADGES: Record<string, { color: string; dot: string }> = {
  'En service': { color: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20', dot: 'bg-emerald-500' },
  'En stock': { color: 'text-blue-700 bg-blue-50 ring-blue-600/20', dot: 'bg-blue-500' },
  'En SAV': { color: 'text-amber-700 bg-amber-50 ring-amber-600/20', dot: 'bg-amber-500' },
  'Retourné': { color: 'text-gray-500 bg-gray-50 ring-gray-400/20', dot: 'bg-gray-400' },
  'Hors service': { color: 'text-red-700 bg-red-50 ring-red-600/20', dot: 'bg-red-500' },
};
const SOURCE_BADGES: Record<string, string> = {
  Manuel: 'bg-gray-100 text-gray-600',
  Import: 'bg-blue-50 text-blue-600',
  Automatique: 'bg-emerald-50 text-emerald-600',
};

export default function FicheMachinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const machineId = parseInt(id);
  const router = useRouter();

  const [machine, setMachine] = useState<ParcMachine | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'infos' | 'releves' | 'historique'>('infos');

  const [releves, setReleves] = useState<ReleveCompteur[]>([]);
  const [relevesLoading, setRelevesLoading] = useState(false);
  const [relevesTotal, setRelevesTotal] = useState(0);

  const [timeline, setTimeline] = useState<MachineTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [showReleveModal, setShowReleveModal] = useState(false);
  const [editingReleve, setEditingReleve] = useState<ReleveCompteur | null>(null);
  const [releveForm, setReleveForm] = useState({ date_releve: new Date().toISOString().split('T')[0], date_debut_periode: '', date_fin_periode: '', compteur_nb: '', compteur_couleur: '', notes: '' });
  const [releveErrors, setReleveErrors] = useState<Record<string, string>>({});
  const [releveSaving, setReleveSaving] = useState(false);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const loadMachine = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ParcMachine>>(`/parc-machines/${machineId}`);
      setMachine(res.data);
    } catch { router.push('/dashboard/parc-machines'); }
    finally { setLoading(false); }
  }, [machineId, router]);

  const loadReleves = useCallback(async () => {
    setRelevesLoading(true);
    try {
      const res = await api.get<PaginatedResponse<ReleveCompteur>>(`/parc-machines/${machineId}/releves?limit=100`);
      setReleves(res.data);
      setRelevesTotal(res.pagination.total);
    } catch { /* */ }
    finally { setRelevesLoading(false); }
  }, [machineId]);

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const res = await api.get<ApiResponse<MachineTimelineEntry[]>>(`/parc-machines/${machineId}/timeline`);
      setTimeline(res.data);
    } catch { /* */ }
    finally { setTimelineLoading(false); }
  }, [machineId]);

  useEffect(() => { loadMachine(); }, [loadMachine]);
  useEffect(() => {
    if (activeTab === 'releves') {
      loadReleves();
      loadTimeline();
    }
  }, [activeTab, loadReleves, loadTimeline]);

  function openNewReleveModal() {
    setEditingReleve(null);
    setReleveForm({
      date_releve: new Date().toISOString().split('T')[0],
      date_debut_periode: machine?.date_dernier_releve?.split('T')[0] || '',
      date_fin_periode: new Date().toISOString().split('T')[0],
      compteur_nb: '', compteur_couleur: '', notes: '',
    });
    setReleveErrors({});
    setShowReleveModal(true);
  }

  function openEditReleveModal(r: ReleveCompteur) {
    setEditingReleve(r);
    setReleveForm({
      date_releve: r.date_releve?.split('T')[0] || '',
      date_debut_periode: r.date_debut_periode?.split('T')[0] || '',
      date_fin_periode: r.date_fin_periode?.split('T')[0] || '',
      compteur_nb: String(r.compteur_nb),
      compteur_couleur: String(r.compteur_couleur),
      notes: r.notes || '',
    });
    setReleveErrors({});
    setShowReleveModal(true);
  }

  async function handleSaveReleve(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!releveForm.date_releve) errs.date_releve = 'Date obligatoire';
    if (!releveForm.compteur_nb) errs.compteur_nb = 'Compteur N/B obligatoire';
    if (!releveForm.compteur_couleur) errs.compteur_couleur = 'Compteur Couleur obligatoire';

    const nb = parseInt(releveForm.compteur_nb) || 0;
    const coul = parseInt(releveForm.compteur_couleur) || 0;

    if (!editingReleve && machine) {
      if (nb < machine.dernier_compteur_nb && machine.date_dernier_releve)
        errs.compteur_nb = `Ne peut pas être inférieur au précédent (${formatNumber(machine.dernier_compteur_nb)})`;
      if (coul < machine.dernier_compteur_couleur && machine.date_dernier_releve)
        errs.compteur_couleur = `Ne peut pas être inférieur au précédent (${formatNumber(machine.dernier_compteur_couleur)})`;
    }

    setReleveErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setReleveSaving(true);
    try {
      const payload = {
        date_releve: releveForm.date_releve,
        date_debut_periode: releveForm.date_debut_periode || null,
        date_fin_periode: releveForm.date_fin_periode || null,
        compteur_nb: nb,
        compteur_couleur: coul,
        notes: releveForm.notes || null,
      };

      if (editingReleve) {
        await api.put(`/parc-machines/${machineId}/releves/${editingReleve.id}`, payload);
      } else {
        await api.post(`/parc-machines/${machineId}/releves`, payload);
      }
      setShowReleveModal(false);
      loadMachine();
      loadReleves();
    } catch (err) {
      if (err instanceof ApiError) setReleveErrors({ _global: err.message });
    } finally { setReleveSaving(false); }
  }

  async function handleDeleteReleve(releveId: number) {
    try {
      await api.delete(`/parc-machines/${machineId}/releves/${releveId}`);
      loadReleves();
      loadMachine();
    } catch { /* */ }
  }

  async function handleChangeStatus(newStatus: string) {
    try {
      await api.put(`/parc-machines/${machineId}`, { statut: newStatus });
      loadMachine();
      setShowStatusMenu(false);
      setShowMoreMenu(false);
    } catch { /* */ }
  }

  if (loading || !machine) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  const catBadge = CATEGORIE_BADGES[machine.categorie] || CATEGORIE_BADGES.Copieur;
  const statBadge = STATUT_BADGES[machine.statut] || STATUT_BADGES['En service'];
  const isCopieur = machine.categorie === 'Copieur';
  const daysAgo = daysSince(machine.date_dernier_releve);

  const hasFirstReleve = !!(machine.date_dernier_releve);
  const volumeNb = releveForm.compteur_nb
    ? (parseInt(releveForm.compteur_nb) || 0) - (editingReleve ? 0 : machine.dernier_compteur_nb)
    : null;
  const volumeCouleur = releveForm.compteur_couleur
    ? (parseInt(releveForm.compteur_couleur) || 0) - (editingReleve ? 0 : machine.dernier_compteur_couleur)
    : null;

  const lastReleve = releves[0];
  const prevReleve = releves[1];
  const hasConsommation = isCopieur && lastReleve && prevReleve;

  const tabs = [
    { key: 'infos' as const, label: 'Informations' },
    ...(isCopieur ? [{ key: 'releves' as const, label: `Relevés compteurs${relevesTotal ? ` (${relevesTotal})` : ''}` }] : []),
    { key: 'historique' as const, label: 'Historique' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/parc-machines')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{machine.designation}</h1>
              <span className="px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 text-sm font-mono font-medium">{machine.numero_serie}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${catBadge}`}>{machine.categorie}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statBadge.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statBadge.dot}`} />{machine.statut}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(`/dashboard/parc-machines/${machineId}/modifier`)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
            Modifier
          </button>
          {isCopieur && (
            <button onClick={openNewReleveModal}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 cursor-pointer">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Nouveau relevé
            </button>
          )}
          <div className="relative">
            <button onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-100 rounded-lg shadow-lg z-20 py-1">
                <div className="relative">
                  <button onClick={() => setShowStatusMenu(!showStatusMenu)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center justify-between">
                    Changer le statut
                    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  </button>
                  {showStatusMenu && (
                    <div className="absolute left-full top-0 ml-1 w-44 bg-white border border-gray-100 rounded-lg shadow-lg py-1">
                      {['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'].map(s => (
                        <button key={s} onClick={() => handleChangeStatus(s)}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer ${machine.statut === s ? 'font-semibold text-blue-600' : 'text-gray-700'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="border-b border-gray-100">
              <div className="flex">
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${activeTab === tab.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {/* Onglet Informations */}
              {activeTab === 'infos' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Identification</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-xs text-gray-400 mb-0.5">N° Série</p><p className="text-sm font-mono font-medium text-gray-900">{machine.numero_serie}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Matricule</p><p className="text-sm text-gray-700">{machine.matricule || '—'}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Désignation</p><p className="text-sm font-medium text-gray-900">{machine.designation}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Marque</p><p className="text-sm text-gray-700">{machine.marque || '—'}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Modèle</p><p className="text-sm text-gray-700">{machine.modele || '—'}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Catégorie</p><p className="text-sm text-gray-700">{machine.categorie}</p></div>
                      {machine.reference_produit && (
                        <div><p className="text-xs text-gray-400 mb-0.5">Référence produit</p><p className="text-sm text-blue-600">{machine.reference_produit}</p></div>
                      )}
                    </div>
                  </div>
                  <hr className="border-gray-100" />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Localisation</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-xs text-gray-400 mb-0.5">Client</p>{machine.client_raison_sociale ? <Link href={`/dashboard/clients/${machine.client_id}`} className="text-sm font-medium text-blue-600 hover:underline">{machine.client_raison_sociale} <span className="text-gray-400 font-normal">({machine.client_code})</span></Link> : <p className="text-sm text-gray-400">—</p>}</div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Site d&apos;installation</p><p className="text-sm text-gray-700">{machine.site_installation || '—'}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Date d&apos;installation</p><p className="text-sm text-gray-700">{formatDate(machine.date_installation)}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Fin de garantie</p><p className="text-sm text-gray-700">{formatDate(machine.date_fin_garantie)}</p></div>
                    </div>
                  </div>

                  {/* Coûts copie */}
                  {isCopieur && (machine.cout_copie_nb || machine.cout_copie_couleur || machine.volume_offert_nb || machine.volume_offert_couleur) && (
                    <>
                      <hr className="border-gray-100" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Coûts copie</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div><p className="text-xs text-gray-400 mb-0.5">Coût copie N/B</p><p className="text-sm font-medium text-gray-900">{formatCurrency(machine.cout_copie_nb)}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Coût copie Couleur</p><p className="text-sm font-medium text-gray-900">{formatCurrency(machine.cout_copie_couleur)}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Volume offert N/B</p><p className="text-sm text-gray-700">{formatNumber(machine.volume_offert_nb)}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Volume offert Couleur</p><p className="text-sm text-gray-700">{formatNumber(machine.volume_offert_couleur)}</p></div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Détails techniques — Copieur */}
                  {isCopieur && (
                    <>
                      <hr className="border-gray-100" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Détails techniques</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div><p className="text-xs text-gray-400 mb-0.5">Vitesse</p><p className="text-sm text-gray-700">{machine.vitesse_ppm ? `${machine.vitesse_ppm} ppm` : '—'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Format max</p><p className="text-sm text-gray-700">{machine.format_max || '—'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Recto/verso</p><p className="text-sm text-gray-700">{machine.recto_verso ? 'Oui' : 'Non'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Réseau</p><p className="text-sm text-gray-700">{machine.reseau ? 'Oui' : 'Non'}</p></div>
                        </div>
                      </div>
                    </>
                  )}
                  {machine.categorie === 'Téléphonie' && (
                    <>
                      <hr className="border-gray-100" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Détails techniques</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div><p className="text-xs text-gray-400 mb-0.5">Type</p><p className="text-sm text-gray-700">{machine.type_equipement_tel || '—'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Postes</p><p className="text-sm text-gray-700">{machine.nb_postes || '—'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Protocole</p><p className="text-sm text-gray-700">{machine.protocole || '—'}</p></div>
                        </div>
                      </div>
                    </>
                  )}
                  {machine.categorie === 'Informatique' && (
                    <>
                      <hr className="border-gray-100" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Détails techniques</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div><p className="text-xs text-gray-400 mb-0.5">Type</p><p className="text-sm text-gray-700">{machine.type_equipement_info || '—'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Processeur</p><p className="text-sm text-gray-700">{machine.processeur || '—'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">RAM</p><p className="text-sm text-gray-700">{machine.ram || '—'}</p></div>
                          <div><p className="text-xs text-gray-400 mb-0.5">Stockage</p><p className="text-sm text-gray-700">{machine.stockage || '—'}</p></div>
                          <div className="col-span-2"><p className="text-xs text-gray-400 mb-0.5">OS</p><p className="text-sm text-gray-700">{machine.systeme_exploitation || '—'}</p></div>
                        </div>
                      </div>
                    </>
                  )}

                  {machine.notes && (
                    <>
                      <hr className="border-gray-100" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{machine.notes}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Onglet Relevés compteurs */}
              {activeTab === 'releves' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">{relevesTotal} relevé{relevesTotal > 1 ? 's' : ''}</p>
                    <div className="flex gap-2">
                      <button onClick={() => router.push('/dashboard/parc-machines/import-releves')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">
                        Importer des relevés
                      </button>
                      <button onClick={openNewReleveModal}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer">
                        + Nouveau relevé
                      </button>
                    </div>
                  </div>

                  {relevesLoading ? (
                    <div className="text-center py-8"><div className="h-6 w-6 mx-auto rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" /></div>
                  ) : releves.length === 0 ? (
                    <div className="text-center py-8 text-gray-400"><p className="text-sm">Aucun relevé enregistré</p></div>
                  ) : (
                    <div className="overflow-x-auto -mx-6">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50/50">
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Période</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Compt. N/B</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Compt. Couleur</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Vol. N/B</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Vol. Couleur</th>
                            <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Source</th>
                            <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Facturé</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {releves.map((r, idx) => {
                            const isInit = idx === releves.length - 1 && r.volume_nb === 0 && r.volume_couleur === 0;
                            return (
                              <tr key={r.id} className="hover:bg-gray-50/50">
                                <td className="px-4 py-2.5">
                                  <p className="text-sm text-gray-900">{formatDate(r.date_releve)}</p>
                                </td>
                                <td className="px-4 py-2.5">
                                  {r.date_debut_periode ? (
                                    <p className="text-[11px] text-gray-400">du {formatDate(r.date_debut_periode)} au {formatDate(r.date_fin_periode)}</p>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900 tabular-nums">{formatNumber(r.compteur_nb)}</td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900 tabular-nums">{formatNumber(r.compteur_couleur)}</td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums">
                                  {isInit ? <span className="text-gray-400 text-xs">Init.</span>
                                    : <span className="text-emerald-600">{r.volume_nb > 0 ? `+${formatNumber(r.volume_nb)}` : formatNumber(r.volume_nb)}</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums">
                                  {isInit ? <span className="text-gray-400 text-xs">Init.</span>
                                    : <span className="text-emerald-600">{r.volume_couleur > 0 ? `+${formatNumber(r.volume_couleur)}` : formatNumber(r.volume_couleur)}</span>}
                                </td>
                                <td className="px-4 py-2.5 text-center"><span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${SOURCE_BADGES[r.source] || SOURCE_BADGES.Manuel}`}>{r.source}</span></td>
                                <td className="px-4 py-2.5 text-center">
                                  {r.est_facture
                                    ? <svg className="h-4 w-4 mx-auto text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <button onClick={() => openEditReleveModal(r)} className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer" title="Modifier">
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                                    </button>
                                    <button onClick={() => handleDeleteReleve(r.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer" title="Supprimer">
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Onglet Historique — Timeline enrichie */}
              {activeTab === 'historique' && (
                <div className="space-y-4">
                  {timelineLoading ? (
                    <div className="text-center py-8"><div className="h-6 w-6 mx-auto rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" /></div>
                  ) : (
                    <div className="border-l-2 border-gray-200 ml-3 pl-6 space-y-6">
                      {machine.date_installation && (
                        <div className="relative">
                          <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-blue-500 border-2 border-white" />
                          <p className="text-xs text-gray-400">{formatDate(machine.date_installation)}</p>
                          <p className="text-sm font-medium text-gray-900">Installation</p>
                          <p className="text-xs text-gray-500">Machine installée{machine.client_raison_sociale ? ` chez ${machine.client_raison_sociale}` : ''}</p>
                        </div>
                      )}
                      {timeline.length > 0 ? timeline.map(entry => {
                        const isAnnule = entry.import_statut === 'Annule';
                        return (
                          <div key={entry.releve_id} className={`relative ${isAnnule ? 'opacity-50' : ''}`}>
                            <div className={`absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-2 border-white ${
                              isAnnule ? 'bg-red-400' : entry.est_facture ? 'bg-emerald-500' : 'bg-amber-400'
                            }`} />
                            <p className="text-xs text-gray-400">{formatDate(entry.date_releve)}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900">Relevé compteur</p>
                              {entry.numero_batch && (
                                <Link href={`/dashboard/parc-machines/imports/${entry.import_id}`} className="text-[11px] font-mono text-blue-600 hover:underline">
                                  {entry.numero_batch}
                                </Link>
                              )}
                              {isAnnule && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">Import annulé</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Compteur NB: {formatNumber(entry.compteur_nb)} &bull; Couleur: {formatNumber(entry.compteur_couleur)}
                            </p>
                            {(entry.volume_nb > 0 || entry.volume_couleur > 0) && (
                              <p className="text-xs text-emerald-600 mt-0.5">
                                Volume période: +{formatNumber(entry.volume_nb)} NB / +{formatNumber(entry.volume_couleur)} couleur
                              </p>
                            )}
                            {entry.volume_nb === 0 && entry.volume_couleur === 0 && (
                              <p className="text-xs text-gray-400 mt-0.5">Volume période: Initialisation</p>
                            )}
                            {entry.factures && entry.factures.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {entry.factures.map(f => (
                                  <Link key={f.id} href={`/dashboard/factures/${f.id}`}
                                    className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600">
                                    <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                    <span className="font-mono font-medium">{f.numero}</span>
                                    <span>({formatDate(f.date)})</span>
                                    <span className="font-medium">{f.montant_ttc?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € TTC</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }) : machine.derniers_releves?.map(r => (
                        <div key={r.id} className="relative">
                          <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white" />
                          <p className="text-xs text-gray-400">{formatDate(r.date_releve)}</p>
                          <p className="text-sm font-medium text-gray-900">Relevé compteur</p>
                          <p className="text-xs text-gray-500">NB: {formatNumber(r.compteur_nb)} / Couleur: {formatNumber(r.compteur_couleur)} ({r.source})</p>
                        </div>
                      ))}
                      <div className="relative">
                        <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-gray-300 border-2 border-white" />
                        <p className="text-xs text-gray-400">{formatDate(machine.created_at)}</p>
                        <p className="text-sm font-medium text-gray-900">Création fiche</p>
                        <p className="text-xs text-gray-500">Machine ajoutée au parc</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column (2/5) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contrat lié */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Contrat lié</h3>
            {machine.contrat_detail ? (
              <div className="space-y-2">
                <Link href={`/dashboard/contrats/${machine.contrat_detail.id}`} className="text-sm font-semibold text-blue-600 hover:underline">{machine.contrat_detail.numero_contrat}</Link>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-gray-400">Type</p><p className="text-gray-700">{machine.contrat_detail.type_contrat}</p></div>
                  <div><p className="text-xs text-gray-400">Statut</p><p className="text-gray-700">{machine.contrat_detail.statut}</p></div>
                  <div><p className="text-xs text-gray-400">Échéance</p><p className="text-gray-700">{formatDate(machine.contrat_detail.date_echeance)}</p></div>
                  <div><p className="text-xs text-gray-400">Loyer HT</p><p className="text-gray-700">{machine.contrat_detail.loyer_ht?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</p></div>
                </div>
              </div>
            ) : machine.numero_contrat ? (
              <p className="text-sm text-gray-500">Contrat <span className="font-medium">{machine.numero_contrat}</span></p>
            ) : (
              <p className="text-sm text-gray-400">Aucun contrat lié</p>
            )}
          </div>

          {/* Compteurs actuels */}
          {isCopieur && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Compteurs actuels</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Noir & Blanc</p>
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{formatNumber(machine.dernier_compteur_nb)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Couleur</p>
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{formatNumber(machine.dernier_compteur_couleur)}</p>
                </div>
                <hr className="border-gray-100" />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">Dernier relevé</p>
                  <p className={`text-xs font-medium ${daysAgo && daysAgo > 90 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {machine.date_dernier_releve
                      ? `${formatDate(machine.date_dernier_releve)} (il y a ${daysAgo}j)`
                      : 'Aucun relevé'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Consommation période */}
          {hasConsommation && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Consommation dernière période</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Volume N/B</p>
                  <p className="text-sm font-semibold text-gray-900">{formatNumber(lastReleve.volume_nb)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Volume Couleur</p>
                  <p className="text-sm font-semibold text-gray-900">{formatNumber(lastReleve.volume_couleur)}</p>
                </div>
                {(machine.volume_offert_nb > 0 || machine.volume_offert_couleur > 0) && (
                  <>
                    <hr className="border-gray-100" />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">Offert N/B</p>
                      <p className="text-xs text-gray-500">{formatNumber(machine.volume_offert_nb)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">Offert Couleur</p>
                      <p className="text-xs text-gray-500">{formatNumber(machine.volume_offert_couleur)}</p>
                    </div>
                    {(() => {
                      const depNb = lastReleve.volume_nb - machine.volume_offert_nb;
                      const depCoul = lastReleve.volume_couleur - machine.volume_offert_couleur;
                      const hasDep = depNb > 0 || depCoul > 0;
                      if (!hasDep) return (
                        <div className="bg-emerald-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-emerald-700">Aucun dépassement</p>
                        </div>
                      );
                      const montantNb = depNb > 0 && machine.cout_copie_nb ? depNb * Number(machine.cout_copie_nb) : 0;
                      const montantCoul = depCoul > 0 && machine.cout_copie_couleur ? depCoul * Number(machine.cout_copie_couleur) : 0;
                      const totalDep = montantNb + montantCoul;
                      return (
                        <div className="bg-red-50 rounded-lg p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-red-700">Dépassement détecté</p>
                          {depNb > 0 && <p className="text-xs text-red-600">N/B : +{formatNumber(depNb)} copies{montantNb > 0 ? ` → ${montantNb.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : ''}</p>}
                          {depCoul > 0 && <p className="text-xs text-red-600">Couleur : +{formatNumber(depCoul)} copies{montantCoul > 0 ? ` → ${montantCoul.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : ''}</p>}
                          {totalDep > 0 && <p className="text-sm font-bold text-red-700 pt-1 border-t border-red-200">Total estimé : {totalDep.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT</p>}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Client */}
          {machine.client_id && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Informations client</h3>
              <div className="space-y-2">
                <Link href={`/dashboard/clients/${machine.client_id}`} className="text-sm font-semibold text-blue-600 hover:underline">{machine.client_raison_sociale}</Link>
                {machine.client_code && <p className="text-xs text-gray-400">{machine.client_code}</p>}
                {machine.client_telephone && <p className="text-sm text-gray-600">{machine.client_telephone}</p>}
                {machine.client_email && <p className="text-sm text-gray-600">{machine.client_email}</p>}
                {machine.client_nb_machines && (
                  <p className="text-xs text-gray-400 mt-2">{machine.client_nb_machines} machine{machine.client_nb_machines > 1 ? 's' : ''} chez ce client</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modale Nouveau/Modifier Relevé */}
      {showReleveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">{editingReleve ? 'Modifier le relevé' : 'Nouveau relevé'}</h3>
            <p className="text-sm text-gray-500 mt-1">{machine.designation} — {machine.numero_serie}</p>

            {!editingReleve && hasFirstReleve && (
              <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-xs text-gray-400 mb-1">Dernier relevé connu ({formatDate(machine.date_dernier_releve)})</p>
                <p className="text-gray-700">NB: <span className="font-semibold">{formatNumber(machine.dernier_compteur_nb)}</span> / Couleur: <span className="font-semibold">{formatNumber(machine.dernier_compteur_couleur)}</span></p>
              </div>
            )}
            {!editingReleve && !hasFirstReleve && (
              <div className="mt-3 bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                Premier relevé — les compteurs seront initialisés
              </div>
            )}

            {releveErrors._global && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{releveErrors._global}</div>}

            <form onSubmit={handleSaveReleve} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date du relevé *</label>
                  <input type="date" value={releveForm.date_releve} onChange={e => setReleveForm(p => ({ ...p, date_releve: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm" />
                  {releveErrors.date_releve && <p className="mt-1 text-xs text-red-500">{releveErrors.date_releve}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Début période</label>
                  <input type="date" value={releveForm.date_debut_periode} onChange={e => setReleveForm(p => ({ ...p, date_debut_periode: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fin période</label>
                  <input type="date" value={releveForm.date_fin_periode} onChange={e => setReleveForm(p => ({ ...p, date_fin_periode: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Compteur N/B *</label>
                  <input type="number" value={releveForm.compteur_nb} onChange={e => setReleveForm(p => ({ ...p, compteur_nb: e.target.value }))}
                    className={`w-full rounded-lg border ${releveErrors.compteur_nb ? 'border-red-300' : 'border-gray-200'} py-2 px-3 text-sm`} placeholder="0" />
                  {releveErrors.compteur_nb && <p className="mt-1 text-xs text-red-500">{releveErrors.compteur_nb}</p>}
                  {!editingReleve && volumeNb !== null && !releveErrors.compteur_nb && (
                    hasFirstReleve ? (
                      <p className={`mt-1 text-xs font-medium ${volumeNb >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Volume: {volumeNb >= 0 ? '+' : ''}{formatNumber(volumeNb)}</p>
                    ) : (
                      <p className="mt-1 text-xs text-blue-500">Initialisation (volume = 0)</p>
                    )
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Compteur Couleur *</label>
                  <input type="number" value={releveForm.compteur_couleur} onChange={e => setReleveForm(p => ({ ...p, compteur_couleur: e.target.value }))}
                    className={`w-full rounded-lg border ${releveErrors.compteur_couleur ? 'border-red-300' : 'border-gray-200'} py-2 px-3 text-sm`} placeholder="0" />
                  {releveErrors.compteur_couleur && <p className="mt-1 text-xs text-red-500">{releveErrors.compteur_couleur}</p>}
                  {!editingReleve && volumeCouleur !== null && !releveErrors.compteur_couleur && (
                    hasFirstReleve ? (
                      <p className={`mt-1 text-xs font-medium ${volumeCouleur >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Volume: {volumeCouleur >= 0 ? '+' : ''}{formatNumber(volumeCouleur)}</p>
                    ) : (
                      <p className="mt-1 text-xs text-blue-500">Initialisation (volume = 0)</p>
                    )
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={releveForm.notes} onChange={e => setReleveForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm resize-none" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowReleveModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">Annuler</button>
                <button type="submit" disabled={releveSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                  {releveSaving ? 'Enregistrement...' : editingReleve ? 'Mettre à jour' : 'Enregistrer le relevé'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
