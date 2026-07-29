'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/portal');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

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
            {[
              { label: 'Factures & paiements', desc: 'Consultez et téléchargez en un clic' },
              { label: 'Suivi des tickets', desc: 'Restez informé en temps réel' },
              { label: 'Parc machines', desc: 'Visibilité complète sur vos équipements' },
            ].map((item) => (
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

      {/* Right panel — form */}
      <div className="relative flex items-center justify-center px-6 py-12 sm:px-10">
        {/* Mobile-only ambient background */}
        <div className="pointer-events-none absolute inset-0 lg:hidden bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50" />

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

          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Espace Client</h1>
            <p className="mt-1.5 text-sm text-gray-500">Connectez-vous pour accéder à votre espace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                Adresse email
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0-.414.336-.75.75-.75h18a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-18a.75.75 0 01-.75-.75V6.75z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 7l9.5 6.5L21.5 7" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/60 py-2.5 pl-10 pr-3.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  placeholder="vous@entreprise.com"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Mot de passe
                </label>
                <a href="#" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  Mot de passe oublié ?
                </a>
              </div>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/60 py-2.5 pl-10 pr-10 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                  placeholder="Votre mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? (
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Connexion...
                  </>
                ) : (
                  <>
                    Se connecter
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </form>

          <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span>Connexion sécurisée et chiffrée</span>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400 lg:hidden">Portail client OptimaCRM</p>
        </div>
      </div>
    </div>
  );
}
