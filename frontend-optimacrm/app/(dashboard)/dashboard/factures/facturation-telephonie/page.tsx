'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import FacturesTypeListTab from '@/components/factures/FacturesTypeListTab';
import GenerationAbonnementTab from '@/components/factures/GenerationAbonnementTab';

const CONFIG = {
  gradient: 'from-amber-500 to-orange-600',
  shadow: 'shadow-amber-500/20',
  bgAccent: 'bg-amber-50',
  textAccent: 'text-amber-700',
  borderAccent: 'border-amber-200',
};

export default function FacturationTelephoniePage() {
  const { user } = useAuth();
  // La génération d'abonnements dépend des contrats (backend gated par
  // requireModule('contrats') sur /factures/contrats-abonnement-a-facturer
  // et /factures/generer-abonnement) : sans ce module, seule la liste reste utile.
  const contratsModuleActive = user?.modules_actifs?.contrats !== false;
  const [activeTab, setActiveTab] = useState<'liste' | 'generation'>('liste');

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
              </svg>
            </span>
            Facturation Téléphonie
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Gestion des factures téléphonie</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setActiveTab('liste')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${activeTab === 'liste' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
            Factures
          </span>
        </button>
        {contratsModuleActive && (
          <button
            onClick={() => setActiveTab('generation')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${activeTab === 'generation' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>
              Générer
            </span>
          </button>
        )}
      </div>

      {/* Content */}
      {activeTab === 'liste' && <FacturesTypeListTab typeContrat="Telephonie" />}
      {activeTab === 'generation' && contratsModuleActive && <GenerationAbonnementTab typeContrat="Telephonie" config={CONFIG} />}
    </div>
  );
}
