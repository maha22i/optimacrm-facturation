const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/client';
const API_ORIGIN = API_URL.replace(/\/api\/client\/?$/, '');

/** Résout une URL d'asset (ex: logo société) potentiellement relative au backend. */
export function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const TENANT_SUSPENDED_MESSAGE = 'Compte suspendu';

let tenantSuspended = false;

export function isTenantSuspended(): boolean {
  return tenantSuspended;
}

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

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
      if (res.status === 403 && data.message === TENANT_SUSPENDED_MESSAGE) {
        markTenantSuspended();
      }
      throw new ApiError(data.message || 'Une erreur est survenue', res.status);
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

  async downloadPdf(path: string, filename: string): Promise<void> {
    if (tenantSuspended) throw new ApiError(TENANT_SUSPENDED_MESSAGE, 403);

    const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Erreur de téléchargement' }));
      throw new ApiError(err.message, res.status);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
