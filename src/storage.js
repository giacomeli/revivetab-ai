// storage.js
// Thin wrapper over chrome.storage.local for bookmark-dial.

export const BD_KEYS = {
  sections: 'bd:sections',
  membership: 'bd:membership',
  meta: 'bd:meta',
  initialBackup: 'bd:initial-backup',
  ai: 'bd:ai',
  membershipUndo: 'bd:membership-undo',
};

function _get(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(items);
    });
  });
}

function _set(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

export async function loadAll() {
  const items = await _get([BD_KEYS.sections, BD_KEYS.membership, BD_KEYS.meta]);
  return {
    sections: items[BD_KEYS.sections] || null,
    membership: items[BD_KEYS.membership] || null,
    meta: items[BD_KEYS.meta] || null,
  };
}

export async function saveSections(sections) { return _set({ [BD_KEYS.sections]: sections }); }
export async function saveMembership(membership) { return _set({ [BD_KEYS.membership]: membership }); }
export async function saveMeta(meta) { return _set({ [BD_KEYS.meta]: meta }); }

export async function saveInitialBackup(tree) {
  return _set({ [BD_KEYS.initialBackup]: { savedAt: new Date().toISOString(), tree } });
}

export async function loadInitialBackup() {
  const items = await _get([BD_KEYS.initialBackup]);
  return items[BD_KEYS.initialBackup] || null;
}

// Config da organização por IA. A API key fica em chrome.storage.local
// (local à máquina) — nunca em código, logs ou repositório.
const AI_DEFAULTS = { provider: 'deepseek', apiKeys: { deepseek: '', openrouter: '' }, model: '' };

export async function loadAiConfig() {
  const items = await _get([BD_KEYS.ai]);
  const saved = items[BD_KEYS.ai] || {};
  return {
    ...AI_DEFAULTS,
    ...saved,
    apiKeys: { ...AI_DEFAULTS.apiKeys, ...(saved.apiKeys || {}) },
  };
}

export async function saveAiConfig(config) { return _set({ [BD_KEYS.ai]: config }); }

// Snapshot do membership anterior à última organização por IA (para desfazer).
export async function loadMembershipUndo() {
  const items = await _get([BD_KEYS.membershipUndo]);
  return items[BD_KEYS.membershipUndo] || null;
}

export async function saveMembershipUndo(membership) {
  return _set({ [BD_KEYS.membershipUndo]: { savedAt: new Date().toISOString(), membership } });
}

export async function clearMembershipUndo() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(BD_KEYS.membershipUndo, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

export async function exportBackup() {
  const items = await _get([BD_KEYS.sections, BD_KEYS.membership, BD_KEYS.meta, BD_KEYS.initialBackup]);
  const tree = await new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((t) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(t);
    });
  });
  return {
    exportedAt: new Date().toISOString(),
    bookmarksTree: tree,
    storage: items,
  };
}
