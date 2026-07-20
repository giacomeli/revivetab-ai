// test/theme.test.ts — funções puras de services/theme.ts.
// getThemePref roda em Node (sem localStorage): deve cair em 'auto' sem mock.
import { describe, it, expect } from 'vitest';
import { resolveTheme, normalizeThemePref, getThemePref } from '../src/services/theme';

describe('normalizeThemePref', () => {
  it('aceita os quatro valores validos', () => {
    expect(normalizeThemePref('auto')).toBe('auto');
    expect(normalizeThemePref('light')).toBe('light');
    expect(normalizeThemePref('dark')).toBe('dark');
    expect(normalizeThemePref('revivetab')).toBe('revivetab');
  });

  it('cai em auto para invalido, null, undefined e nao-string', () => {
    expect(normalizeThemePref('purple')).toBe('auto');
    expect(normalizeThemePref('')).toBe('auto');
    expect(normalizeThemePref(null)).toBe('auto');
    expect(normalizeThemePref(undefined)).toBe('auto');
    expect(normalizeThemePref(42)).toBe('auto');
  });
});

describe('resolveTheme', () => {
  it('auto segue o sistema', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('preferencia explicita ignora o sistema', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('revivetab', true)).toBe('revivetab');
    expect(resolveTheme('revivetab', false)).toBe('revivetab');
  });
});

describe('getThemePref', () => {
  it('sem localStorage (ambiente Node) cai em auto', () => {
    expect(getThemePref()).toBe('auto');
  });
});
