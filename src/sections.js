// sections.js
// Section configuration, seed rules, slugify, seedCategorize, reconcileMembership.

export const DEFAULT_SECTIONS = [
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
export const SEED_RULES = {
  study:   { folders: ['study','DevOps','DotNet','Frontend','Backend','Architecture','Laravel','APIs','Mobile','Research','GB','📖'], urls: [] },
  watch:   { folders: ['🎦','videos'], urls: [/youtube\.com\/watch/, /animesonline|topflix/] },
  music:   { folders: ['Music'], urls: [/cifraclub|casadagaitaponto/] },
  tools:   { folders: ['~/tools','Util'], urls: [] },
  code:    { folders: ['.git','Nice repos'], urls: [/github\.com|gitlab\.com/] },
  ai:      { folders: ['AIs','AI'], urls: [] },
  work:    { folders: ['work','🟠 Ecomm','🟢 Maestro','Senior','Unig','NFE','Glofi','🔴 RP','Rich','Important'], urls: [] },
  explore: { folders: ['/var','/tmp','hack','Gaming','Auto','Shopping','Hardware','Finance','Design','Hosting','kb','SEO'], urls: [] },
};

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'section';
}

export function uniqueSectionId(baseSlug, existingIds) {
  if (!existingIds.includes(baseSlug)) return baseSlug;
  let n = 2;
  while (existingIds.includes(baseSlug + '-' + n)) n++;
  return baseSlug + '-' + n;
}

function _folderMatches(folderList, ruleFolders) {
  for (const rule of ruleFolders) {
    const r = String(rule).toLowerCase();
    for (const f of folderList) {
      if (String(f || '').toLowerCase().indexOf(r) !== -1) return true;
    }
  }
  return false;
}

export function seedCategorize(bookmark, rules) {
  const folderList = bookmark.folderList || [];
  const url = bookmark.url || '';
  for (const sid in rules) {
    if (_folderMatches(folderList, rules[sid].folders || [])) return sid;
  }
  for (const sid in rules) {
    for (const re of (rules[sid].urls || [])) {
      if (re.test(url)) return sid;
    }
  }
  return null;
}

export function reconcileMembership(existingMembership, currentBookmarks, defaultSectionId = 'inbox') {
  const result = {};
  const currentIds = new Set();
  const added = [];
  const removed = [];
  for (const bm of currentBookmarks) {
    currentIds.add(bm.id);
    if (Object.prototype.hasOwnProperty.call(existingMembership, bm.id)) {
      result[bm.id] = existingMembership[bm.id];
    } else {
      result[bm.id] = defaultSectionId;
      added.push(bm.id);
    }
  }
  for (const id in existingMembership) {
    if (!currentIds.has(id)) removed.push(id);
  }
  return { membership: result, added, removed };
}

export async function ensureSeeded(state, currentBookmarks, currentTree, persistBackup, persist) {
  if (state.meta && state.meta.seeded) return state;
  await persistBackup(currentTree);
  const sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
  const membership = {};
  for (const bm of currentBookmarks) {
    membership[bm.id] = seedCategorize(bm, SEED_RULES) || 'inbox';
  }
  const meta = { version: 1, seeded: true };
  await persist.sections(sections);
  await persist.membership(membership);
  await persist.meta(meta);
  return { sections, membership, meta };
}

export async function reSeedAll(currentBookmarks, persistMembership) {
  const membership = {};
  for (const bm of currentBookmarks) {
    membership[bm.id] = seedCategorize(bm, SEED_RULES) || 'inbox';
  }
  await persistMembership(membership);
  return membership;
}
