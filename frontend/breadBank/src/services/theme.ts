// Per-account theming. The chosen theme lives server-side (app_settings) so it
// follows the account to any device; a per-user localStorage copy repaints
// instantly on load while the server copy is fetched.

export const THEMES = [
  { id: 'original', label: 'Original', colors: ['#0A0A1B', '#6C4ED4', '#E040FB'] },
  { id: 'black',    label: 'Black', colors: ['#0F0F0E', '#4A4A46', '#8A8A84'] },
  { id: 'gold',     label: 'Black & Gold', colors: ['#121110', '#C9A227', '#8A6C1D'] },
  { id: 'light',    label: 'White', colors: ['#FFFFFF', '#1A1A18', '#B08D2E'] },
  { id: 'midnight', label: 'Midnight Blue', colors: ['#0B1220', '#4C7DFF', '#EFF3FA'] },
  { id: 'brown',    label: 'Brown', colors: ['#F7F1EA', '#6F4E37', '#A67C52'] },
  { id: 'pink',     label: "Abrars hot girl summer", colors: ['#14090E', '#E893AE', '#C7C9CC'] },
  { id: 'sage',     label: 'Dark Sage', colors: ['#0C110E', '#9FBE8C', '#C9A227'] },
] as const;

export type ThemeName = (typeof THEMES)[number]['id'];

function isTheme(t: string): t is ThemeName {
  return THEMES.some(x => x.id === t);
}

export function applyTheme(theme: string | null | undefined): void {
  const name: ThemeName = theme && isTheme(theme) ? theme : 'original';
  document.body.classList.remove(
    'theme-original', 'theme-black', 'theme-midnight', 'theme-gold', 'theme-light', 'theme-brown', 'theme-sage', 'theme-pink', 'theme-green',
  );
  document.body.classList.add(`theme-${name}`);
}

/** Resolve a theme CSS variable to its literal value — for consumers that
 *  can't use var() directly, like ApexCharts' SVG color configs. */
export function themeColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(varName).trim();
  return v || fallback;
}

const cacheKey = (userId: number) => `bb_theme_${userId}`;

export function cachedTheme(userId: number): string | null {
  return localStorage.getItem(cacheKey(userId));
}

export function cacheTheme(userId: number, theme: string): void {
  localStorage.setItem(cacheKey(userId), theme);
}
