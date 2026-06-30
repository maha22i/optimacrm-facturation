'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ApiResponse } from '@/lib/types';

// ─── Types (réponse publique du backend) ─────────────────────────────────────

interface LignePublique {
  id: number;
  ordre: number;
  type: 'PRODUIT' | 'SERVICE' | 'COMMENTAIRE' | 'SAUT_DE_LIGNE' | 'SOUS_TOTAL';
  reference: string | null;
  designation: string | null;
  description_detaillee: string | null;
  unite: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  remise_ligne_type: 'POURCENTAGE' | 'MONTANT_FIXE';
  remise_ligne_valeur: number;
  taux_tva: number;
  montant_ht: number;
  est_optionnel: boolean;
}

interface SocietePublique {
  raison_sociale: string | null;
  logo_url: string | null;
  adresse_ligne1: string | null;
  adresse_ligne2: string | null;
  code_postal: string | null;
  ville: string | null;
  telephone: string | null;
  email_contact: string | null;
  site_web: string | null;
}

interface DevisPublic {
  numero: string;
  statut: 'ENVOYE' | 'ACCEPTE' | 'FACTURE';
  objet: string | null;
  client: { raison_sociale: string };
  societe: SocietePublique;
  date_emission: string | null;
  date_validite: string | null;
  lignes: LignePublique[];
  remise_globale_type: 'POURCENTAGE' | 'MONTANT_FIXE';
  remise_globale_valeur: number;
  montant_ht: number;
  montant_remise: number;
  montant_ht_apres_remise: number;
  montant_tva: number;
  montant_ttc: number;
  conditions_generales: string | null;
  message_client: string | null;
  email_verifie: boolean;
  date_signature: string | null;
  signataire_nom: string | null;
}

type EtatPage =
  | { type: 'chargement' }
  | { type: 'introuvable' }
  | { type: 'expire'; dateValidite?: string | null }
  | { type: 'indisponible' }
  | { type: 'ok'; devis: DevisPublic };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateHeure(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
}

// ─── Canvas de signature manuscrite (natif, souris + tactile) ────────────────

function SignatureCanvas({ onChange }: { onChange: (vide: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
    }
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      onChange(false);
    }
  };

  const end = () => { drawing.current = false; };

  const effacer = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    hasInk.current = false;
    onChange(true);
  };

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-44 cursor-crosshair touch-none block"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-400">Signez dans le cadre ci-dessus (souris ou doigt)</p>
        <button
          type="button"
          onClick={effacer}
          className="text-xs font-medium text-gray-500 hover:text-red-600 transition cursor-pointer"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}

// Référence externe pour exporter le canvas en PNG
function exporterSignature(): string | null {
  const canvas = document.querySelector<HTMLCanvasElement>('#zone-signature canvas');
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}

// ─── Écrans d'état ───────────────────────────────────────────────────────────

function EcranMessage({ icone, titre, texte }: { icone: React.ReactNode; titre: string; texte: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-md w-full p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mb-5">{icone}</div>
        <h1 className="text-lg font-bold text-gray-900">{titre}</h1>
        <p className="mt-2 text-sm text-gray-500">{texte}</p>
      </div>
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function SignerDevisPage() {
  const params = useParams();
  const token = params.token as string;

  const [etat, setEtat] = useState<EtatPage>({ type: 'chargement' });

  // Flux de vérification / signature
  const [etape, setEtape] = useState<'consultation' | 'code' | 'signature' | 'confirme'>('consultation');
  const [emailMasque, setEmailMasque] = useState('');
  const [code, setCode] = useState('');
  const [signataireNom, setSignataireNom] = useState('');
  const [bonPourAccord, setBonPourAccord] = useState(false);
  const [signatureVide, setSignatureVide] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  const chargerDevis = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<DevisPublic>>(`/public/devis/${token}`);
      setEtat({ type: 'ok', devis: res.data });
      if (res.data.email_verifie && res.data.statut === 'ENVOYE') {
        // Email déjà vérifié lors d'une visite précédente
        setEtape('consultation');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410) { setEtat({ type: 'expire' }); return; }
        if (err.status === 404) { setEtat({ type: 'introuvable' }); return; }
        if (err.status === 409) { setEtat({ type: 'indisponible' }); return; }
      }
      setEtat({ type: 'introuvable' });
    }
  }, [token]);

  useEffect(() => { chargerDevis(); }, [chargerDevis]);

  const demanderCode = async () => {
    setErreur('');
    setEnCours(true);
    try {
      const res = await api.post<ApiResponse<{ email_masque: string }>>(`/public/devis/${token}/demander-code`, {});
      setEmailMasque(res.data.email_masque || '');
      setEtape('code');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur lors de l\'envoi du code');
    } finally {
      setEnCours(false);
    }
  };

  const verifierCode = async () => {
    setErreur('');
    setEnCours(true);
    try {
      await api.post(`/public/devis/${token}/verifier-code`, { code });
      setEtape('signature');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Code incorrect ou expiré');
    } finally {
      setEnCours(false);
    }
  };

  const signer = async () => {
    setErreur('');
    const signature = exporterSignature();
    if (!signature || signatureVide) { setErreur('Veuillez signer dans le cadre prévu'); return; }
    if (!signataireNom.trim()) { setErreur('Veuillez indiquer le nom du signataire'); return; }
    if (!bonPourAccord) { setErreur('Veuillez cocher la case « Bon pour accord »'); return; }

    setEnCours(true);
    try {
      await api.post(`/public/devis/${token}/signer`, {
        signataire_nom: signataireNom.trim(),
        signature_base64: signature,
      });
      setEtape('confirme');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur lors de la signature');
    } finally {
      setEnCours(false);
    }
  };

  // ── États d'erreur globaux ──────────────────────────────────────────────

  if (etat.type === 'chargement') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-9 w-9 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (etat.type === 'introuvable') {
    return (
      <EcranMessage
        icone={<svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
        titre="Devis introuvable"
        texte="Ce lien de signature n'est pas valide ou n'existe plus. Vérifiez le lien reçu par email ou contactez votre interlocuteur commercial."
      />
    );
  }

  if (etat.type === 'expire') {
    return (
      <EcranMessage
        icone={<svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
        titre="Ce devis a expiré"
        texte="La date de validité de ce devis est dépassée. Contactez votre interlocuteur commercial pour obtenir un nouveau devis."
      />
    );
  }

  if (etat.type === 'indisponible') {
    return (
      <EcranMessage
        icone={<svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
        titre="Devis non disponible"
        texte="Ce devis n'est plus disponible à la signature. Contactez votre interlocuteur commercial pour plus d'informations."
      />
    );
  }

  const devis = etat.devis;
  const dejaSigne = devis.statut === 'ACCEPTE' || devis.statut === 'FACTURE';
  const s = devis.societe;

  // ── Écran de confirmation après signature ───────────────────────────────

  if (etape === 'confirme') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-md w-full p-10 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Devis signé avec succès</h1>
          <p className="mt-3 text-sm text-gray-500">
            Le devis <span className="font-semibold text-gray-700">{devis.numero}</span> a bien été signé.
            Un email de confirmation vous a été envoyé avec le devis signé en pièce jointe.
          </p>
        </div>
      </div>
    );
  }

  const lignesAffichables = devis.lignes.filter(l => l.designation || l.type !== 'PRODUIT');

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── Entête société ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo_url} alt={s.raison_sociale || 'Logo'} className="h-12 w-auto object-contain shrink-0" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                {(s.raison_sociale || 'O').substring(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{s.raison_sociale || ''}</p>
              <p className="text-xs text-gray-400 truncate">
                {[s.adresse_ligne1, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(' — ')}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Devis</p>
            <p className="font-mono font-bold text-blue-700">{devis.numero}</p>
          </div>
        </div>

        {/* ── Bandeau déjà signé ── */}
        {dejaSigne && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex items-start gap-3">
            <svg className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Ce devis a déjà été signé le {formatDateHeure(devis.date_signature)}</p>
              {devis.signataire_nom && <p className="text-xs text-emerald-700 mt-0.5">Signataire : {devis.signataire_nom}</p>}
            </div>
          </div>
        )}

        {/* ── Devis ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Client</p>
              <p className="text-base font-bold text-gray-900">{devis.client.raison_sociale}</p>
            </div>
            <div className="text-sm text-gray-500 sm:text-right">
              <p>Émis le : <span className="font-medium text-gray-700">{formatDate(devis.date_emission)}</span></p>
              <p>Valable jusqu&apos;au : <span className="font-medium text-gray-700">{formatDate(devis.date_validite)}</span></p>
            </div>
          </div>

          {devis.objet && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg px-5 py-3 mb-6">
              <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">Objet</p>
              <p className="text-sm font-semibold text-white mt-0.5">{devis.objet}</p>
            </div>
          )}

          {/* Tableau des lignes */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Désignation</th>
                  <th className="text-right py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[70px]">Qté</th>
                  <th className="text-right py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[110px]">P.U. HT</th>
                  <th className="text-right py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[110px]">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {lignesAffichables.map((l) => {
                  if (l.type === 'COMMENTAIRE') {
                    return (
                      <tr key={l.id} className="border-b border-gray-50">
                        <td colSpan={4} className="py-2.5 px-2 text-sm italic text-gray-500">{l.designation}</td>
                      </tr>
                    );
                  }
                  if (l.type === 'SAUT_DE_LIGNE') {
                    return <tr key={l.id}><td colSpan={4} className="py-1"><hr className="border-gray-200" /></td></tr>;
                  }
                  if (l.type === 'SOUS_TOTAL') {
                    return (
                      <tr key={l.id} className="border-b border-gray-200 bg-gray-50">
                        <td colSpan={3} className="py-2.5 px-2 text-right text-sm font-bold text-gray-700">{l.designation || 'Sous-total'}</td>
                        <td className="py-2.5 px-2 text-right text-sm font-bold text-gray-900">{formatCurrency(l.montant_ht)}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={l.id} className={`border-b border-gray-50 ${l.est_optionnel ? 'bg-blue-50/30' : ''}`}>
                      <td className="py-2.5 px-2">
                        <p className={`text-sm text-gray-900 ${l.est_optionnel ? 'italic' : ''}`}>
                          {l.designation}
                          {l.est_optionnel && <span className="ml-2 text-xs text-blue-500 font-medium">(Option)</span>}
                        </p>
                        {l.description_detaillee && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap">{l.description_detaillee}</p>}
                      </td>
                      <td className="py-2.5 px-2 text-right text-sm text-gray-700">{l.quantite}{l.unite ? <span className="text-xs text-gray-400 ml-0.5">{l.unite}</span> : ''}</td>
                      <td className="py-2.5 px-2 text-right text-sm text-gray-700">{formatCurrency(l.prix_unitaire_ht)}</td>
                      <td className="py-2.5 px-2 text-right text-sm font-semibold text-gray-900">{formatCurrency(l.montant_ht)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="flex justify-end mb-6">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Total HT</span><span className="font-medium text-gray-900">{formatCurrency(devis.montant_ht)}</span></div>
              {devis.montant_remise > 0 && (
                <div className="flex justify-between text-red-600"><span>Remise{devis.remise_globale_type === 'POURCENTAGE' ? ` (${devis.remise_globale_valeur}%)` : ''}</span><span>-{formatCurrency(devis.montant_remise)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-600">TVA</span><span className="font-medium text-gray-900">{formatCurrency(devis.montant_tva)}</span></div>
              <div className="flex justify-between border-t-2 border-gray-900 pt-2 mt-2">
                <span className="font-bold text-gray-900">Total TTC</span>
                <span className="text-lg font-bold text-gray-900">{formatCurrency(devis.montant_ttc)}</span>
              </div>
            </div>
          </div>

          {devis.message_client && (
            <div className="mb-6">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Message</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{devis.message_client}</p>
            </div>
          )}

          {devis.conditions_generales && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Conditions générales de vente</p>
              <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{devis.conditions_generales}</p>
            </div>
          )}
        </div>

        {/* ── Bloc signature (uniquement si statut ENVOYE) ── */}
        {!dejaSigne && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
            {erreur && (
              <div className="mb-5 rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2.5">
                <svg className="h-4 w-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                <p className="text-xs text-red-700 font-medium">{erreur}</p>
              </div>
            )}

            {/* Étape A → B : déclenchement vérification */}
            {etape === 'consultation' && (
              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-900">Signer ce devis</h2>
                <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
                  Pour garantir votre identité, un code de vérification sera envoyé
                  à l&apos;adresse email à laquelle ce devis a été adressé.
                </p>
                <button
                  type="button"
                  onClick={devis.email_verifie ? () => setEtape('signature') : demanderCode}
                  disabled={enCours}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {enCours ? (
                    <><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Envoi du code...</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>Signer le devis</>
                  )}
                </button>
              </div>
            )}

            {/* Étape B : saisie du code */}
            {etape === 'code' && (
              <div className="max-w-sm mx-auto text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Vérification de votre identité</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Un code de vérification a été envoyé à <span className="font-semibold text-gray-700">{emailMasque}</span>.
                  Il est valable 15 minutes.
                </p>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  className="mt-5 w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-center text-2xl font-mono tracking-[0.5em] text-gray-900 placeholder-gray-300 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition"
                />
                <button
                  type="button"
                  onClick={verifierCode}
                  disabled={enCours || code.length !== 6}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {enCours ? 'Vérification...' : 'Vérifier le code'}
                </button>
                <button
                  type="button"
                  onClick={demanderCode}
                  disabled={enCours}
                  className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-700 transition cursor-pointer disabled:opacity-50"
                >
                  Renvoyer un code
                </button>
              </div>
            )}

            {/* Étape C : signature manuscrite */}
            {etape === 'signature' && (
              <div className="max-w-lg mx-auto">
                <h2 className="text-lg font-bold text-gray-900 text-center">Signature du devis</h2>
                <p className="mt-1 mb-6 text-sm text-gray-500 text-center">
                  Montant : <span className="font-bold text-gray-900">{formatCurrency(devis.montant_ttc)} TTC</span>
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Nom du signataire <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={signataireNom}
                      onChange={e => setSignataireNom(e.target.value)}
                      placeholder="Prénom et nom"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition"
                    />
                  </div>

                  <div id="zone-signature">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Signature manuscrite <span className="text-red-500">*</span>
                    </label>
                    <SignatureCanvas onChange={setSignatureVide} />
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={bonPourAccord}
                      onChange={e => setBonPourAccord(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700">
                      <span className="font-semibold">Bon pour accord</span> — je reconnais avoir pris connaissance
                      du devis {devis.numero} et j&apos;en accepte les conditions.
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={signer}
                    disabled={enCours || signatureVide || !signataireNom.trim() || !bonPourAccord}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {enCours ? (
                      <><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Signature en cours...</>
                    ) : (
                      <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Valider et signer</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Document signé électroniquement via OptimaCRM — l&apos;adresse IP et la date de signature sont horodatées.
        </p>
      </div>
    </div>
  );
}
