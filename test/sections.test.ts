// test/sections.test.ts — npm test
import { describe, it, expect } from 'vitest';
import {
  slugify, uniqueSectionId, seedCategorize, reconcileMembership, SEED_RULES,
  needsReSeed, SEED_VERSION,
} from '../src/services/sections';

describe('slugify', () => {
  it('basic ASCII', () => expect(slugify('Hello World')).toBe('hello-world'));
  it('accents', () => expect(slugify('Praticar Música')).toBe('praticar-musica'));
  it('special chars', () => expect(slugify('AI & LLMs!!!')).toBe('ai-llms'));
  it('empty', () => expect(slugify('')).toBe('section'));
  it('truncate long', () => expect(slugify('a'.repeat(60)).length).toBe(40));
});

describe('uniqueSectionId', () => {
  it('no conflict', () => expect(uniqueSectionId('foo', ['a', 'b'])).toBe('foo'));
  it('one conflict -> -2', () => expect(uniqueSectionId('foo', ['foo', 'b'])).toBe('foo-2'));
  it('two conflicts -> -3', () => expect(uniqueSectionId('foo', ['foo', 'foo-2'])).toBe('foo-3'));
});

describe('seedCategorize (regras genéricas)', () => {
  const ytMusic  = { url: 'https://youtube.com/watch?v=abc', folderList: ['Music'] };
  const ytSolto  = { url: 'https://youtube.com/watch?v=xyz', folderList: [] };
  const ghSolto  = { url: 'https://github.com/foo/bar',      folderList: [] };
  const acentos  = { url: 'https://example.com',             folderList: ['Música'] };
  const composta = { url: 'https://example.com',             folderList: ['meus-projetos'] };
  const email    = { url: 'https://example.com',             folderList: ['Email'] };
  const random   = { url: 'https://example.com',             folderList: [] };
  const chatgpt  = { url: 'https://chatgpt.com/c/123',       folderList: [] };

  it('pasta vence URL: YouTube em pasta Music -> music',
    () => expect(seedCategorize(ytMusic, SEED_RULES)).toBe('music'));
  it('solto com URL de YouTube -> watch',
    () => expect(seedCategorize(ytSolto, SEED_RULES)).toBe('watch'));
  it('solto com URL de GitHub -> code',
    () => expect(seedCategorize(ghSolto, SEED_RULES)).toBe('code'));
  it('acento não impede match: pasta Música -> music',
    () => expect(seedCategorize(acentos, SEED_RULES)).toBe('music'));
  it('token em nome composto: meus-projetos -> code',
    () => expect(seedCategorize(composta, SEED_RULES)).toBe('code'));
  it('token inteiro, não substring: Email NÃO casa com "ai"',
    () => expect(seedCategorize(email, SEED_RULES)).toBeNull());
  it('URL de LLM -> ai',
    () => expect(seedCategorize(chatgpt, SEED_RULES)).toBe('ai'));
  it('sem match -> null (inbox)',
    () => expect(seedCategorize(random, SEED_RULES)).toBeNull());
});

describe('needsReSeed', () => {
  it('meta v1 semeada -> true', () => expect(needsReSeed({ version: 1, seeded: true })).toBe(true));
  it('meta sem version (legado) -> true', () => expect(needsReSeed({ seeded: true })).toBe(true));
  it('meta na versão atual -> false', () => expect(needsReSeed({ version: SEED_VERSION, seeded: true })).toBe(false));
  it('nunca semeada -> false (caminho é o ensureSeeded)', () => expect(needsReSeed({ seeded: false })).toBe(false));
  it('meta null -> false', () => expect(needsReSeed(null)).toBe(false));
});

describe('reconcileMembership', () => {
  it('Mantém existentes, adiciona novos ao inbox', () => {
    const r = reconcileMembership(
      { a: 'music' },
      [{ id: 'a' }, { id: 'b' }],
      'inbox'
    );
    expect(r.membership).toEqual({ a: 'music', b: 'inbox' });
    expect(r.added).toEqual(['b']);
    expect(r.removed).toEqual([]);
  });

  it('Remove órfãos', () => {
    const r = reconcileMembership(
      { a: 'music', gone: 'study' },
      [{ id: 'a' }],
      'inbox'
    );
    expect(r.membership).toEqual({ a: 'music' });
    expect(r.removed).toEqual(['gone']);
  });
});
