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
