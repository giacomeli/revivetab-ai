// services/theme.ts — resolução, persistência e aplicação do tema.
//
// Preferência em localStorage (chave bd:theme): leitura síncrona é o que
// permite ao public/theme-init.js aplicar o tema antes do primeiro paint
// (chrome.storage é assíncrono). Trade-off aceito: não sincroniza entre
// máquinas. Fora do browser (Vitest/Node), tudo cai em 'auto' sem mock.
// theme-init.js duplica a resolução mínima — mudou aqui, mudou lá.

export type ThemePref = 'auto' | 'light' | 'dark' | 'revivetab';
export type ThemeName = Exclude<ThemePref, 'auto'>;

export const THEME_STORAGE_KEY = 'bd:theme';

const PREFS: ThemePref[] = ['auto', 'light', 'dark', 'revivetab'];

export function normalizeThemePref(value: unknown): ThemePref {
  return PREFS.includes(value as ThemePref) ? (value as ThemePref) : 'auto';
}

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ThemeName {
  if (pref === 'auto') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// O acesso é via window.localStorage com guard de typeof window: em Node 26+,
// o global localStorage é um getter experimental e o simples typeof dele emite
// ExperimentalWarning na saída dos testes.
export function getThemePref(): ThemePref {
  try {
    if (typeof window === 'undefined') return 'auto';
    return normalizeThemePref(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'auto';
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    }
  } catch {
    // storage indisponível: aplica só na sessão atual
  }
  applyTheme();
}

export function applyTheme(): void {
  document.documentElement.dataset.theme = resolveTheme(getThemePref(), prefersDark());
}

export function watchSystemTheme(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'auto') applyTheme();
  });
}
