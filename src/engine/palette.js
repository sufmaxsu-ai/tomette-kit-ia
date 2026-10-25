// Palette « Papier Tomette » utilisable hors navigateur (export, aperçu Node).
// Les fichiers importés ne désignent JAMAIS une couleur en hexadécimal : uniquement ces noms.
export const LIGHT = {
  bg: '#F5EFE3', 'surface-1': '#FFFBF3', 'surface-2': '#EAE2D2', 'card-back': '#FBF1D9',
  'text-1': '#26302B', 'text-2': '#5C6660', 'text-3': '#9AA096',
  accent: '#B0502A', 'accent-strong': '#9A3F1D', 'accent-soft': '#F3DDD0', 'on-accent': '#FFFBF3',
  highlight: '#F2C25B', 'highlight-soft': '#FAE6B5', 'on-highlight': '#26302B',
  success: '#2F6A45', 'success-soft': '#E3EEDF', error: '#A42E3A', 'error-soft': '#F7E1DF',
  warning: '#8A5B00', 'warning-soft': '#F8EBC9', info: '#33627A', 'info-soft': '#DFEAF0',
  border: '#DDD3C1', 'border-strong': '#8E8371'
};
export const DARK = {
  bg: '#1B1E1A', 'surface-1': '#242822', 'surface-2': '#2E332C', 'card-back': '#2F2B20',
  'text-1': '#EDE6D6', 'text-2': '#ADA897', 'text-3': '#6D6C61',
  accent: '#E58A5F', 'accent-strong': '#C9714A', 'accent-soft': '#3E2A20', 'on-accent': '#1B1E1A',
  highlight: '#E8BF5F', 'highlight-soft': '#4A3E22', 'on-highlight': '#1B1E1A',
  success: '#7FBF8F', 'success-soft': '#24362A', error: '#EE8A90', 'error-soft': '#3D2427',
  warning: '#E8BF5F', 'warning-soft': '#3A3120', info: '#8DBBD3', 'info-soft': '#22323B',
  border: '#3B4138', 'border-strong': '#6F7468'
};

// Alias acceptés dans les fichiers importés.
const ALIASES = {
  text: 'text-1', ink: 'text-1', muted: 'text-2', faint: 'text-3', paper: 'surface-1', surface: 'surface-1',
  sunken: 'surface-2', card: 'surface-1', line: 'border', 'line-strong': 'border-strong', back: 'card-back',
  tomette: 'accent', honey: 'highlight', miel: 'highlight', green: 'success', vert: 'success', blue: 'info',
  bleu: 'info', red: 'error', rouge: 'error', orange: 'warning'
};
export const COLOR_NAMES = [...Object.keys(LIGHT), ...Object.keys(ALIASES), 'none', 'transparent'];
/** Tons utilisables pour les branches de cartes mentales et les tuiles de classeurs. */
export const TONES = ['accent', 'info', 'success', 'highlight', 'neutral'];

export function canonicalColor(name) {
  if (name == null) return null;
  const n = String(name).trim().toLowerCase();
  if (n === 'none' || n === 'transparent') return 'none';
  if (LIGHT[n]) return n;
  if (ALIASES[n]) return ALIASES[n];
  return null;
}

/**
 * Crée un résolveur de couleur.
 * mode "css"  → var(--token) (suit le thème de l'app en direct)
 * mode "light" / "dark" → hexadécimal (export PNG/PDF, aperçu Node)
 */
export function makeColorResolver(mode = 'css') {
  const pal = mode === 'dark' ? DARK : LIGHT;
  return (name, fallback = 'text-1') => {
    const c = canonicalColor(name) || canonicalColor(fallback) || 'text-1';
    if (c === 'none') return 'none';
    return mode === 'css' ? `var(--${c})` : pal[c];
  };
}
