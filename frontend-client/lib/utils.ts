export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatMontant(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return parseFloat(String(val)).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' \u20AC';
}

export function formatDatetime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statutColor(statut: string): string {
  const map: Record<string, string> = {
    'Brouillon': 'bg-gray-100 text-gray-700',
    'Validée': 'bg-blue-100 text-blue-700',
    'Envoyée': 'bg-amber-100 text-amber-700',
    'Payée': 'bg-green-100 text-green-700',
    'Annulée': 'bg-red-100 text-red-700',
    'nouveau': 'bg-blue-100 text-blue-700',
    'assigne': 'bg-cyan-100 text-cyan-700',
    'en_cours': 'bg-amber-100 text-amber-700',
    'en_attente': 'bg-orange-100 text-orange-700',
    'resolu': 'bg-green-100 text-green-700',
    'cloture': 'bg-gray-100 text-gray-600',
    'Actif': 'bg-green-100 text-green-700',
    'Suspendu': 'bg-amber-100 text-amber-700',
    'Résilié': 'bg-red-100 text-red-700',
    'En service': 'bg-green-100 text-green-700',
    'En stock': 'bg-gray-100 text-gray-600',
    'En panne': 'bg-red-100 text-red-700',
    'Retiré': 'bg-gray-100 text-gray-500',
  };
  return map[statut] || 'bg-gray-100 text-gray-700';
}

export function prioriteColor(priorite: string): string {
  const map: Record<string, string> = {
    basse: 'bg-gray-100 text-gray-600',
    normale: 'bg-blue-100 text-blue-700',
    haute: 'bg-orange-100 text-orange-700',
    urgente: 'bg-red-100 text-red-700',
  };
  return map[priorite] || 'bg-gray-100 text-gray-700';
}

export function statutDotColor(statut: string): string {
  const map: Record<string, string> = {
    'Brouillon': 'bg-gray-400',
    'Validée': 'bg-blue-500',
    'Envoyée': 'bg-amber-500',
    'Payée': 'bg-emerald-500',
    'Annulée': 'bg-red-500',
    'nouveau': 'bg-blue-500',
    'assigne': 'bg-cyan-500',
    'en_cours': 'bg-amber-500',
    'en_attente': 'bg-orange-500',
    'resolu': 'bg-emerald-500',
    'cloture': 'bg-gray-400',
    'Actif': 'bg-emerald-500',
    'Suspendu': 'bg-amber-500',
    'Résilié': 'bg-red-500',
    'En service': 'bg-emerald-500',
    'En stock': 'bg-gray-400',
    'En panne': 'bg-red-500',
    'Retiré': 'bg-gray-400',
  };
  return map[statut] || 'bg-gray-400';
}

export function prioriteDotColor(priorite: string): string {
  const map: Record<string, string> = {
    basse: 'bg-gray-400',
    normale: 'bg-blue-500',
    haute: 'bg-orange-500',
    urgente: 'bg-red-500',
  };
  return map[priorite] || 'bg-gray-400';
}
