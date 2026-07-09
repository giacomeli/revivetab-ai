// services/tree.ts — leitura da árvore de bookmarks (módulo puro, testável).
//
// Os containers-raiz especiais do browser (barra de favoritos, outros
// favoritos, mobile...) são detectados por posição — filhos do nó raiz —
// nunca por título, que é localizado e varia entre browsers Chromium.
// Seus nomes NÃO entram no folderList (nem no breadcrumb, nem no matching
// de pastas do seed).

import type { Bookmark, TreeNode } from '../types';

export function walk(node: TreeNode, folders: string[]): Bookmark[] {
  let out: Bookmark[] = [];
  // Nó de URL: o folderList é só o caminho de pastas — o próprio título do
  // bookmark NÃO entra (entrava no walk original, poluindo breadcrumb e
  // matching de pastas do seed). Título vazio permanece vazio; a UI exibe
  // t('untitled') no render (módulo puro não conhece i18n).
  if (node.url) {
    out.push({
      id: node.id,
      title: node.title || '',
      url: node.url,
      folders: new Set(folders),
      folderList: folders.slice(),
      added: node.dateAdded || 0,
    });
    return out;
  }
  const name = (node.title || '').trim();
  const next = name ? folders.concat([name]) : folders.slice();
  if (node.children) {
    for (const child of node.children) {
      out = out.concat(walk(child, next));
    }
  }
  return out;
}

// Coleta todos os bookmarks a partir do retorno de chrome.bookmarks.getTree().
// Favorito direto em um container (barra/gerais) fica com folderList vazio —
// é um favorito "solto", elegível apenas às regras de URL do seed.
export function collectBookmarks(tree: TreeNode[] | undefined): Bookmark[] {
  let out: Bookmark[] = [];
  for (const root of tree || []) {
    for (const container of root.children || []) {
      for (const child of container.children || []) {
        out = out.concat(walk(child, []));
      }
    }
  }
  return out;
}
