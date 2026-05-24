// storage.js
// Thin wrapper over chrome.storage.local for bookmark-dial.
// All keys are prefixed 'bd:'. Functions return promises for clean async/await.

const BD_KEYS = {
  sections: 'bd:sections',
  membership: 'bd:membership',
  meta: 'bd:meta',
  initialBackup: 'bd:initial-backup',
};

function _get(keys) {
  return new Promise(function(resolve, reject){
    chrome.storage.local.get(keys, function(items){
      if(chrome.runtime.lastError){ reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(items);
    });
  });
}

function _set(obj) {
  return new Promise(function(resolve, reject){
    chrome.storage.local.set(obj, function(){
      if(chrome.runtime.lastError){ reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

async function loadAll() {
  const items = await _get([BD_KEYS.sections, BD_KEYS.membership, BD_KEYS.meta]);
  return {
    sections: items[BD_KEYS.sections] || null,
    membership: items[BD_KEYS.membership] || null,
    meta: items[BD_KEYS.meta] || null,
  };
}

async function saveSections(sections) { return _set({ [BD_KEYS.sections]: sections }); }
async function saveMembership(membership) { return _set({ [BD_KEYS.membership]: membership }); }
async function saveMeta(meta) { return _set({ [BD_KEYS.meta]: meta }); }

async function saveInitialBackup(tree) {
  return _set({ [BD_KEYS.initialBackup]: { savedAt: new Date().toISOString(), tree: tree } });
}

async function loadInitialBackup() {
  const items = await _get([BD_KEYS.initialBackup]);
  return items[BD_KEYS.initialBackup] || null;
}

async function exportBackup() {
  const items = await _get([BD_KEYS.sections, BD_KEYS.membership, BD_KEYS.meta, BD_KEYS.initialBackup]);
  const tree = await new Promise(function(resolve, reject){
    chrome.bookmarks.getTree(function(t){
      if(chrome.runtime.lastError){ reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(t);
    });
  });
  return {
    exportedAt: new Date().toISOString(),
    bookmarksTree: tree,
    storage: items,
  };
}
