# Categorização Inteligente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a categorização hardcoded e estática por sistema membership-driven com seções customizáveis, drag-and-drop entre seções e ícones Lucide, preservando 100% dos bookmarks do browser.

**Architecture:** `chrome.storage.local` é a fonte de verdade da categorização (chaves `bd:sections`, `bd:membership`, `bd:meta`, `bd:initial-backup`). Heurística semeia 1x na primeira instalação; depois disso, só movimentos manuais via drag-and-drop mudam a categorização. Bookmarks do Brave ficam read-only (exceto rename/delete que já existiam). Lucide SVGs embutidos em código (sem build, sem CDN).

**Tech Stack:** Vanilla JavaScript (sem build, sem npm), Chrome Extension Manifest V3, HTML5 Drag and Drop API, `chrome.storage.local`, `chrome.bookmarks`, Lucide icons (SVG inline).

**Spec:** `docs/superpowers/specs/2026-05-24-categorizacao-inteligente-design.md`

---

## Notas sobre TDD neste projeto

Este projeto não tem framework de testes nem build. Para as funções **puras** (`seedCategorize`, `slugify`, `reconcileMembership`), criamos arquivos de teste minimalistas em Node.js que carregam o arquivo via `vm` e validam comportamento — zero dependências, executáveis via `node test/<arquivo>.test.js`. Para mudanças de UI/DOM, usamos verificação manual com passos explícitos no Brave.

Comando de teste padrão para os módulos puros:
```bash
node test/sections.test.js
```

---

## Arquivos do projeto após implementação

### Novos
- `icons.js` — `LUCIDE_ICONS` (mapa nome → SVG string) + `iconSVG(name, size)`.
- `storage.js` — wrapper de `chrome.storage.local`: load/save de sections, membership, meta, backup.
- `sections.js` — `DEFAULT_SECTIONS`, `SEED_RULES`, `slugify`, `seedCategorize`, `reconcileMembership`, `ensureSeeded`, listeners de `chrome.bookmarks`.
- `dnd.js` — handlers de drag-and-drop entre seções.
- `modal-sections.js` — UI do modal "Gerenciar seções".
- `test/sections.test.js` — testes Node.js para `slugify`, `seedCategorize`, `reconcileMembership`.

### Modificados
- `manifest.json` — version → `3.0.0`, adiciona `"storage"` em permissions.
- `newtab.html` — script tags na ordem correta + botão de settings no header.
- `dial.js` — remove array `SECTIONS` hardcoded; remove `categorize()`; usa membership; integra `dnd.js`; rename inline.
- `style.css` — estilos novos para drag, modal, icon picker, color picker, drop zones, header editável.
- `CLAUDE.md` — atualizar seção de arquitetura.

---

## Phase 1 — Foundation Modules (lógica pura, sem UI)

### Task 1: Criar icons.js com Lucide SVGs embutidos

**Files:**
- Create: `icons.js`

- [ ] **Step 1: Criar o arquivo com o mapa de ícones**

Cada SVG vem do site oficial Lucide (https://lucide.dev/icons). Atributos preservados: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. O atributo `width`/`height` é injetado pelo helper.

```js
// icons.js
// Lucide icons (https://lucide.dev) — ISC License
// Each SVG body is the path content without the outer <svg> wrapper attrs (those go in iconSVG).

const LUCIDE_ICONS = {
  'book-open':      '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'video':          '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>',
  'music':          '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'wrench':         '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  'code':           '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  'bot':            '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  'briefcase':      '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  'globe':          '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'gamepad-2':      '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.152A4 4 0 0 0 17.32 5z"/>',
  'shopping-cart':  '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  'dollar-sign':    '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  'palette':        '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  'server':         '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  'search':         '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'bookmark':       '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  'folder':         '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'star':           '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'heart':          '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  'inbox':          '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'settings':       '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'hash':           '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  'tag':            '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>',
  'camera':         '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  'headphones':     '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a10 10 0 0 1 20 0v7a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  'image':          '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'map':            '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
  'newspaper':      '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  'pen-tool':       '<path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
  'rocket':         '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  'sparkles':       '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  'target':         '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'terminal':       '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  'trending-up':    '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'tv':             '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  'users':          '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'zap':            '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'calendar':       '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  'clock':          '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'flame':          '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  'layers':         '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
};

function iconSVG(name, size) {
  size = size || 20;
  const body = LUCIDE_ICONS[name] || LUCIDE_ICONS['bookmark'];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size
    + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
}

function iconNames() {
  return Object.keys(LUCIDE_ICONS);
}
```

- [ ] **Step 2: Verificação manual via Node**

Run:
```bash
node -e "$(cat icons.js); console.log(iconSVG('music', 24).slice(0,80)); console.log(iconNames().length);"
```

Expected output:
```
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
40
```

- [ ] **Step 3: Commit**

```bash
git add icons.js
git commit -m "feat: add Lucide SVG icon library (40 icons)"
```

---

### Task 2: Criar storage.js (wrapper de chrome.storage.local)

**Files:**
- Create: `storage.js`

- [ ] **Step 1: Criar o wrapper**

```js
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
```

- [ ] **Step 2: Verificação de sintaxe**

Run:
```bash
node -c storage.js
```

Expected: exit code 0 (sintaxe válida).

(Não rodamos os métodos porque `chrome` não existe fora do navegador.)

- [ ] **Step 3: Commit**

```bash
git add storage.js
git commit -m "feat: add chrome.storage.local wrapper (storage.js)"
```

---

### Task 3: Criar sections.js — DEFAULT_SECTIONS, SEED_RULES, slugify, seedCategorize, reconcileMembership

**Files:**
- Create: `sections.js`

- [ ] **Step 1: Criar o módulo**

```js
// sections.js
// Section configuration, seed rules, slugify, seedCategorize, reconcileMembership.

const DEFAULT_SECTIONS = [
  { id: 'study',   label: 'O que estudar hoje',  icon: 'book-open', color: '#4fc3f7', order: 0 },
  { id: 'watch',   label: 'O que assistir hoje', icon: 'video',     color: '#ef5350', order: 1 },
  { id: 'music',   label: 'Praticar música',     icon: 'music',     color: '#ff9800', order: 2 },
  { id: 'tools',   label: 'Ferramentas',         icon: 'wrench',    color: '#66bb6a', order: 3 },
  { id: 'code',    label: 'Repos & Code',        icon: 'code',      color: '#ce93d8', order: 4 },
  { id: 'ai',      label: 'AI & LLMs',           icon: 'bot',       color: '#ab47bc', order: 5 },
  { id: 'work',    label: 'Trabalho',            icon: 'briefcase', color: '#ffa726', order: 6 },
  { id: 'explore', label: 'Explorar',            icon: 'globe',     color: '#26c6da', order: 7 },
  { id: 'inbox',   label: 'Não categorizado',    icon: 'inbox',     color: '#888888', order: 999, builtin: true },
];

// SEED_RULES — só usadas na primeira semeadura. Pasta tem prioridade sobre URL.
// Strings em folders são nomes literais de pastas (case-insensitive substring match).
const SEED_RULES = {
  study:   { folders: ['study','DevOps','DotNet','Frontend','Backend','Architecture','Laravel','APIs','Mobile','Research','GB','📖'], urls: [] },
  watch:   { folders: ['🎦','videos'], urls: [/youtube\.com\/watch/, /animesonline|topflix/] },
  music:   { folders: ['Music'], urls: [/cifraclub|casadagaitaponto/] },
  tools:   { folders: ['~/tools','Util'], urls: [] },
  code:    { folders: ['.git','Nice repos'], urls: [/github\.com|gitlab\.com/] },
  ai:      { folders: ['AIs','AI'], urls: [] },
  work:    { folders: ['work','🟠 Ecomm','🟢 Maestro','Senior','Unig','NFE','Glofi','🔴 RP','Rich','Important'], urls: [] },
  explore: { folders: ['/var','/tmp','hack','Gaming','Auto','Shopping','Hardware','Finance','Design','Hosting','kb','SEO'], urls: [] },
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'section';
}

function uniqueSectionId(baseSlug, existingIds) {
  if(!existingIds.includes(baseSlug)) return baseSlug;
  let n = 2;
  while(existingIds.includes(baseSlug + '-' + n)) n++;
  return baseSlug + '-' + n;
}

// folderMatches: case-insensitive substring match across bookmark folder path
function _folderMatches(folderList, ruleFolders) {
  for(let i=0; i<ruleFolders.length; i++){
    const r = String(ruleFolders[i]).toLowerCase();
    for(let j=0; j<folderList.length; j++){
      const f = String(folderList[j] || '').toLowerCase();
      if(f.indexOf(r) !== -1) return true;
    }
  }
  return false;
}

// seedCategorize: returns sectionId or null (= inbox).
// Pass 1: folders. Pass 2: urls. Pass 3: null.
function seedCategorize(bookmark, rules) {
  const folderList = bookmark.folderList || [];
  const url = bookmark.url || '';

  // Pass 1: folders
  for(const sid in rules){
    if(_folderMatches(folderList, rules[sid].folders || [])) return sid;
  }
  // Pass 2: urls
  for(const sid in rules){
    const urlRules = rules[sid].urls || [];
    for(let i=0; i<urlRules.length; i++){
      if(urlRules[i].test(url)) return sid;
    }
  }
  return null;
}

// reconcileMembership: aligns membership with current bookmark tree.
// Returns { membership, added: [], removed: [] } where added are bookmarks pushed to inbox
// and removed are bookmark ids dropped from membership.
function reconcileMembership(existingMembership, currentBookmarks, defaultSectionId) {
  defaultSectionId = defaultSectionId || 'inbox';
  const result = {};
  const currentIds = new Set();
  const added = [];
  const removed = [];

  for(let i=0; i<currentBookmarks.length; i++){
    const id = currentBookmarks[i].id;
    currentIds.add(id);
    if(existingMembership.hasOwnProperty(id)){
      result[id] = existingMembership[id];
    } else {
      result[id] = defaultSectionId;
      added.push(id);
    }
  }
  for(const id in existingMembership){
    if(!currentIds.has(id)) removed.push(id);
  }
  return { membership: result, added: added, removed: removed };
}

// ensureSeeded: first-time install flow.
// If meta.seeded === true, returns existing state. Otherwise: backup, seed, save.
// Returns { sections, membership, meta }.
async function ensureSeeded(state, currentBookmarks, currentTree, persistBackup, persist) {
  if(state.meta && state.meta.seeded){
    return state;
  }
  // First install — backup raw tree first
  await persistBackup(currentTree);

  const sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS)); // deep clone
  const membership = {};
  for(let i=0; i<currentBookmarks.length; i++){
    const bm = currentBookmarks[i];
    const sid = seedCategorize(bm, SEED_RULES);
    membership[bm.id] = sid || 'inbox';
  }
  const meta = { version: 1, seeded: true };

  await persist.sections(sections);
  await persist.membership(membership);
  await persist.meta(meta);

  return { sections: sections, membership: membership, meta: meta };
}

// reSeedAll: clear membership and re-run seed on existing bookmarks.
// Does NOT touch sections (preserves user customizations).
async function reSeedAll(currentBookmarks, persistMembership) {
  const membership = {};
  for(let i=0; i<currentBookmarks.length; i++){
    const bm = currentBookmarks[i];
    const sid = seedCategorize(bm, SEED_RULES);
    membership[bm.id] = sid || 'inbox';
  }
  await persistMembership(membership);
  return membership;
}

// CommonJS export for Node tests (browser ignores this block).
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    DEFAULT_SECTIONS, SEED_RULES,
    slugify, uniqueSectionId,
    seedCategorize, reconcileMembership,
    ensureSeeded, reSeedAll,
  };
}
```

- [ ] **Step 2: Criar o arquivo de teste Node**

**Files:**
- Create: `test/sections.test.js`

```js
// test/sections.test.js — node test/sections.test.js
const s = require('../sections.js');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn){
  try { fn(); console.log('  ok', name); pass++; }
  catch(e){ console.log('  FAIL', name, '\n   ', e.message); fail++; }
}

console.log('slugify:');
test('basic ASCII', () => assert.strictEqual(s.slugify('Hello World'), 'hello-world'));
test('accents', () => assert.strictEqual(s.slugify('Praticar Música'), 'praticar-musica'));
test('special chars', () => assert.strictEqual(s.slugify('AI & LLMs!!!'), 'ai-llms'));
test('empty', () => assert.strictEqual(s.slugify(''), 'section'));
test('truncate long', () => assert.strictEqual(s.slugify('a'.repeat(60)).length, 40));

console.log('uniqueSectionId:');
test('no conflict', () => assert.strictEqual(s.uniqueSectionId('foo', ['a','b']), 'foo'));
test('one conflict -> -2', () => assert.strictEqual(s.uniqueSectionId('foo', ['foo','b']), 'foo-2'));
test('two conflicts -> -3', () => assert.strictEqual(s.uniqueSectionId('foo', ['foo','foo-2']), 'foo-3'));

console.log('seedCategorize:');
const ytMusic = { url: 'https://youtube.com/watch?v=abc', folderList: ['Bookmarks Bar','Music'] };
const ytSolo  = { url: 'https://youtube.com/watch?v=xyz', folderList: ['Bookmarks Bar'] };
const ghRepo  = { url: 'https://github.com/foo/bar',     folderList: ['Bookmarks Bar','Nice repos'] };
const random  = { url: 'https://example.com',            folderList: ['Bookmarks Bar'] };
const ecomm   = { url: 'https://shop.example.com',       folderList: ['🟠 Ecomm'] };

test('YouTube em pasta Music -> music (pasta vence URL)',
  () => assert.strictEqual(s.seedCategorize(ytMusic, s.SEED_RULES), 'music'));
test('YouTube solto -> watch',
  () => assert.strictEqual(s.seedCategorize(ytSolo, s.SEED_RULES), 'watch'));
test('GitHub em pasta Nice repos -> code',
  () => assert.strictEqual(s.seedCategorize(ghRepo, s.SEED_RULES), 'code'));
test('Pasta "🟠 Ecomm" -> work',
  () => assert.strictEqual(s.seedCategorize(ecomm, s.SEED_RULES), 'work'));
test('Sem match -> null (inbox)',
  () => assert.strictEqual(s.seedCategorize(random, s.SEED_RULES), null));

console.log('reconcileMembership:');
test('Mantém existentes, adiciona novos ao inbox', () => {
  const r = s.reconcileMembership(
    { 'a': 'music' },
    [ { id:'a' }, { id:'b' } ],
    'inbox'
  );
  assert.deepStrictEqual(r.membership, { a:'music', b:'inbox' });
  assert.deepStrictEqual(r.added, ['b']);
  assert.deepStrictEqual(r.removed, []);
});

test('Remove órfãos', () => {
  const r = s.reconcileMembership(
    { 'a':'music', 'gone':'study' },
    [ { id:'a' } ],
    'inbox'
  );
  assert.deepStrictEqual(r.membership, { a:'music' });
  assert.deepStrictEqual(r.removed, ['gone']);
});

console.log('\nResult:', pass, 'passed,', fail, 'failed');
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 3: Rodar testes**

Run:
```bash
node test/sections.test.js
```

Expected output:
```
slugify:
  ok basic ASCII
  ok accents
  ok special chars
  ok empty
  ok truncate long
uniqueSectionId:
  ok no conflict
  ok one conflict -> -2
  ok two conflicts -> -3
seedCategorize:
  ok YouTube em pasta Music -> music (pasta vence URL)
  ok YouTube solto -> watch
  ok GitHub em pasta Nice repos -> code
  ok Pasta "🟠 Ecomm" -> work
  ok Sem match -> null (inbox)
reconcileMembership:
  ok Mantém existentes, adiciona novos ao inbox
  ok Remove órfãos

Result: 13 passed, 0 failed
```

Exit code: 0.

- [ ] **Step 4: Commit**

```bash
git add sections.js test/sections.test.js
git commit -m "feat: add sections module with seed categorize + reconcile (+ tests)"
```

---

## Phase 2 — Migração de dial.js para storage-driven

### Task 4: Atualizar manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Bump version e adicionar permission storage**

Substituir conteúdo atual por:

```json
{
  "manifest_version": 3,
  "name": "Bookmark Dial",
  "version": "3.0.0",
  "description": "Speed dial dashboard for your bookmarks.",
  "permissions": [
    "bookmarks",
    "favicon",
    "storage"
  ],
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  },
  "icons": {
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Validar JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "chore: bump manifest to 3.0.0, add storage permission"
```

---

### Task 5: Atualizar newtab.html — scripts e botão settings

**Files:**
- Modify: `newtab.html`

- [ ] **Step 1: Substituir o HTML pela versão completa**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New Tab</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<div class="header">
  <div class="header-right">
    <div class="search-wrap">
      <input class="search-box" id="search" type="text" placeholder="Buscar favoritos..." autocomplete="off"/>
    </div>
    <button class="btn" id="btn-shuffle" title="Shuffle">Shuffle</button>
    <button class="btn icon-btn" id="btn-settings" title="Gerenciar seções" aria-label="Gerenciar seções"></button>
  </div>
</div>

<div id="app"></div>

<script src="icons.js"></script>
<script src="storage.js"></script>
<script src="sections.js"></script>
<script src="dnd.js"></script>
<script src="modal-sections.js"></script>
<script src="dial.js"></script>
</body>
</html>
```

Notas:
- O botão `#btn-shuffle` perdeu o emoji do dado — vira só "Shuffle" (regra global zero-emoji).
- `#btn-settings` é um botão vazio (ícone injetado por JS via `iconSVG('settings')` no `init()` do `dial.js`).

- [ ] **Step 2: Commit**

```bash
git add newtab.html
git commit -m "feat: wire new scripts (icons/storage/sections/dnd/modal) and add settings button"
```

---

### Task 6: Refatorar dial.js — substituir SECTIONS hardcoded e categorize() por storage-driven

**Files:**
- Modify: `dial.js`

Esta task é grande. Para evitar miss, vou listar **exatamente** o que muda. A reescrita preserva: walk, helpers (extractDomain, ytId, clean, esc, shuffle, faviconUrl), cardHTML, lazy loader, modal (showModal/closeModal), edit/delete (chrome.bookmarks operations), carousel, search, hide brave footer.

O que muda:
1. Remover constante `SECTIONS` (linhas 4-55 atuais).
2. Adicionar variável global `STATE = { sections:[], membership:{}, meta:null }`.
3. Substituir `categorize()` por `groupByMembership(bookmarks, membership, sections)` — agrupa por `membership[bm.id]`, ordena por `sections[].order`.
4. `sectionHTML()` ganha `data-section-id` no `.group`, troca emoji por `iconSVG(sec.icon)`, e o label é editável (`contenteditable` via clique).
5. `renderAll()` itera `STATE.sections` em ordem em vez de `SECTIONS`.
6. `init()` faz: load storage → load bookmarks → ensureSeeded se necessário → reconcileMembership → renderStats + renderAll → injetar ícone no botão settings → registrar listeners.

- [ ] **Step 1: Substituir o início (linhas 1-55) — config + globals**

Substituir as linhas 1-65 (de `// SECTIONS CONFIG` até `function dbg`) por:

```js
// ============================================================
// GLOBALS
// ============================================================
var ALL = [];                    // flat list of all bookmarks {id, title, url, folderList, ...}
var STATE = {
  sections: [],                  // bd:sections, sorted by .order
  membership: {},                // bd:membership: { [bookmarkId]: sectionId }
  meta: null,                    // bd:meta
};
var logLines = [];

function dbg(s){ logLines.push(s); console.log('[BD]', s); }
```

- [ ] **Step 2: Substituir `categorize()` por `groupByMembership()`**

Substituir o bloco `// CATEGORIZE` (linhas 139-157 atuais) por:

```js
// ============================================================
// GROUP BY MEMBERSHIP
// ============================================================
function groupByMembership(bookmarks, membership, sections){
  var out = {};
  for(var i=0; i<sections.length; i++) out[sections[i].id] = [];
  for(var j=0; j<bookmarks.length; j++){
    var bm = bookmarks[j];
    var sid = membership[bm.id] || 'inbox';
    if(!out[sid]) out[sid] = []; // section removed but membership still references it -> Inbox fallback
    if(!out[sid]) out['inbox'] = out['inbox'] || [];
    (out[sid] || out['inbox']).push(bm);
  }
  return out;
}
```

- [ ] **Step 3: Substituir `sectionHTML()` para usar STATE.sections + iconSVG + data-section-id + label editável**

Substituir a função `sectionHTML()` atual por:

```js
function sectionHTML(sec, items){
  var pick = shuffle(items);
  var trackClass = 'carousel-track';
  var cards = '';
  for(var i=0; i<pick.length; i++) cards += cardHTML(pick[i], false);

  var iconHtml = (typeof iconSVG === 'function') ? iconSVG(sec.icon || 'bookmark', 18) : '';
  var labelHtml = '<span class="group-icon" style="color:'+esc(sec.color || '#ccc')+'">'
    + iconHtml + '</span>'
    + '<span class="group-label" data-section-id="'+esc(sec.id)+'" tabindex="0" '
    + 'title="Clique para renomear">'+esc(sec.label)+'</span>';

  // Empty state hint
  if(!items.length){
    return '<div class="group" data-section-id="'+esc(sec.id)+'">'
      + '<div class="group-head">'
      + '<span class="group-dot" style="background:'+esc(sec.color || '#888')+'"></span>'
      + labelHtml
      + '</div>'
      + '<div class="empty-section">Arraste um card aqui</div>'
      + '</div>';
  }

  return '<div class="group" data-section-id="'+esc(sec.id)+'">'
    + '<div class="group-head">'
    + '<span class="group-dot" style="background:'+esc(sec.color || '#888')+'"></span>'
    + labelHtml
    + '</div>'
    + '<div class="carousel-viewport">'
    + '<button class="carousel-arrow left">&#8249;</button>'
    + '<div class="'+trackClass+'">'+cards+'</div>'
    + '<button class="carousel-arrow right">&#8250;</button>'
    + '</div>'
    + '</div>';
}
```

- [ ] **Step 4: Substituir `renderAll()` para iterar STATE.sections**

Substituir a função `renderAll()` por:

```js
function renderAll(){
  var app = document.getElementById('app');
  var byId = groupByMembership(ALL, STATE.membership, STATE.sections);
  // Sort sections by order
  var sorted = STATE.sections.slice().sort(function(a,b){ return (a.order||0) - (b.order||0); });
  var html = '';
  for(var i=0; i<sorted.length; i++){
    var sec = sorted[i];
    html += sectionHTML(sec, byId[sec.id] || []);
  }
  app.innerHTML = html || '<div class="msg">Nenhuma seção configurada.</div>';
  initCarousels();
  initThumbObserver();
  if(typeof setupDragAndDrop === 'function') setupDragAndDrop();
}
```

- [ ] **Step 5: Substituir `init()` — load storage + first-time seed + reconcile + listeners**

Substituir todo o bloco `// INIT` (a partir de `function init(){`) pela versão nova:

```js
// ============================================================
// INIT
// ============================================================
async function init(){
  dbg('init start');

  var app = document.getElementById('app');
  app.innerHTML = '<div class="msg">Carregando favoritos...</div>';

  // Inject settings icon
  var settingsBtn = document.getElementById('btn-settings');
  if(settingsBtn && typeof iconSVG === 'function'){
    settingsBtn.innerHTML = iconSVG('settings', 18);
  }

  try {
    // Load bookmark tree
    var tree = await new Promise(function(resolve, reject){
      chrome.bookmarks.getTree(function(t){
        if(chrome.runtime.lastError){ reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(t);
      });
    });

    // Flatten
    ALL = [];
    for(var i=0; i<tree.length; i++){
      ALL = ALL.concat(walk(tree[i], []));
    }
    dbg('total bookmarks: ' + ALL.length);

    // Load existing storage state
    var loaded = await loadAll();
    var state = {
      sections: loaded.sections,
      membership: loaded.membership || {},
      meta: loaded.meta,
    };

    // First-time seed if needed
    if(!state.meta || !state.meta.seeded){
      dbg('first-time seed');
      state = await ensureSeeded(
        state,
        ALL,
        tree,
        saveInitialBackup,
        { sections: saveSections, membership: saveMembership, meta: saveMeta }
      );
    } else {
      // Reconcile membership against current bookmarks
      var rec = reconcileMembership(state.membership, ALL, 'inbox');
      if(rec.added.length || rec.removed.length){
        dbg('reconcile: +' + rec.added.length + ' -' + rec.removed.length);
        state.membership = rec.membership;
        await saveMembership(state.membership);
      }
    }

    STATE.sections = state.sections;
    STATE.membership = state.membership;
    STATE.meta = state.meta;

    // Sort sections by order
    STATE.sections.sort(function(a,b){ return (a.order||0) - (b.order||0); });

    renderStats();
    renderAll();
    setupBookmarkListeners();
    dbg('render complete');
  } catch(err) {
    dbg('ERROR: ' + err.message);
    app.innerHTML = '<div class="msg">Erro ao carregar bookmarks.<br>'
      + 'Verifique permissões em brave://extensions'
      + '<code>' + esc(err.message) + '\n\n' + esc(logLines.join('\n')) + '</code></div>';
  }
}

// ============================================================
// BOOKMARK CHROME EVENT LISTENERS
// ============================================================
function setupBookmarkListeners(){
  if(!chrome.bookmarks || !chrome.bookmarks.onRemoved) return;

  chrome.bookmarks.onRemoved.addListener(async function(id /*, info */){
    if(STATE.membership.hasOwnProperty(id)){
      delete STATE.membership[id];
      await saveMembership(STATE.membership);
    }
    ALL = ALL.filter(function(b){ return b.id !== id; });
    renderAll();
  });

  chrome.bookmarks.onCreated.addListener(async function(id, node){
    if(!node.url) return; // folder, ignore
    var folderList = [];
    // We don't have full path here without traversal; default to inbox.
    ALL.push({
      id: id,
      title: node.title || '(sem titulo)',
      url: node.url,
      folders: new Set(folderList),
      folderList: folderList,
      added: node.dateAdded || Date.now(),
    });
    STATE.membership[id] = 'inbox';
    await saveMembership(STATE.membership);
    renderAll();
  });

  chrome.bookmarks.onChanged.addListener(function(id, changes){
    for(var i=0; i<ALL.length; i++){
      if(ALL[i].id === id){
        if(changes.title !== undefined) ALL[i].title = changes.title;
        if(changes.url !== undefined) ALL[i].url = changes.url;
        break;
      }
    }
    var titleEl = document.querySelector('.dial-title[data-bmid="'+id+'"]');
    if(titleEl && changes.title !== undefined) titleEl.textContent = clean(changes.title);
  });

  // onMoved: ignored — membership is independent of folder structure.
}
```

- [ ] **Step 5b: Ajustar `deleteBookmark` para usar STATE.membership em vez de BY_SECTION**

A função `deleteBookmark` atual atualiza `BY_SECTION` global que vai sumir. Substituir o bloco que faz cleanup pós-delete:

Substituir:
```js
      // Remove from ALL
      ALL = ALL.filter(function(b){ return b.id !== bmId; });

      // Remove from BY_SECTION
      for(var key in BY_SECTION){
        BY_SECTION[key] = BY_SECTION[key].filter(function(b){ return b.id !== bmId; });
      }

      // Update stats and rebuild carousels
      renderStats();
      renderAll();
      closeModal();
```

Por:
```js
      // Remove from ALL
      ALL = ALL.filter(function(b){ return b.id !== bmId; });

      // Remove from membership
      if(STATE.membership.hasOwnProperty(bmId)){
        delete STATE.membership[bmId];
        saveMembership(STATE.membership);
      }

      // Update stats and rebuild carousels
      renderStats();
      renderAll();
      closeModal();
```

- [ ] **Step 6: Adicionar handler de rename inline para `.group-label`**

Adicionar ao final do bloco `document.getElementById('app').addEventListener('click', ...)` existente, ANTES do fechamento `});`:

```js
  // Section label clicked -> inline rename
  var labelEl = e.target.closest('.group-label[data-section-id]');
  if(labelEl && !labelEl.classList.contains('editing')){
    e.preventDefault();
    e.stopPropagation();
    startRenameSection(labelEl);
    return;
  }
```

E adicionar a função `startRenameSection`, próxima ao bloco de modal:

```js
// ============================================================
// RENAME SECTION INLINE
// ============================================================
function startRenameSection(labelEl){
  var sectionId = labelEl.getAttribute('data-section-id');
  var sec = STATE.sections.find(function(s){ return s.id === sectionId; });
  if(!sec) return;

  var oldLabel = sec.label;
  labelEl.classList.add('editing');
  labelEl.setAttribute('contenteditable', 'true');
  labelEl.focus();

  // Select all text
  var range = document.createRange();
  range.selectNodeContents(labelEl);
  var selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  function finish(save){
    labelEl.classList.remove('editing');
    labelEl.removeAttribute('contenteditable');
    var newLabel = labelEl.textContent.trim();
    if(save && newLabel && newLabel !== oldLabel){
      sec.label = newLabel;
      saveSections(STATE.sections).then(function(){
        dbg('renamed section ' + sectionId + ' -> ' + newLabel);
      });
    } else {
      labelEl.textContent = oldLabel;
    }
    labelEl.removeEventListener('blur', onBlur);
    labelEl.removeEventListener('keydown', onKey);
  }

  function onBlur(){ finish(true); }
  function onKey(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  }

  labelEl.addEventListener('blur', onBlur);
  labelEl.addEventListener('keydown', onKey);
}
```

- [ ] **Step 7: Settings button click handler**

Adicionar próximo aos outros event listeners no final do arquivo:

```js
document.getElementById('btn-settings').addEventListener('click', function(){
  if(typeof openSectionsModal === 'function') openSectionsModal();
});
```

- [ ] **Step 8: Verificação manual — load extension**

1. Abrir `brave://extensions`.
2. Garantir que Developer Mode está ativo.
3. Se já tem versão antiga: clicar Reload na extensão Bookmark Dial.
4. Se não tem: "Load unpacked" → selecionar `/Users/julianjedi/Projects/bookmark-dial`.
5. Abrir new tab.
6. **Verificar:**
   - Página carrega sem erro no DevTools console.
   - Aparece "[BD] first-time seed" no console (primeira vez).
   - Seções aparecem com seus ícones SVG (sem emoji).
   - YouTube em pasta Music aparece em "Praticar música" (não em Watch).
   - Botão Settings aparece no header.
   - Inbox aparece no final (se tiver bookmarks não categorizados) ou vazio.
   - Clicar no nome de uma seção entra em edição inline; Enter salva, Escape cancela.

- [ ] **Step 9: Commit**

```bash
git add dial.js
git commit -m "feat: migrate dial.js to storage-driven sections + membership"
```

---

## Phase 3 — Drag and Drop

### Task 7: Criar dnd.js — drag-and-drop entre seções

**Files:**
- Create: `dnd.js`

- [ ] **Step 1: Criar o módulo**

```js
// dnd.js
// HTML5 Drag-and-Drop handlers for moving bookmark cards between sections.
// Drop zones: .group-head and .carousel-viewport. Clones (.carousel-clone) are NOT draggable.

function setupDragAndDrop(){
  // Make real cards draggable; explicitly disable on clones.
  var cards = document.querySelectorAll('.dial-wrap');
  for(var i=0; i<cards.length; i++){
    if(cards[i].classList.contains('carousel-clone')){
      cards[i].setAttribute('draggable', 'false');
    } else {
      cards[i].setAttribute('draggable', 'true');
      _wireCard(cards[i]);
    }
  }
  var zones = document.querySelectorAll('.group-head, .carousel-viewport');
  for(var j=0; j<zones.length; j++) _wireZone(zones[j]);
}

function _wireCard(card){
  card.addEventListener('dragstart', function(e){
    var bmId = _bookmarkIdFromCard(card);
    if(!bmId){ e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', bmId);
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('bd-dragging');
    card.classList.add('bd-card-dragging');
  });
  card.addEventListener('dragend', function(){
    document.body.classList.remove('bd-dragging');
    card.classList.remove('bd-card-dragging');
    var hi = document.querySelectorAll('.bd-drop-target');
    for(var i=0; i<hi.length; i++) hi[i].classList.remove('bd-drop-target');
  });
}

function _wireZone(zone){
  var group = zone.closest('.group');
  if(!group) return;

  zone.addEventListener('dragover', function(e){
    if(!document.body.classList.contains('bd-dragging')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    group.classList.add('bd-drop-target');
  });
  zone.addEventListener('dragleave', function(e){
    // dragleave fires when moving onto child — guard with relatedTarget
    if(!group.contains(e.relatedTarget)) group.classList.remove('bd-drop-target');
  });
  zone.addEventListener('drop', function(e){
    e.preventDefault();
    group.classList.remove('bd-drop-target');
    var bmId = e.dataTransfer.getData('text/plain');
    var destSectionId = group.getAttribute('data-section-id');
    if(!bmId || !destSectionId) return;
    moveBookmark(bmId, destSectionId);
  });
}

function _bookmarkIdFromCard(card){
  // Card markup uses data-bmid on .dial-title; also has data-href but no bm id directly.
  // We'll add data-bm-id to the wrap during a render hook (see dial.js).
  var directId = card.getAttribute('data-bm-id');
  if(directId) return directId;
  var titleEl = card.querySelector('.dial-title[data-bmid]');
  return titleEl ? titleEl.getAttribute('data-bmid') : null;
}

async function moveBookmark(bmId, destSectionId){
  if(!STATE.membership || STATE.membership[bmId] === destSectionId) return; // no-op
  STATE.membership[bmId] = destSectionId;
  await saveMembership(STATE.membership);
  renderAll();
}
```

- [ ] **Step 2: Adicionar `data-bm-id` ao wrap do card em `cardHTML`**

**Files:**
- Modify: `dial.js`

Em `cardHTML()`, na linha do `<div class="dial-wrap...`, adicionar `data-bm-id`:

Substituir:
```js
  return '<div class="dial-wrap'+(big?' featured':'')+'" data-href="'+esc(bm.url)+'" title="'+esc(bm.title)+'">'
```

Por:
```js
  return '<div class="dial-wrap'+(big?' featured':'')+'" data-bm-id="'+esc(bm.id)+'" data-href="'+esc(bm.url)+'" title="'+esc(bm.title)+'">'
```

- [ ] **Step 3: Adicionar estilos no style.css**

**Files:**
- Modify: `style.css`

Adicionar ao final do arquivo:

```css
/* ============================================================
   DRAG-AND-DROP
   ============================================================ */
.dial-wrap[draggable="true"] { cursor: grab; }
.dial-wrap.bd-card-dragging  { opacity: 0.35; cursor: grabbing; }

body.bd-dragging .group {
  transition: outline 0.12s ease, background 0.12s ease;
}
body.bd-dragging .group .group-head {
  outline: 2px dashed rgba(255,255,255,0.18);
  outline-offset: 4px;
  border-radius: 6px;
}
body.bd-dragging .group.bd-drop-target .group-head {
  outline: 2px solid rgba(120,200,255,0.85);
  background: rgba(120,200,255,0.08);
}

.empty-section {
  padding: 32px 16px;
  text-align: center;
  color: rgba(255,255,255,0.4);
  font-size: 13px;
  border: 1px dashed rgba(255,255,255,0.1);
  border-radius: 8px;
  margin: 0 8px;
}
body.bd-dragging .empty-section {
  border-color: rgba(120,200,255,0.5);
  color: rgba(255,255,255,0.7);
}

.group-icon {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-right: 6px;
}
.group-label {
  cursor: text;
  padding: 2px 4px;
  border-radius: 4px;
  outline: none;
}
.group-label:hover { background: rgba(255,255,255,0.05); }
.group-label.editing {
  background: rgba(255,255,255,0.1);
  outline: 1px solid rgba(120,200,255,0.5);
  cursor: text;
}

.icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 4: Verificação manual**

1. Reload extension em `brave://extensions`.
2. Abrir new tab.
3. Console: rodar `document.querySelectorAll('.dial-wrap[draggable="true"]').length` — deve retornar número > 0 (cards reais), ignorando clones.
4. Tentar arrastar um card e soltar no header de outra seção:
   - Durante drag: outras seções mostram outline tracejado.
   - Hover na zona destino: outline sólido azul.
   - Após soltar: card aparece na nova seção.
   - Reload da página: card permanece na nova seção (persistência funciona).
5. Tentar soltar um card na MESMA seção: nada acontece.
6. Tentar arrastar um clone do carrossel: não deve disparar drag (`draggable="false"`).

- [ ] **Step 5: Commit**

```bash
git add dnd.js dial.js style.css
git commit -m "feat: drag-and-drop bookmarks between sections"
```

---

## Phase 4 — Modal "Gerenciar seções"

### Task 8: Criar modal-sections.js — estrutura básica (open, list, close)

**Files:**
- Create: `modal-sections.js`

- [ ] **Step 1: Criar o módulo com `openSectionsModal()`, listagem e fechamento**

```js
// modal-sections.js
// Modal "Gerenciar seções" — CRUD of sections + re-seed + export backup.

function openSectionsModal(){
  if(document.querySelector('.bd-sections-modal')) return; // already open

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay bd-sections-modal';
  var closeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" '
    + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>';

  overlay.innerHTML = '<div class="modal bd-modal-wide">'
    + '<div class="bd-modal-head">'
    +   '<h3>Gerenciar seções</h3>'
    +   '<button class="bd-modal-close" aria-label="Fechar">'+closeSvg+'</button>'
    + '</div>'
    + '<div class="bd-modal-body">'
    +   '<button class="bd-add-section">+ Nova seção</button>'
    +   '<ul class="bd-section-list"></ul>'
    + '</div>'
    + '<div class="bd-modal-foot">'
    +   '<button class="bd-btn-secondary" id="bd-reseed">Recategorizar tudo automaticamente</button>'
    +   '<button class="bd-btn-secondary" id="bd-export">Exportar backup</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);

  // Close on overlay or X click
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeSectionsModal(); });
  overlay.querySelector('.bd-modal-close').addEventListener('click', closeSectionsModal);
  document.addEventListener('keydown', _modalKeyHandler);

  // Wire body buttons
  overlay.querySelector('.bd-add-section').addEventListener('click', _showCreateForm);
  overlay.querySelector('#bd-reseed').addEventListener('click', _handleReSeed);
  overlay.querySelector('#bd-export').addEventListener('click', _handleExport);

  _renderSectionList();
}

function closeSectionsModal(){
  var m = document.querySelector('.bd-sections-modal');
  if(m) m.remove();
  document.removeEventListener('keydown', _modalKeyHandler);
}

function _modalKeyHandler(e){
  if(e.key === 'Escape') closeSectionsModal();
}

function _renderSectionList(){
  var list = document.querySelector('.bd-section-list');
  if(!list) return;
  var sorted = STATE.sections.slice().sort(function(a,b){ return (a.order||0) - (b.order||0); });
  var html = '';
  for(var i=0; i<sorted.length; i++){
    var s = sorted[i];
    var isBuiltin = !!s.builtin;
    html += '<li class="bd-section-row" data-section-id="'+esc(s.id)+'" draggable="true">'
      + '<span class="bd-drag-handle" title="Arrastar para reordenar">⋮⋮</span>'
      + '<span class="bd-row-icon" style="color:'+esc(s.color)+'">'+iconSVG(s.icon || 'bookmark', 18)+'</span>'
      + '<span class="bd-row-label">'+esc(s.label)+'</span>'
      + '<span class="bd-row-actions">'
      +   '<button class="bd-edit-section" title="Editar">'+iconSVG('pen-tool',16)+'</button>'
      +   (isBuiltin
            ? '<span class="bd-row-pin" title="Seção fixa">'+iconSVG('star',16)+'</span>'
            : '<button class="bd-delete-section" title="Excluir">'+iconSVG('flame',16)+'</button>')
      + '</span>'
      + '</li>';
  }
  list.innerHTML = html;

  // Wire row buttons
  list.querySelectorAll('.bd-edit-section').forEach(function(btn){
    btn.addEventListener('click', function(){
      var row = btn.closest('.bd-section-row');
      _showEditForm(row.getAttribute('data-section-id'));
    });
  });
  list.querySelectorAll('.bd-delete-section').forEach(function(btn){
    btn.addEventListener('click', function(){
      var row = btn.closest('.bd-section-row');
      _handleDelete(row.getAttribute('data-section-id'));
    });
  });

  _wireReorder();
}

// Placeholders (defined in next tasks):
function _showCreateForm(){ alert('TODO: implement in Task 9'); }
function _showEditForm(id){ alert('TODO: implement in Task 10 — section '+id); }
function _handleDelete(id){ alert('TODO: implement in Task 11 — section '+id); }
function _handleReSeed(){ alert('TODO: implement in Task 13'); }
function _handleExport(){ alert('TODO: implement in Task 14'); }
function _wireReorder(){ /* TODO: Task 12 */ }
```

- [ ] **Step 2: Adicionar estilos do modal no style.css**

Adicionar ao final de `style.css`:

```css
/* ============================================================
   MODAL: GERENCIAR SEÇÕES
   ============================================================ */
.bd-modal-wide { max-width: 560px; width: 90vw; max-height: 80vh; display: flex; flex-direction: column; }
.bd-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08);
}
.bd-modal-head h3 { margin: 0; font-size: 16px; }
.bd-modal-close {
  background: transparent; border: 0; color: inherit; cursor: pointer;
  padding: 4px; border-radius: 4px;
}
.bd-modal-close:hover { background: rgba(255,255,255,0.08); }
.bd-modal-body { padding: 16px 20px; overflow: auto; flex: 1; }
.bd-modal-foot {
  padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.08);
  display: flex; gap: 8px; justify-content: flex-end;
}
.bd-btn-secondary {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  color: inherit; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.bd-btn-secondary:hover { background: rgba(255,255,255,0.12); }

.bd-add-section {
  background: rgba(120,200,255,0.1); border: 1px dashed rgba(120,200,255,0.4);
  color: rgb(180,220,255); padding: 10px; border-radius: 6px; cursor: pointer;
  font-size: 14px; width: 100%; margin-bottom: 12px;
}
.bd-add-section:hover { background: rgba(120,200,255,0.18); }

.bd-section-list { list-style: none; padding: 0; margin: 0; }
.bd-section-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; margin-bottom: 4px;
  background: rgba(255,255,255,0.04); border-radius: 6px;
  cursor: grab;
}
.bd-section-row.bd-row-dragging { opacity: 0.4; }
.bd-drag-handle { color: rgba(255,255,255,0.3); font-size: 14px; cursor: grab; }
.bd-row-icon { display: inline-flex; }
.bd-row-label { flex: 1; }
.bd-row-actions { display: inline-flex; gap: 4px; }
.bd-row-actions button, .bd-row-pin {
  background: transparent; border: 0; color: rgba(255,255,255,0.7);
  cursor: pointer; padding: 4px; border-radius: 4px;
  display: inline-flex; align-items: center;
}
.bd-row-actions button:hover { background: rgba(255,255,255,0.1); color: white; }
.bd-row-pin { cursor: default; color: rgba(255,200,100,0.7); }
```

- [ ] **Step 3: Verificação manual**

1. Reload extension.
2. Abrir new tab.
3. Clicar no botão de Settings no header.
4. **Verificar:** modal abre, lista as 9 seções (8 padrão + Inbox), Inbox tem estrela ao invés de delete.
5. Clicar fora ou no X: modal fecha.
6. ESC: modal fecha.

- [ ] **Step 4: Commit**

```bash
git add modal-sections.js style.css
git commit -m "feat: modal skeleton for managing sections (open/close/list)"
```

---

### Task 9: Modal — formulário "Criar nova seção" (icon picker + color picker)

**Files:**
- Modify: `modal-sections.js`

- [ ] **Step 1: Substituir `_showCreateForm` e adicionar helpers de form**

Substituir a função `_showCreateForm` placeholder por:

```js
var COLOR_PALETTE = [
  '#4fc3f7','#ef5350','#ff9800','#66bb6a','#ce93d8',
  '#ab47bc','#ffa726','#26c6da','#ffd54f','#8d6e63'
];

function _showCreateForm(){
  var container = document.querySelector('.bd-modal-body');
  if(!container) return;
  var existing = container.querySelector('.bd-section-form');
  if(existing) existing.remove();

  var form = document.createElement('div');
  form.className = 'bd-section-form';
  form.innerHTML = _formHTML({ label: '', icon: 'bookmark', color: COLOR_PALETTE[0] }, 'Criar');
  container.insertBefore(form, container.querySelector('.bd-section-list'));

  _wireForm(form, function(values){
    return _createSection(values);
  });
  form.querySelector('input[name="label"]').focus();
}

function _formHTML(values, submitLabel){
  var iconGrid = iconNames().map(function(n){
    var sel = (n === values.icon) ? ' selected' : '';
    return '<button type="button" class="bd-icon-pick'+sel+'" data-icon="'+esc(n)+'" title="'+esc(n)+'">'
      + iconSVG(n, 20) + '</button>';
  }).join('');

  var colorPalette = COLOR_PALETTE.map(function(c){
    var sel = (c === values.color) ? ' selected' : '';
    return '<button type="button" class="bd-color-pick'+sel+'" data-color="'+esc(c)+'" '
      + 'style="background:'+esc(c)+'" title="'+esc(c)+'"></button>';
  }).join('');

  return '<label class="bd-field-label">Nome</label>'
    + '<input type="text" class="bd-form-input" name="label" value="'+esc(values.label || '')+'" maxlength="40"/>'
    + '<label class="bd-field-label">Ícone</label>'
    + '<div class="bd-icon-grid">'+iconGrid+'</div>'
    + '<label class="bd-field-label">Cor</label>'
    + '<div class="bd-color-row">'
    +   colorPalette
    +   '<input type="color" class="bd-color-custom" value="'+esc(values.color)+'"/>'
    + '</div>'
    + '<div class="bd-form-actions">'
    +   '<button class="bd-btn-secondary bd-form-cancel" type="button">Cancelar</button>'
    +   '<button class="bd-btn-primary bd-form-submit" type="button">'+esc(submitLabel)+'</button>'
    + '</div>';
}

function _wireForm(form, submitFn){
  var current = {
    label: form.querySelector('input[name="label"]').value,
    icon: form.querySelector('.bd-icon-pick.selected')?.getAttribute('data-icon') || 'bookmark',
    color: form.querySelector('.bd-color-pick.selected')?.getAttribute('data-color')
           || form.querySelector('.bd-color-custom').value,
  };
  form.querySelectorAll('.bd-icon-pick').forEach(function(btn){
    btn.addEventListener('click', function(){
      form.querySelectorAll('.bd-icon-pick').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      current.icon = btn.getAttribute('data-icon');
    });
  });
  form.querySelectorAll('.bd-color-pick').forEach(function(btn){
    btn.addEventListener('click', function(){
      form.querySelectorAll('.bd-color-pick').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      current.color = btn.getAttribute('data-color');
      form.querySelector('.bd-color-custom').value = current.color;
    });
  });
  form.querySelector('.bd-color-custom').addEventListener('input', function(e){
    current.color = e.target.value;
    form.querySelectorAll('.bd-color-pick').forEach(function(b){ b.classList.remove('selected'); });
  });
  form.querySelector('input[name="label"]').addEventListener('input', function(e){
    current.label = e.target.value;
  });
  form.querySelector('.bd-form-cancel').addEventListener('click', function(){ form.remove(); });
  form.querySelector('.bd-form-submit').addEventListener('click', async function(){
    if(!current.label.trim()) return;
    await submitFn(current);
    form.remove();
    _renderSectionList();
    renderAll();
  });
}

async function _createSection(values){
  var ids = STATE.sections.map(function(s){ return s.id; });
  var newId = uniqueSectionId(slugify(values.label), ids);
  var maxOrder = Math.max.apply(null, STATE.sections.filter(function(s){ return !s.builtin; }).map(function(s){ return s.order || 0; }));
  STATE.sections.push({
    id: newId,
    label: values.label.trim(),
    icon: values.icon,
    color: values.color,
    order: maxOrder + 1,
  });
  // Re-sort to keep inbox at end
  STATE.sections.sort(function(a,b){ return (a.order||0) - (b.order||0); });
  await saveSections(STATE.sections);
}
```

- [ ] **Step 2: Adicionar estilos do form em style.css**

Adicionar ao final de `style.css`:

```css
.bd-section-form {
  background: rgba(255,255,255,0.04); border-radius: 8px;
  padding: 14px; margin-bottom: 12px;
  border: 1px solid rgba(120,200,255,0.3);
}
.bd-field-label {
  display: block; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.6px; color: rgba(255,255,255,0.5);
  margin-bottom: 6px; margin-top: 10px;
}
.bd-form-input {
  width: 100%; padding: 8px 10px; border-radius: 6px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
  color: inherit; font-size: 14px; box-sizing: border-box;
}
.bd-icon-grid {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;
  max-height: 180px; overflow-y: auto; padding: 4px;
  background: rgba(0,0,0,0.2); border-radius: 6px;
}
.bd-icon-pick {
  background: transparent; border: 1px solid transparent; color: rgba(255,255,255,0.7);
  padding: 6px; border-radius: 4px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.bd-icon-pick:hover { background: rgba(255,255,255,0.08); }
.bd-icon-pick.selected {
  background: rgba(120,200,255,0.2); color: white;
  border-color: rgba(120,200,255,0.6);
}
.bd-color-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bd-color-pick {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.1); cursor: pointer; padding: 0;
}
.bd-color-pick.selected { border-color: white; transform: scale(1.15); }
.bd-color-custom {
  width: 32px; height: 32px; padding: 0; border: 1px solid rgba(255,255,255,0.15);
  border-radius: 50%; background: transparent; cursor: pointer;
}
.bd-form-actions {
  display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;
}
.bd-btn-primary {
  background: rgb(80,150,220); color: white;
  border: 0; padding: 8px 14px; border-radius: 6px;
  cursor: pointer; font-size: 13px;
}
.bd-btn-primary:hover { background: rgb(100,170,240); }
```

- [ ] **Step 3: Verificação manual**

1. Reload extension. Abrir new tab. Abrir modal de seções.
2. Clicar "+ Nova seção".
3. Form aparece. Digitar "Receitas", escolher ícone (ex: heart), cor (palette ou custom).
4. Clicar "Criar".
5. Nova seção "Receitas" aparece na lista do modal e na home (vazia, com placeholder "Arraste um card aqui").
6. Reload da página: seção persiste.

- [ ] **Step 4: Commit**

```bash
git add modal-sections.js style.css
git commit -m "feat: modal — create new section with icon and color pickers"
```

---

### Task 10: Modal — editar seção (icon/color/label)

**Files:**
- Modify: `modal-sections.js`

- [ ] **Step 1: Substituir `_showEditForm` placeholder**

```js
function _showEditForm(sectionId){
  var sec = STATE.sections.find(function(s){ return s.id === sectionId; });
  if(!sec) return;

  var row = document.querySelector('.bd-section-row[data-section-id="'+sectionId+'"]');
  if(!row) return;
  var existing = row.nextElementSibling;
  if(existing && existing.classList.contains('bd-section-form')){ existing.remove(); return; }

  var form = document.createElement('div');
  form.className = 'bd-section-form';
  form.innerHTML = _formHTML({ label: sec.label, icon: sec.icon, color: sec.color }, 'Salvar');
  row.parentNode.insertBefore(form, row.nextSibling);

  _wireForm(form, async function(values){
    sec.label = values.label.trim();
    sec.icon = values.icon;
    sec.color = values.color;
    await saveSections(STATE.sections);
  });
  form.querySelector('input[name="label"]').focus();
  form.querySelector('input[name="label"]').select();
}
```

- [ ] **Step 2: Verificação manual**

1. Reload extension. Abrir modal.
2. Clicar no botão de editar (pen-tool) de "Praticar música".
3. Trocar label para "Música — prática", trocar ícone para `headphones`, mudar cor.
4. Clicar "Salvar".
5. Lista do modal e home refletem as mudanças.
6. Reload: persistem.

- [ ] **Step 3: Commit**

```bash
git add modal-sections.js
git commit -m "feat: modal — edit existing section (label, icon, color)"
```

---

### Task 11: Modal — excluir seção (com confirmação e move-to-inbox)

**Files:**
- Modify: `modal-sections.js`

- [ ] **Step 1: Substituir `_handleDelete` placeholder**

```js
async function _handleDelete(sectionId){
  var sec = STATE.sections.find(function(s){ return s.id === sectionId; });
  if(!sec || sec.builtin) return;

  // Count bookmarks in this section
  var count = 0;
  for(var bmId in STATE.membership){
    if(STATE.membership[bmId] === sectionId) count++;
  }

  var msg = count > 0
    ? 'Excluir "'+sec.label+'"? Os '+count+' bookmark(s) que estão aqui serão movidos para "Não categorizado".'
    : 'Excluir "'+sec.label+'"?';

  if(!confirm(msg)) return;

  // Move all bookmarks of this section to inbox
  for(var bmId2 in STATE.membership){
    if(STATE.membership[bmId2] === sectionId) STATE.membership[bmId2] = 'inbox';
  }
  // Remove section
  STATE.sections = STATE.sections.filter(function(s){ return s.id !== sectionId; });

  await saveMembership(STATE.membership);
  await saveSections(STATE.sections);

  _renderSectionList();
  renderAll();
}
```

- [ ] **Step 2: Verificação manual**

1. Criar uma nova seção "Teste" e mover 2-3 cards para ela via drag.
2. Abrir modal, clicar lixo (flame) na linha "Teste".
3. Confirmação aparece com a contagem correta.
4. Confirmar: seção some, cards aparecem no Inbox.
5. Tentar excluir Inbox: botão é uma estrela (não-deletável), nada acontece.

- [ ] **Step 3: Commit**

```bash
git add modal-sections.js
git commit -m "feat: modal — delete section with move-to-inbox confirmation"
```

---

### Task 12: Modal — reordenar seções via drag-and-drop nas linhas

**Files:**
- Modify: `modal-sections.js`

- [ ] **Step 1: Substituir `_wireReorder` placeholder**

```js
var _reorderState = null;

function _wireReorder(){
  var rows = document.querySelectorAll('.bd-section-row');
  rows.forEach(function(row){
    row.addEventListener('dragstart', function(e){
      _reorderState = row.getAttribute('data-section-id');
      row.classList.add('bd-row-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _reorderState);
    });
    row.addEventListener('dragend', function(){
      row.classList.remove('bd-row-dragging');
      _reorderState = null;
    });
    row.addEventListener('dragover', function(e){
      if(_reorderState && _reorderState !== row.getAttribute('data-section-id')){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('bd-row-drop-target');
      }
    });
    row.addEventListener('dragleave', function(){
      row.classList.remove('bd-row-drop-target');
    });
    row.addEventListener('drop', async function(e){
      e.preventDefault();
      row.classList.remove('bd-row-drop-target');
      var draggedId = _reorderState || e.dataTransfer.getData('text/plain');
      var targetId = row.getAttribute('data-section-id');
      if(!draggedId || draggedId === targetId) return;
      await _reorderSection(draggedId, targetId);
    });
  });
}

async function _reorderSection(draggedId, targetId){
  // Keep inbox at the end always (regardless of moves)
  var nonBuiltin = STATE.sections.filter(function(s){ return !s.builtin; });
  var builtin = STATE.sections.filter(function(s){ return s.builtin; });

  nonBuiltin.sort(function(a,b){ return (a.order||0) - (b.order||0); });

  var draggedIdx = nonBuiltin.findIndex(function(s){ return s.id === draggedId; });
  var targetIdx = nonBuiltin.findIndex(function(s){ return s.id === targetId; });
  // If target is builtin (Inbox), insert at end of non-builtin
  if(draggedIdx === -1) return;
  if(targetIdx === -1) targetIdx = nonBuiltin.length;

  var [moved] = nonBuiltin.splice(draggedIdx, 1);
  // If moving forward, target idx shifts down by 1 after splice
  if(targetIdx > draggedIdx) targetIdx--;
  nonBuiltin.splice(targetIdx, 0, moved);

  // Recalculate order
  for(var i=0; i<nonBuiltin.length; i++) nonBuiltin[i].order = i;
  builtin.forEach(function(s){ if(s.id === 'inbox') s.order = 999; });

  STATE.sections = nonBuiltin.concat(builtin);
  await saveSections(STATE.sections);
  _renderSectionList();
  renderAll();
}
```

- [ ] **Step 2: Adicionar estilo de drop target nas linhas**

Adicionar ao `style.css`:

```css
.bd-section-row.bd-row-drop-target {
  background: rgba(120,200,255,0.15);
  outline: 2px solid rgba(120,200,255,0.6);
}
```

- [ ] **Step 3: Verificação manual**

1. Reload extension. Abrir modal.
2. Arrastar a linha de "Trabalho" para acima de "O que estudar hoje".
3. Ordem muda na lista. Fechar modal e abrir new tab: home reflete nova ordem.
4. Tentar arrastar uma seção para depois do Inbox: ela é inserida antes do Inbox (Inbox sempre no fim).

- [ ] **Step 4: Commit**

```bash
git add modal-sections.js style.css
git commit -m "feat: modal — reorder sections via drag-and-drop (inbox pinned to end)"
```

---

### Task 13: Modal — botão "Recategorizar tudo automaticamente"

**Files:**
- Modify: `modal-sections.js`

- [ ] **Step 1: Substituir `_handleReSeed` placeholder**

```js
async function _handleReSeed(){
  if(!confirm(
    'Recategorizar tudo automaticamente?\n\n'
    + 'Isso vai apagar TODAS as movimentações manuais que você fez. '
    + 'As seções customizadas serão preservadas, mas os bookmarks delas voltam para "Não categorizado" '
    + '(a menos que casem com uma regra automática das seções padrão).\n\n'
    + 'Considere exportar um backup antes.'
  )) return;

  var membership = await reSeedAll(ALL, saveMembership);
  STATE.membership = membership;
  _renderSectionList();
  renderAll();
  alert('Categorização atualizada.');
}
```

- [ ] **Step 2: Verificação manual**

1. Mover alguns cards manualmente para criar histórico de overrides.
2. Abrir modal, clicar "Recategorizar tudo automaticamente".
3. Confirmar.
4. Cards voltam para a categorização inicial.

- [ ] **Step 3: Commit**

```bash
git add modal-sections.js
git commit -m "feat: modal — re-seed all bookmarks button"
```

---

### Task 14: Modal — botão "Exportar backup" (download JSON)

**Files:**
- Modify: `modal-sections.js`

- [ ] **Step 1: Substituir `_handleExport` placeholder**

```js
async function _handleExport(){
  try {
    var data = await exportBackup();
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    a.href = url;
    a.download = 'bookmark-dial-backup-' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  } catch(err) {
    alert('Erro ao exportar: ' + err.message);
  }
}
```

- [ ] **Step 2: Verificação manual**

1. Abrir modal, clicar "Exportar backup".
2. Download de `bookmark-dial-backup-YYYY-MM-DDTHH-MM-SS.json` inicia.
3. Abrir o arquivo: JSON válido com `exportedAt`, `bookmarksTree`, `storage`.

- [ ] **Step 3: Commit**

```bash
git add modal-sections.js
git commit -m "feat: modal — export full backup as JSON"
```

---

## Phase 5 — Polish & Documentation

### Task 15: Atualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Substituir a seção "Architecture" pela nova versão**

Substituir o bloco que vai de `## Architecture` até o final do arquivo por:

```markdown
## Architecture

A extensão é composta por seis arquivos JS, três arquivos de UI/config e um diretório de testes:

### JavaScript modules (ordem de carga em newtab.html)

- **`icons.js`** — Mapa `LUCIDE_ICONS` (40 ícones Lucide embutidos como SVG strings) + helper `iconSVG(name, size)` + `iconNames()`. Sem dependências.
- **`storage.js`** — Wrapper async de `chrome.storage.local`. Chaves: `bd:sections`, `bd:membership`, `bd:meta`, `bd:initial-backup`. Funções: `loadAll`, `saveSections`, `saveMembership`, `saveMeta`, `saveInitialBackup`, `exportBackup`.
- **`sections.js`** — Configuração de seções e categorização. Exporta: `DEFAULT_SECTIONS` (8 seções + Inbox), `SEED_RULES` (regras de match por pasta/URL), `slugify`, `uniqueSectionId`, `seedCategorize`, `reconcileMembership`, `ensureSeeded`, `reSeedAll`. Suporta `module.exports` para testes Node.
- **`dnd.js`** — Setup de drag-and-drop entre seções via HTML5 DnD API. Função pública `setupDragAndDrop()` (chamada de `dial.js` após cada render) e `moveBookmark(bmId, destSectionId)`.
- **`modal-sections.js`** — Modal "Gerenciar seções": criar, renomear (label/ícone/cor), excluir, reordenar, re-semear e exportar backup. Função pública `openSectionsModal()`.
- **`dial.js`** — Entry point. Inicializa storage, lê bookmarks, faz semeadura na primeira vez, reconcilia a cada load, renderiza seções (via `STATE.sections` + `STATE.membership`), registra listeners de `chrome.bookmarks`, e cuida do search, modal de edit/delete de bookmark, lazy-load de thumbs e infinite carousel.

### Categorização — modelo "tags + override manual"

A categorização **não é determinada pela árvore de pastas a cada load**. Em vez disso:

1. **Primeira instalação:** roda `seedCategorize()` em todos os bookmarks. Match por pasta tem prioridade sobre match por URL. Resultado é salvo em `bd:membership`. Backup completo da árvore vai para `bd:initial-backup`.
2. **Loads seguintes:** lê `bd:membership` (fonte de verdade) e renderiza. Reconciliação só adiciona bookmarks novos (no Inbox) e remove os que sumiram do Brave.
3. **Drag-and-drop** atualiza `STATE.membership` e persiste.

Bookmarks do browser **nunca** são modificados pela movimentação de cards entre seções. As únicas operações que tocam `chrome.bookmarks` são as duas explícitas: editar título (`btn-edit`) e excluir bookmark (`btn-del`).

### Storage schema

| Chave | Conteúdo |
| --- | --- |
| `bd:sections` | `[{ id, label, icon, color, order, builtin? }]` ordenado por `order` |
| `bd:membership` | `{ [bookmarkId]: sectionId }` |
| `bd:meta` | `{ version, seeded }` |
| `bd:initial-backup` | `{ savedAt, tree }` |

### Drag-and-drop

- Cards reais (`.dial-wrap:not(.carousel-clone)`) recebem `draggable="true"`.
- Clones de carrossel recebem `draggable="false"`.
- Drop zones: `.group-head` (sempre visível) e `.carousel-viewport`.
- `data-bm-id` no wrap permite recuperar o ID no drop.

### Listeners do Chrome bookmarks

Configurados em `setupBookmarkListeners()` em `dial.js`:

- `onRemoved` → remove de membership + re-render.
- `onCreated` → adiciona ao Inbox + re-render.
- `onChanged` → atualiza título in-place.
- `onMoved` → ignorado (membership é independente da estrutura de pastas).

### Testes

`test/sections.test.js` cobre funções puras (`slugify`, `uniqueSectionId`, `seedCategorize`, `reconcileMembership`). Rodar com `node test/sections.test.js`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md architecture for storage-driven categorization"
```

---

### Task 16: QA final — checklist de verificação manual completa

**Files:**
- Nenhum (verificação)

- [ ] **Step 1: Testes Node**

Run:
```bash
node test/sections.test.js
```

Expected: `Result: 13 passed, 0 failed` e exit code 0.

- [ ] **Step 2: Limpar storage e simular primeira instalação**

1. Em `brave://extensions`, clicar "Detalhes" > "Inspecionar visualizações: service worker" da Bookmark Dial.
2. No console: `chrome.storage.local.clear()` + Enter. Resposta esperada: `undefined`.
3. Reload extension.
4. Abrir new tab.

- [ ] **Step 3: Checklist de verificação manual**

Para cada item, marcar OK ou anotar problema:

- [ ] Página carrega sem erros no console.
- [ ] Log "[BD] first-time seed" aparece.
- [ ] Backup foi salvo: no console do service worker, `chrome.storage.local.get('bd:initial-backup', console.log)` retorna objeto com `savedAt` e `tree`.
- [ ] As 8 seções padrão + Inbox aparecem na home.
- [ ] Cada seção tem ícone SVG (sem emoji).
- [ ] Bookmark YouTube em pasta "Music" aparece em "Praticar música" (não em "O que assistir hoje").
- [ ] Cards mostram thumbnail (YT ou favicon grande).
- [ ] Search funciona.
- [ ] Shuffle re-renderiza.
- [ ] Edit (lápis) ainda funciona — renomeia o bookmark no Brave (verificar em `chrome://bookmarks`).
- [ ] Delete (X) ainda funciona — remove o bookmark do Brave.
- [ ] Botão Settings (engrenagem) abre o modal.
- [ ] Modal lista as 9 seções com ícones corretos. Inbox tem estrela (não deletável).
- [ ] Modal: "+ Nova seção" abre form com icon picker e color picker.
- [ ] Criar nova seção "Teste": aparece na home (vazia com hint).
- [ ] Drag de um card para o header de "Teste": card move e persiste após reload.
- [ ] Drag para a mesma seção: no-op.
- [ ] Clone de carrossel não é arrastável (passar o mouse: cursor é seta, não grab).
- [ ] Modal: editar "Teste" — trocar nome, ícone e cor. Salva e reflete na home.
- [ ] Modal: reordenar — arrastar "Teste" para o topo. Home reflete.
- [ ] Modal: excluir "Teste". Cards voltam para Inbox.
- [ ] Modal: "Exportar backup" baixa JSON válido.
- [ ] Modal: "Recategorizar tudo automaticamente" reseta membership.
- [ ] Inline rename do header de seção: clicar no label, editar, Enter salva, Escape cancela.
- [ ] Adicionar um bookmark via Brave (em qualquer pasta) e voltar para new tab: aparece automaticamente no Inbox.
- [ ] Remover um bookmark via Brave e voltar: some da home automaticamente.
- [ ] Reload da página: todo o estado persiste.
- [ ] Nenhuma alteração inesperada em `chrome://bookmarks` (estrutura de pastas intocada).

- [ ] **Step 4: Se tudo passou, commit final do plano executado**

Nenhuma mudança de código nesta task — apenas verificação. Se um item falhou, voltar à task correspondente e corrigir.

---

## Notas de execução

- **Frequência de commits:** cada task termina com um commit. Não bundle múltiplas tasks em um commit.
- **Não pular testes:** `node test/sections.test.js` deve passar antes de qualquer commit que toque `sections.js`.
- **Verificação manual obrigatória:** UI/DOM mudanças não têm cobertura automatizada. O step de "verificação manual" não é opcional.
- **Bookmarks são read-only por padrão:** se em algum momento você ver código novo chamando `chrome.bookmarks.create`, `chrome.bookmarks.move` ou `chrome.bookmarks.remove` fora de `editBookmark`/`deleteBookmark` existentes em `dial.js`, isso é um bug — não foi pedido.
