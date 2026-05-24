// test/sections.test.js — npm test
import { describe, it, expect } from 'vitest';
import {
  slugify, uniqueSectionId, seedCategorize, reconcileMembership, SEED_RULES,
} from '../src/sections.js';

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

describe('seedCategorize', () => {
  const ytMusic = { url: 'https://youtube.com/watch?v=abc', folderList: ['Bookmarks Bar', 'Music'] };
  const ytSolo  = { url: 'https://youtube.com/watch?v=xyz', folderList: ['Bookmarks Bar'] };
  const ghRepo  = { url: 'https://github.com/foo/bar',     folderList: ['Bookmarks Bar', 'Nice repos'] };
  const random  = { url: 'https://example.com',            folderList: ['Bookmarks Bar'] };
  const ecomm   = { url: 'https://shop.example.com',       folderList: ['🟠 Ecomm'] };

  it('YouTube em pasta Music -> music (pasta vence URL)',
    () => expect(seedCategorize(ytMusic, SEED_RULES)).toBe('music'));
  it('YouTube solto -> watch',
    () => expect(seedCategorize(ytSolo, SEED_RULES)).toBe('watch'));
  it('GitHub em pasta Nice repos -> code',
    () => expect(seedCategorize(ghRepo, SEED_RULES)).toBe('code'));
  it('Pasta "🟠 Ecomm" -> work',
    () => expect(seedCategorize(ecomm, SEED_RULES)).toBe('work'));
  it('Sem match -> null (inbox)',
    () => expect(seedCategorize(random, SEED_RULES)).toBeNull());
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
