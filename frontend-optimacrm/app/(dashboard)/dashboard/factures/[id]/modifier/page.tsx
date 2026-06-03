'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { FactureDetail, Client, ApiResponse, PaginatedResponse, TypeLigneFacture } from '@/lib/types';

interface LigneForm {
  type_ligne: TypeLigneFacture;
  reference: string;
  designation: string;
  description: string;
  quantite: string;
  prix_unitaire: string;
  remise_pourcentage: string;
  taux_tva: string;
}

function emptyLigne(type: TypeLigneFacture = 'PRODUIT'): LigneForm {
  return { type_ligne: type, reference: '', designation: '', description: '', quantite: '1', prix_unitaire: '0', remise_pourcentage: '0', taux_tva: '20' };
}

function calcLigneHt(l: LigneForm): number {
  if (['COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'].includes(l.type_ligne)) return 0;
  const q = parseFloat(l.quantite) || 0;
  const p = parseFloat(l.prix_unitaire) || 0;
  const r = parseFloat(l.remise_pourcentage) || 0;
  return Math.round(q * p * (1 - r / 100) * 100) / 100;
}

function fmt(v: number | string) {
  return parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ModifierFacturePage() {
  const router = useRouter();
  const params = useParams();
  const factureId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<{ id: number; raison_sociale: string; numero_client: string } | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const [form, setForm] = useState({
    date_echeance: '',
    periode_debut: '',
    periode_fin: '',
    mode_reglement: 'Prélèvement',
    frais_techniques: '0',
    eco_contribution: '0',
    taux_tva: '20',
    notes: '',
    site_concerne_nom: '',
    site_concerne_adresse: '',
    site_concerne_cp: '',
    site_concerne_ville: '',
    site_concerne_email: '',
  });

  const [lignes, setLignes] = useState<LigneForm[]>([]);
  const [saving, setSaving] = useState(false);

  const loadFacture = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<FactureDetail>>(`/factures/${factureId}`);
      const f = res.data;
      if (!['Brouillon', 'Annulée'].includes(f.statut)) {
        router.push(`/dashboard/factures/${factureId}`);
        return;
      }

      setSelectedClient({ id: f.client_id, raison_sociale: f.client_raison_sociale || '', numero_client: f.code_client || '' });
      setClientSearch(f.client_raison_sociale || '');
      setForm({
        date_echeance: f.date_echeance?.slice(0, 10) || '',
        periode_debut: f.periode_debut?.slice(0, 10) || '',
        periode_fin: f.periode_fin?.slice(0, 10) || '',
        mode_reglement: f.mode_reglement || 'Prélèvement',
        frais_techniques: String(f.frais_techniques || 0),
        eco_contribution: String(f.eco_contribution || 0),
        taux_tva: String(f.taux_tva || 20),
        notes: f.notes || '',
        site_concerne_nom: f.site_concerne_nom || '',
        site_concerne_adresse: f.site_concerne_adresse || '',
        site_concerne_cp: f.site_concerne_cp || '',
        site_concerne_ville: f.site_concerne_ville || '',
        site_concerne_email: f.site_concerne_email || '',
      });
      setLignes(f.lignes.map(l => ({
        type_ligne: l.type_ligne,
        reference: l.reference || '',
        designation: l.designation || '',
        description: l.description || '',
        quantite: String(l.quantite),
        prix_unitaire: String(l.prix_unitaire),
        remise_pourcentage: String(l.remise_pourcentage || 0),
        taux_tva: String(l.taux_tva || 20),
      })));
    } catch {
      router.push('/dashboard/factures');
    } finally {
      setLoading(false);
    }
  }, [factureId, router]);

  useEffect(() => { loadFacture(); }, [loadFacture]);

  useEffect(() => {
    if (clientSearch.length < 2 || selectedClient) { setClientResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<PaginatedResponse<Client>>(`/clients?search=${encodeURIComponent(clientSearch)}&limit=8`);
        setClientResults(res.data);
        setShowClientDropdown(true);
      } catch { setClientResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch, selectedClient]);

  const selectClient = (c: Client) => {
    setSelectedClient({ id: c.id, raison_sociale: c.raison_sociale, numero_client: c.numero_client });
    setClientSearch(c.raison_sociale);
    setShowClientDropdown(false);
  };

  const updateLigne = (i: number, field: string, value: string) => {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const addLigne = (type: TypeLigneFacture = 'PRODUIT') => { setLignes(prev => [...prev, emptyLigne(type)]); };
  const removeLigne = (i: number) => { setLignes(prev => prev.filter((_, idx) => idx !== i)); };
  const moveLigne = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= lignes.length) return;
    setLignes(prev => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  };

  const totalHt = lignes.reduce((s, l) => s + calcLigneHt(l), 0);
  const ftc = parseFloat(form.frais_techniques) || 0;
  const ect = parseFloat(form.eco_contribution) || 0;
  const tva = parseFloat(form.taux_tva) || 20;
  const baseTva = totalHt + ftc + ect;
  const montantTva = Math.round(baseTva * (tva / 100) * 100) / 100;
  const totalTtc = Math.round((baseTva + montantTva) * 100) / 100;

  const handleSave = async (validate: boolean) => {
    if (!selectedClient) { alert('Veuillez sélectionner un client'); return; }
    setSaving(true);
    try {
      const body = {
        client_id: selectedClient.id,
        ...form,
        frais_techniques: parseFloat(form.frais_techniques) || 0,
        eco_contribution: parseFloat(form.eco_contribution) || 0,
        taux_tva: parseFloat(form.taux_tva) || 20,
        lignes: lignes.map((l, i) => ({
          ...l,
          position: i,
          quantite: parseFloat(l.quantite) || 1,
          prix_unitaire: parseFloat(l.prix_unitaire) || 0,
          remise_pourcentage: parseFloat(l.remise_pourcentage) || 0,
          taux_tva: parseFloat(l.taux_tva) || 20,
          total_ht: calcLigneHt(l),
        })),
      };

      await api.put(`/factures/${factureId}`, body);
      if (validate) {
        await api.post(`/factures/${factureId}/valider`, {});
      }
      router.push(`/dashboard/factures/${factureId}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-10 w-10 border-[3px] border-violet-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/dashboard/factures/${factureId}`)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Retour
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Modifier la facture</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          {/* Client & Infos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Client & Informations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                <input type="text" value={clientSearch} onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); }}
                  onFocus={() => clientResults.length > 0 && setShowClientDropdown(true)}
                  placeholder="Rechercher un client..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                {selectedClient && <p className="text-xs text-emerald-600 mt-1 font-medium">{selectedClient.raison_sociale} ({selectedClient.numero_client})</p>}
                {showClientDropdown && clientResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-xl max-h-48 overflow-y-auto">
                    {clientResults.map(c => (
                      <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-violet-50 transition cursor-pointer">
                        <span className="font-medium text-gray-900">{c.raison_sociale}</span>
                        <span className="ml-2 text-gray-400 text-xs">{c.numero_client}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode de règlement</label>
                <select value={form.mode_reglement} onChange={e => setForm(f => ({ ...f, mode_reglement: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none cursor-pointer">
                  {['Prélèvement', 'Virement', 'Chèque', 'Traite', 'CB'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d'échéance</label>
                <input type="date" value={form.date_echeance} onChange={e => setForm(f => ({ ...f, date_echeance: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Période début</label>
                <input type="date" value={form.periode_debut} onChange={e => setForm(f => ({ ...f, periode_debut: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Période fin</label>
                <input type="date" value={form.periode_fin} onChange={e => setForm(f => ({ ...f, periode_fin: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Site concerné</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={form.site_concerne_nom} onChange={e => setForm(f => ({ ...f, site_concerne_nom: e.target.value }))} placeholder="Nom" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                <input type="text" value={form.site_concerne_email} onChange={e => setForm(f => ({ ...f, site_concerne_email: e.target.value }))} placeholder="Email" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                <input type="text" value={form.site_concerne_adresse} onChange={e => setForm(f => ({ ...f, site_concerne_adresse: e.target.value }))} placeholder="Adresse" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                <div className="flex gap-2">
                  <input type="text" value={form.site_concerne_cp} onChange={e => setForm(f => ({ ...f, site_concerne_cp: e.target.value }))} placeholder="CP" className="w-24 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                  <input type="text" value={form.site_concerne_ville} onChange={e => setForm(f => ({ ...f, site_concerne_ville: e.target.value }))} placeholder="Ville" className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Lignes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Lignes de facture</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-gray-50/80">
                  <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase w-8"></th>
                  <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase w-[70px]">Réf</th>
                  <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase">Désignation</th>
                  <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase w-[80px]">Qté</th>
                  <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase w-[100px]">P.U HT</th>
                  <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase w-[70px]">Rem %</th>
                  <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase w-[100px]">Total HT</th>
                  <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase w-[60px]"></th>
                </tr></thead>
                <tbody>
                  {lignes.map((l, i) => {
                    if (l.type_ligne === 'COMMENTAIRE') return (
                      <tr key={i} className="bg-gray-50/50">
                        <td className="px-2 py-2 text-center"><div className="flex flex-col gap-0.5"><button onClick={() => moveLigne(i, -1)} className="text-gray-300 hover:text-gray-500 cursor-pointer"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg></button><button onClick={() => moveLigne(i, 1)} className="text-gray-300 hover:text-gray-500 cursor-pointer"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg></button></div></td>
                        <td colSpan={6} className="px-3 py-2"><input type="text" value={l.designation} onChange={e => updateLigne(i, 'designation', e.target.value)} placeholder="Commentaire..." className="w-full text-sm italic text-gray-500 bg-transparent border-0 outline-none" /></td>
                        <td className="px-2 py-2 text-center"><button onClick={() => removeLigne(i)} className="text-gray-300 hover:text-red-500 cursor-pointer"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button></td>
                      </tr>
                    );
                    if (l.type_ligne === 'SAUT_DE_LIGNE') return (
                      <tr key={i}><td /><td colSpan={6} className="py-1 border-b border-gray-200" /><td className="px-2 py-1 text-center"><button onClick={() => removeLigne(i)} className="text-gray-300 hover:text-red-500 cursor-pointer"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button></td></tr>
                    );
                    if (l.type_ligne === 'SOUS_TOTAL') return (
                      <tr key={i} className="bg-gray-50"><td /><td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">Sous-total</td><td className="px-3 py-2 text-right text-sm font-bold text-gray-900">{fmt(lignes.slice(0, i).reduce((s, ll) => s + calcLigneHt(ll), 0))} €</td><td className="px-2 py-2 text-center"><button onClick={() => removeLigne(i)} className="text-gray-300 hover:text-red-500 cursor-pointer"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button></td></tr>
                    );

                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/30">
                        <td className="px-2 py-2 text-center"><div className="flex flex-col gap-0.5"><button onClick={() => moveLigne(i, -1)} className="text-gray-300 hover:text-gray-500 cursor-pointer"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg></button><button onClick={() => moveLigne(i, 1)} className="text-gray-300 hover:text-gray-500 cursor-pointer"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg></button></div></td>
                        <td className="px-2 py-2"><input type="text" value={l.reference} onChange={e => updateLigne(i, 'reference', e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:border-violet-400 outline-none" /></td>
                        <td className="px-2 py-2">
                          <input type="text" value={l.designation} onChange={e => updateLigne(i, 'designation', e.target.value)} placeholder="Désignation" className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:border-violet-400 outline-none mb-1" />
                          <input type="text" value={l.description} onChange={e => updateLigne(i, 'description', e.target.value)} placeholder="Description" className="w-full text-xs text-gray-400 border border-gray-100 rounded-lg px-2 py-1 focus:border-violet-400 outline-none" />
                        </td>
                        <td className="px-2 py-2"><input type="number" step="any" value={l.quantite} onChange={e => updateLigne(i, 'quantite', e.target.value)} className="w-full text-sm text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:border-violet-400 outline-none" /></td>
                        <td className="px-2 py-2"><input type="number" step="any" value={l.prix_unitaire} onChange={e => updateLigne(i, 'prix_unitaire', e.target.value)} className="w-full text-sm text-right border border-gray-200 rounded-lg px-2 py-1.5 focus:border-violet-400 outline-none" /></td>
                        <td className="px-2 py-2"><input type="number" step="any" value={l.remise_pourcentage} onChange={e => updateLigne(i, 'remise_pourcentage', e.target.value)} className="w-full text-sm text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:border-violet-400 outline-none" /></td>
                        <td className="px-2 py-2 text-right text-sm font-semibold text-gray-900">{fmt(calcLigneHt(l))} €</td>
                        <td className="px-2 py-2 text-center"><button onClick={() => removeLigne(i)} className="text-gray-300 hover:text-red-500 cursor-pointer"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <button onClick={() => addLigne('PRODUIT')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 text-xs font-semibold hover:bg-violet-200 transition cursor-pointer">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Ligne
              </button>
              <button onClick={() => addLigne('COMMENTAIRE')} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition cursor-pointer">Commentaire</button>
              <button onClick={() => addLigne('SOUS_TOTAL')} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition cursor-pointer">Sous-total</button>
              <button onClick={() => addLigne('SAUT_DE_LIGNE')} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition cursor-pointer">Séparateur</button>
            </div>
          </div>

          {/* FTC / ECT */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Frais supplémentaires</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FTC</label>
                <input type="number" step="0.01" value={form.frais_techniques} onChange={e => setForm(f => ({ ...f, frais_techniques: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ECT</label>
                <input type="number" step="0.01" value={form.eco_contribution} onChange={e => setForm(f => ({ ...f, eco_contribution: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Notes internes</h2>
            <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes internes..."
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none resize-none" />
          </div>
        </div>

        {/* Colonne droite */}
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-24">
            <h2 className="font-semibold text-gray-900 mb-4">Récapitulatif</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Total HT</span><span className="font-semibold">{fmt(totalHt)} €</span></div>
              {ftc > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">FTC</span><span>{fmt(ftc)} €</span></div>}
              {ect > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">ECT</span><span>{fmt(ect)} €</span></div>}
              <div className="flex justify-between text-sm"><span className="text-gray-500">TVA {tva}%</span><span>{fmt(montantTva)} €</span></div>
              <div className="border-t border-gray-200 pt-2 flex justify-between text-lg font-bold text-violet-700"><span>TTC</span><span>{fmt(totalTtc)} €</span></div>
            </div>
            <div className="mt-6 space-y-3">
              <button onClick={() => handleSave(false)} disabled={saving} className="w-full px-5 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button onClick={() => handleSave(true)} disabled={saving} className="w-full px-5 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition cursor-pointer">
                {saving ? 'Enregistrement...' : 'Valider la facture'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
