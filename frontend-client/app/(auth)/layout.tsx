import type { ReactNode } from 'react';

const FEATURES = [
  { label: 'Factures & paiements', desc: 'Consultez et téléchargez en un clic' },
  { label: 'Suivi des tickets', desc: 'Restez informé en temps réel' },
  { label: 'Parc machines', desc: 'Visibilité complète sur vos équipements' },
];

/**
 * Coquille commune à toutes les pages d'authentification (login, mot de
 * passe oublié, réinitialisation) : panneau de marque à gauche, carte de
 * contenu à droite. Chaque page ne fournit que le contenu de la carte.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Left panel — brand / visual */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#0b0b1a] p-12 text-white">
        {/* Ambient gradient blobs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/40 blur-[110px]" />
        <div className="pointer-events-none absolute bottom-[-6rem] right-[-6rem] h-96 w-96 rounded-full bg-fuchsia-500/30 blur-[120px]" />
        <div className="pointer-events-none absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-cyan-400/20 blur-[100px]" />

        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-wide text-white/90">OptimaCRM</span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Votre espace client,
            <br />
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              simple et centralisé.
            </span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Suivez vos factures, contrats, tickets et votre parc machines depuis un seul endroit, en toute sécurité.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4">
            {FEATURES.map((item) => (
              <div key={item.label} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20">
                  <svg className="h-3 w-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white/90">{item.label}</p>
                  <p className="text-xs text-white/50">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/35">© {new Date().getFullYear()} OptimaCRM — Tous droits réservés</p>
      </div>

      {/* Right panel — content card */}
      <div className="relative flex items-center justify-center overflow-hidden bg-gray-50/70 px-6 py-12 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white to-fuchsia-50/60" />
        <div className="pointer-events-none absolute -top-24 right-[-4rem] h-72 w-72 rounded-full bg-indigo-200/30 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 left-[-4rem] h-72 w-72 rounded-full bg-fuchsia-200/30 blur-[100px]" />

        <div className="relative w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 shadow-lg shadow-indigo-500/30">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-900">OptimaCRM</span>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white/90 p-8 shadow-xl shadow-gray-200/60 backdrop-blur-sm sm:p-9">
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-gray-400 lg:hidden">Portail client OptimaCRM</p>
        </div>
      </div>
    </div>
  );
}
