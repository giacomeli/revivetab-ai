// data/bookmarks.ts — adaptador de chrome.bookmarks (única porta de acesso
// da aplicação à API de bookmarks do browser). Leitura via getTree; as ÚNICAS
// escritas permitidas no projeto são updateTitle e removeBookmark (princípio
// read-only — mover cards entre seções nunca toca nas pastas do browser).

import type { TreeNode } from '../types';

export function getTree(): Promise<TreeNode[]> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((t) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(t);
    });
  });
}

export function updateTitle(id: string, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.update(id, { title }, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

export function removeBookmark(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.remove(id, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

export function bookmarksApiAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks && !!chrome.bookmarks.onRemoved;
}

export function onBookmarkRemoved(cb: (id: string) => void): void {
  chrome.bookmarks.onRemoved.addListener((id) => cb(id));
}

export function onBookmarkCreated(cb: (id: string, node: TreeNode) => void): void {
  chrome.bookmarks.onCreated.addListener((id, node) => cb(id, node));
}

export function onBookmarkChanged(cb: (id: string, changes: { title?: string; url?: string }) => void): void {
  chrome.bookmarks.onChanged.addListener((id, changes) => cb(id, changes));
}
