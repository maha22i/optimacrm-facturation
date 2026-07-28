const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Message exact renvoyé par le backend (authenticate.js + auth.service.js#login)
// quand le tenant de l'utilisateur est suspendu. C'est le contrat de
// détection : il ne doit JAMAIS diverger de la chaîne utilisée côté backend.
export const TENANT_SUSPENDED_MESSAGE = 'Compte suspendu';

// ── Coupe-circuit "tenant suspendu" ──────────────────────────────────────────
//
// Une fois ce cas détecté (403 + message exact ci-dessus), on arrête d'émettre
// des requêtes réseau : sans ça, chaque poll/interval de l'app (badge tickets,
// stats dashboard, auto-save...) continue de retenter des appels qui échouent
// tous en boucle contre un compte bloqué.
//
// Flag module-level (pas de dépendance React ici, api.ts reste une classe
// autonome) + événement DOM pour prévenir les abonnés en live (auth-context.tsx)
// sans créer de cycle d'import entre les deux fichiers.
let tenantSuspended = false;

export function isTenantSuspended(): boolean {
  return tenantSuspended;
}

// Appelé par auth-context.tsx au login et au logout, pour repartir propre
// sur une nouvelle session dans le même onglet.
export function resetTenantSuspended(): void {
  tenantSuspended = false;
}

function markTenantSuspended() {
  if (tenantSuspended) return;
  tenantSuspended = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('tenant-suspended'));
  }
}

function isTenantSuspendedResponse(status: number, message: unknown): boolean {
  return status === 403 && message === TENANT_SUSPENDED_MESSAGE;
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Exception : /auth/logout n'est pas derrière `authenticate` côté backend
    // (on doit pouvoir se déconnecter même bloqué) — on le laisse toujours
    // passer pour que le cookie soit bien nettoyé côté serveur.
    if (tenantSuspended && path !== '/auth/logout') {
      throw new ApiError(TENANT_SUSPENDED_MESSAGE, 403);
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      if (isTenantSuspendedResponse(res.status, data.message)) {
        markTenantSuspended();
      }
      throw new ApiError(data.message || 'An error occurred', res.status);
    }

    return data;
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  delete<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'DELETE',
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  }

  async download(path: string): Promise<void> {
    if (tenantSuspended) {
      throw new ApiError(TENANT_SUSPENDED_MESSAGE, 403);
    }

    const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Erreur lors du téléchargement' }));
      if (isTenantSuspendedResponse(res.status, err.message)) {
        markTenantSuspended();
      }
      throw new ApiError(err.message || 'Erreur lors du téléchargement', res.status);
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] || 'export';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    if (tenantSuspended) {
      throw new ApiError(TENANT_SUSPENDED_MESSAGE, 403);
    }

    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      if (isTenantSuspendedResponse(res.status, data.message)) {
        markTenantSuspended();
      }
      throw new ApiError(data.message || 'An error occurred', res.status);
    }
    return data;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export const api = new ApiClient();
