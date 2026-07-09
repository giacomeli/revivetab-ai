// services/sections.ts
// Seções padrão, regras de seed, slugify, seedCategorize, reconcileMembership.

import type { Bookmark, Membership, Meta, Section, SeedRules, TreeNode } from '../types';
import { t } from './i18n';

// Seções padrão. Os labels são resolvidos via i18n NO MOMENTO DA CHAMADA: o
// seed grava os labels no idioma do browser do usuário; instalações
// existentes mantêm os labels já salvos em bd:sections (renomeáveis pela UI).
// Ids, ícones, cores e ordem são imutáveis.
export function defaultSections(): Section[] {
  return [
    { id: 'study',   label: t('sectionStudy'),   icon: 'book-open', color: '#4fc3f7', order: 0 },
    { id: 'watch',   label: t('sectionWatch'),   icon: 'video',     color: '#ef5350', order: 1 },
    { id: 'music',   label: t('sectionMusic'),   icon: 'music',     color: '#ff9800', order: 2 },
    { id: 'tools',   label: t('sectionTools'),   icon: 'wrench',    color: '#66bb6a', order: 3 },
    { id: 'code',    label: t('sectionCode'),    icon: 'code',      color: '#ce93d8', order: 4 },
    { id: 'ai',      label: t('sectionAi'),      icon: 'bot',       color: '#ab47bc', order: 5 },
    { id: 'work',    label: t('sectionWork'),    icon: 'briefcase', color: '#ffa726', order: 6 },
    { id: 'explore', label: t('sectionExplore'), icon: 'globe',     color: '#26c6da', order: 7 },
    { id: 'inbox',   label: t('sectionInbox'),   icon: 'inbox',     color: '#888888', order: 999, builtin: true },
  ];
}

// Versão das regras de semeadura. Bump força re-seed automático nas
// instalações existentes (ver needsReSeed).
export const SEED_VERSION = 2;

// SEED_RULES — usadas na semeadura (primeira instalação ou re-seed).
// Regras GENÉRICAS, válidas para qualquer usuário: keywords universais de
// nome de pasta (pt/en, comparadas por token inteiro — ver _folderMatches)
// e padrões de URL de domínios amplamente conhecidos. Nunca acoplar a
// estruturas de pastas pessoais. Pasta tem prioridade sobre URL.
export const SEED_RULES: SeedRules = {
  study:   { folders: ['study', 'estudos', 'estudo', 'cursos', 'courses', 'learn', 'docs', 'livros', 'books'],
             urls: [/udemy\.com/, /coursera\.org/, /alura\.com/, /medium\.com/, /dev\.to/, /wikipedia\.org/] },
  watch:   { folders: ['videos', 'video', 'filmes', 'movies', 'series', 'watch', 'assistir'],
             urls: [/youtube\.com\/watch/, /youtu\.be\//, /vimeo\.com/, /netflix\.com/, /twitch\.tv/, /primevideo\.com/, /disneyplus\.com/] },
  music:   { folders: ['music', 'musica', 'musicas', 'songs'],
             urls: [/spotify\.com/, /soundcloud\.com/, /deezer\.com/, /bandcamp\.com/, /cifraclub\.com/, /ultimate-guitar\.com/] },
  tools:   { folders: ['tools', 'ferramentas', 'utils', 'util', 'apps'], urls: [] },
  code:    { folders: ['code', 'dev', 'repos', 'git', 'projetos', 'projects'],
             urls: [/github\.com/, /gitlab\.com/, /bitbucket\.org/, /stackoverflow\.com/, /npmjs\.com/] },
  ai:      { folders: ['ai', 'ia', 'llm', 'llms', 'gpt'],
             urls: [/chatgpt\.com/, /openai\.com/, /claude\.ai/, /anthropic\.com/, /gemini\.google\.com/, /huggingface\.co/, /perplexity\.ai/] },
  work:    { folders: ['work', 'trabalho', 'job', 'empresa', 'company'], urls: [] },
  explore: { folders: ['explore', 'explorar', 'shopping', 'compras', 'games', 'gaming', 'jogos', 'finance', 'financas', 'design', 'hardware', 'news', 'noticias'], urls: [] },
};

// true quando a instalação foi semeada por uma versão anterior das regras.
// Aceita Partial porque metas legadas (v1) podem não ter o campo version.
export function needsReSeed(meta: Partial<Meta> | null | undefined): boolean {
  return !!(meta && meta.seeded) && (meta.version || 1) < SEED_VERSION;
}

export function slugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'section';
}

export function uniqueSectionId(baseSlug: string, existingIds: string[]): string {
  if (!existingIds.includes(baseSlug)) return baseSlug;
  let n = 2;
  while (existingIds.includes(baseSlug + '-' + n)) n++;
  return baseSlug + '-' + n;
}

function _normalize(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Match por token inteiro (insensível a caixa e acento), nunca substring:
// keywords genéricas curtas dariam falso positivo ('ai' casaria com 'Email').
function _folderMatches(folderList: string[], ruleFolders: string[]): boolean {
  for (const folder of folderList) {
    const tokens = _normalize(folder).split(/[\s\-_/.]+/).filter(Boolean);
    if (!tokens.length) continue;
    for (const rule of ruleFolders) {
      if (tokens.includes(_normalize(rule))) return true;
    }
  }
  return false;
}

// Campos mínimos que o seed precisa de um bookmark.
export type SeedableBookmark = Pick<Partial<Bookmark>, 'url' | 'folderList'>;

export function seedCategorize(bookmark: SeedableBookmark, rules: SeedRules): string | null {
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

export interface ReconcileResult {
  membership: Membership;
  added: string[];
  removed: string[];
}

export function reconcileMembership(
  existingMembership: Membership,
  currentBookmarks: Array<Pick<Bookmark, 'id'>>,
  defaultSectionId = 'inbox'
): ReconcileResult {
  const result: Membership = {};
  const currentIds = new Set<string>();
  const added: string[] = [];
  const removed: string[] = [];
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

export interface SeededState {
  sections: Section[];
  membership: Membership;
  meta: Meta;
}

interface SeedPersisters {
  sections: (sections: Section[]) => Promise<void>;
  membership: (membership: Membership) => Promise<void>;
  meta: (meta: Meta) => Promise<void>;
}

export async function ensureSeeded(
  state: { sections: Section[] | null; membership: Membership; meta: Meta | null },
  currentBookmarks: Array<Pick<Bookmark, 'id' | 'url' | 'folderList'>>,
  currentTree: TreeNode[],
  persistBackup: (tree: TreeNode[]) => Promise<void>,
  persist: SeedPersisters
): Promise<SeededState> {
  // Já semeado: devolve o estado carregado como está (sections vem do storage).
  if (state.meta && state.meta.seeded) return state as SeededState;
  await persistBackup(currentTree);
  const sections = defaultSections();
  const membership: Membership = {};
  for (const bm of currentBookmarks) {
    membership[bm.id] = seedCategorize(bm, SEED_RULES) || 'inbox';
  }
  const meta: Meta = { version: SEED_VERSION, seeded: true };
  await persist.sections(sections);
  await persist.membership(membership);
  await persist.meta(meta);
  return { sections, membership, meta };
}

export async function reSeedAll(
  currentBookmarks: Array<Pick<Bookmark, 'id' | 'url' | 'folderList'>>,
  persistMembership: (membership: Membership) => Promise<void>
): Promise<Membership> {
  const membership: Membership = {};
  for (const bm of currentBookmarks) {
    membership[bm.id] = seedCategorize(bm, SEED_RULES) || 'inbox';
  }
  await persistMembership(membership);
  return membership;
}
