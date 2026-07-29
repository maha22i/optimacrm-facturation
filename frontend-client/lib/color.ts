const DEFAULT_BRAND: [number, number, number] = [79, 70, 229]; // indigo-600

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

function mix(rgb: [number, number, number], target: [number, number, number], amount: number): [number, number, number] {
  return [
    rgb[0] + (target[0] - rgb[0]) * amount,
    rgb[1] + (target[1] - rgb[1]) * amount,
    rgb[2] + (target[2] - rgb[2]) * amount,
  ];
}

/**
 * Calcule les variables CSS (--brand-*) dérivées de la couleur principale
 * d'un tenant, pour permettre au portail client de s'habiller aux couleurs
 * de la société à laquelle appartient le client final.
 */
export function computeBrandVars(color?: string | null): Record<string, string> {
  const rgb = (color && hexToRgb(color)) || DEFAULT_BRAND;
  const dark = mix(rgb, [0, 0, 0], 0.28);
  const darker = mix(rgb, [0, 0, 0], 0.48);
  const light = mix(rgb, [255, 255, 255], 0.94);
  const [r, g, b] = rgb.map(clamp);

  return {
    '--brand': rgbToHex(rgb),
    '--brand-dark': rgbToHex(dark),
    '--brand-darker': rgbToHex(darker),
    '--brand-light': rgbToHex(light),
    '--brand-ring': `rgba(${r}, ${g}, ${b}, 0.16)`,
    '--brand-shadow': `rgba(${r}, ${g}, ${b}, 0.32)`,
  };
}
