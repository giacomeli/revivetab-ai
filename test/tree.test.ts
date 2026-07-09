// test/tree.test.ts — npm test
import { describe, it, expect } from 'vitest';
import { walk, collectBookmarks } from '../src/services/tree';

// Fixture no formato de chrome.bookmarks.getTree(): raiz id 0 sem título,
// containers especiais como filhos diretos (títulos localizados variam por
// browser/idioma — não podem vazar para o folderList).
const TREE = [{
  id: '0',
  title: '',
  children: [
    {
      id: '1',
      title: 'Bookmarks Bar',
      children: [
        {
          id: '10',
          title: 'Dev',
          children: [
            { id: '11', title: 'GitHub', url: 'https://github.com' },
            {
              id: '12',
              title: 'Sub',
              children: [
                { id: '13', title: 'MDN', url: 'https://developer.mozilla.org' },
              ],
            },
          ],
        },
        { id: '20', title: 'Solto na barra', url: 'https://example.com' },
      ],
    },
    {
      id: '2',
      title: 'Other Bookmarks',
      children: [
        {
          id: '30',
          title: 'Refs',
          children: [
            { id: '31', title: 'Wiki', url: 'https://wikipedia.org' },
          ],
        },
        { id: '40', title: 'Solto nos gerais', url: 'https://example.org' },
      ],
    },
  ],
}];

describe('collectBookmarks', () => {
  const all = collectBookmarks(TREE);
  const byId = Object.fromEntries(all.map((b) => [b.id, b]));

  it('coleta favoritos da barra e dos favoritos gerais', () => {
    expect(all.map((b) => b.id).sort()).toEqual(['11', '13', '20', '31', '40']);
  });

  it('títulos dos containers-raiz não entram no folderList', () => {
    for (const bm of all) {
      expect(bm.folderList).not.toContain('Bookmarks Bar');
      expect(bm.folderList).not.toContain('Other Bookmarks');
    }
  });

  it('favorito solto fica com folderList vazio', () => {
    expect(byId['20'].folderList).toEqual([]);
    expect(byId['40'].folderList).toEqual([]);
  });

  it('caminho de subpastas é preservado', () => {
    expect(byId['11'].folderList).toEqual(['Dev']);
    expect(byId['13'].folderList).toEqual(['Dev', 'Sub']);
    expect(byId['31'].folderList).toEqual(['Refs']);
  });

  it('árvore vazia -> lista vazia', () => {
    expect(collectBookmarks([])).toEqual([]);
    expect(collectBookmarks(undefined)).toEqual([]);
  });
});

describe('walk', () => {
  it('acumula pastas no caminho e ignora título vazio', () => {
    const out = walk({ id: 'x', title: '', children: [
      { id: 'y', title: 'A', children: [{ id: 'z', title: 'Link', url: 'https://a.com' }] },
    ] }, []);
    expect(out).toHaveLength(1);
    expect(out[0].folderList).toEqual(['A']);
  });
});
