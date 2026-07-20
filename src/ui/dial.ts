// ui/dial.ts
// Render principal, busca, carousel, init e listeners de bookmarks.

import { STATE, dbg, getLog, tstamp, timed } from '../state';
import { collectBookmarks } from '../services/tree';
import { ytId } from '../services/yt';
import { t } from '../services/i18n';
import { iconSVG } from '../assets/icons';
import {
  loadAll, saveSections, saveMembership, saveMeta, saveInitialBackup,
} from '../data/storage';
import {
  getTree, bookmarksApiAvailable, onBookmarkRemoved, onBookmarkCreated, onBookmarkChanged,
} from '../data/bookmarks';
import {
  ensureSeeded, reconcileMembership, needsReSeed, reSeedAll, SEED_VERSION,
} from '../services/sections';
import { setupDragAndDrop, registerRenderer as registerDndRenderer, cleanupDragState } from './dnd';
import { openSectionsModal, registerRenderer as registerModalRenderer } from './modal-sections';
import { registerRenderer as registerAiRenderer } from './modal-ai';
import { editBookmark, deleteBookmark, registerRenderer as registerOpsRenderer } from './bookmark-ops';
import { openVideoModal } from './video-modal';
import type { Bookmark, Membership, Meta, Section } from '../types';

// ============================================================
// HELPERS
// ============================================================
function extractDomain(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
function clean(t: string): string {
  return t.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '')
    .replace(/\s*\|\s*[^|]+$/, '').trim() || t;
}
function esc(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}
function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function faviconUrl(u: string, size?: number): string {
  const sz = size || 32;
  try {
    const origin = new URL(u).origin;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return 'chrome-extension://' + chrome.runtime.id + '/_favicon/?pageUrl=' + encodeURIComponent(origin) + '&size=' + sz;
    }
    return 'https://www.google.com/s2/favicons?sz=' + sz + '&domain_url=' + encodeURIComponent(origin);
  } catch (e) { return ''; }
}

// ============================================================
// GROUP BY MEMBERSHIP
// ============================================================
function groupByMembership(bookmarks: Bookmark[], membership: Membership, sections: Section[]): Record<string, Bookmark[]> {
  const out: Record<string, Bookmark[]> = {};
  for (const s of sections) out[s.id] = [];
  for (const bm of bookmarks) {
    const sid = membership[bm.id] || 'inbox';
    if (!out[sid]) out['inbox'] = out['inbox'] || [];
    (out[sid] || out['inbox']).push(bm);
  }
  return out;
}

// ============================================================
// CONFIG
// ============================================================
// Teto de cards renderizados por seção. Acima disso, MAX_PER_SECTION itens são
// sorteados (shuffle + slice) dentre os bookmarks da seção. Os demais seguem
// encontráveis pela busca. Principal knob de perf (initCarousels passava de
// 570ms antes desse teto).
const MAX_PER_SECTION = 50;
const CARD_WIDTH_PX = 170;
const CARD_GAP_PX = 10;

// ============================================================
// CARD HTML
// ============================================================
function cardHTML(bm: Bookmark): string {
  const d = extractDomain(bm.url);
  const yt = ytId(bm.url);
  const title = clean(bm.title) || t('untitled');
  const initial = (d.charAt(0) || '?').toUpperCase();
  const fav = faviconUrl(bm.url);
  const favLg = faviconUrl(bm.url, 128);
  let thumb: string;
  if (yt) {
    thumb = `<img class="bd-yt-thumb bd-lazy-thumb absolute top-0 left-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
      data-src="https://img.youtube.com/vi/${yt}/mqdefault.jpg"
      data-fallback="${esc(favLg)}"
      data-initial="${initial}"
      alt="" />
      <div class="bd-yt-play absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-red-600/85 flex items-center justify-center pointer-events-none">
        <span class="block w-0 h-0 ml-0.5 border-y-[7px] border-y-transparent border-l-[12px] border-l-white"></span>
      </div>`;
  } else {
    thumb = `<img class="bd-site-thumb bd-lazy-thumb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 object-contain opacity-0 transition-opacity duration-300 rounded-xl drop-shadow"
      data-src="${esc(favLg)}"
      data-initial="${initial}"
      alt="" />`;
  }
  const placeholder = `
    <div class="bd-thumb-placeholder absolute inset-0 flex items-center justify-center bg-base-content/10">
      <div class="bd-thumb-spinner w-5 h-5 rounded-full border-2 border-base-content/20 border-t-base-content/60 animate-spin-slow"></div>
    </div>`;
  const actions = `
    <div class="dial-actions absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
      <button class="btn-edit btn btn-xs btn-square bg-base-content/10 hover:bg-info/50 border-0 backdrop-blur"
              data-id="${esc(bm.id)}" data-title="${esc(bm.title)}" title="${esc(t('editTitleTooltip'))}" aria-label="${esc(t('edit'))}">
        ${iconSVG('pencil', 14)}
      </button>
      <button class="btn-del btn btn-xs btn-square bg-base-content/10 hover:bg-error/60 border-0 backdrop-blur"
              data-id="${esc(bm.id)}" data-title="${esc(bm.title)}" title="${esc(t('deleteBookmark'))}" aria-label="${esc(t('delete'))}">
        ${iconSVG('x', 14)}
      </button>
    </div>`;
  const crumbs = bm.folderList.filter((f) => f);
  const breadcrumb = crumbs.length
    ? `<div class="bd-card-breadcrumb text-[0.58rem] text-base-content/45 truncate mb-0.5">${crumbs.map((f) => esc(f)).join(' <span class="opacity-50 mx-0.5">›</span> ')}</div>`
    : '';

  // Classes de largura aplicadas aqui (no template) para evitar um loop
  // pós-render gigante adicionando-as por card no initCarousels.
  return `
    <div class="dial-wrap group/card relative flex flex-col overflow-hidden rounded-2xl bg-base-content/5 hover:bg-base-content/10 border border-base-content/5 hover:border-base-content/15 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover cursor-pointer flex-none w-[170px] min-w-[170px]"
         data-bm-id="${esc(bm.id)}" data-href="${esc(bm.url)}" title="${esc(bm.title)}">
      ${actions}
      <div class="bd-card-thumb relative h-[105px] flex items-center justify-center overflow-hidden bg-base-content/10">
        ${placeholder}${thumb}
      </div>
      <div class="bd-card-body flex flex-col gap-0.5 px-3 py-2.5">
        ${breadcrumb}
        <div class="dial-title text-[0.78rem] font-medium leading-snug line-clamp-2" data-bmid="${esc(bm.id)}">${esc(title)}</div>
        <div class="bd-card-domain mt-auto flex items-center gap-1 text-[0.68rem] text-base-content/50">
          <img src="${fav}" alt="" class="w-3 h-3 rounded-sm" onerror="this.style.display='none'"/>${esc(d)}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// LAZY LOAD
// ============================================================
let thumbObserver: IntersectionObserver | null = null;
function initThumbObserver(): void {
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target as HTMLImageElement;
      thumbObserver!.unobserve(img);
      loadThumb(img);
    }
  }, { rootMargin: '200px 600px' });
  document.querySelectorAll<HTMLImageElement>('.bd-lazy-thumb[data-src]').forEach((img) => thumbObserver!.observe(img));
}

function loadThumb(img: HTMLImageElement): void {
  const src = img.getAttribute('data-src');
  const fallback = img.getAttribute('data-fallback');
  const initial = img.getAttribute('data-initial') || '?';
  if (!src) return;
  const loader = new Image();
  loader.onload = () => {
    img.src = src;
    img.removeAttribute('data-src');
    img.classList.remove('opacity-0');
    img.classList.add('opacity-100');
    const ph = img.parentElement?.querySelector<HTMLElement>('.bd-thumb-placeholder');
    if (ph) ph.style.display = 'none';
  };
  loader.onerror = () => {
    if (fallback) {
      img.setAttribute('data-src', fallback);
      img.removeAttribute('data-fallback');
      loadThumb(img);
      return;
    }
    const ph = img.parentElement?.querySelector<HTMLElement>('.bd-thumb-placeholder');
    if (ph) ph.innerHTML = `<span class="text-2xl font-bold uppercase opacity-50 text-base-content/50">${initial}</span>`;
    img.style.display = 'none';
  };
  loader.src = src;
}

// ============================================================
// SECTION HTML
// ============================================================
function sectionHTML(sec: Section, items: Bookmark[]): string {
  const total = items.length;
  const capped = total > MAX_PER_SECTION;
  // shuffle para variedade; se passou do teto, só monta HTML dos MAX_PER_SECTION.
  const pick = capped ? shuffle(items).slice(0, MAX_PER_SECTION) : shuffle(items);
  const cards = pick.map((bm) => cardHTML(bm)).join('');
  const iconHtml = iconSVG(sec.icon || 'bookmark', 18);
  const countBadge = capped
    ? `<span class="badge badge-sm badge-ghost ml-2 opacity-60" title="${esc(t('cappedBadgeTitle', [String(total), String(MAX_PER_SECTION)]))}">${total}/${MAX_PER_SECTION}</span>`
    : (total > 0 ? `<span class="text-xs opacity-40 ml-2">${total}</span>` : '');
  const headHtml = `
    <div class="bd-group-head flex items-center gap-2.5 pl-1 mb-3.5">
      <span class="bd-group-dot w-1.5 h-1.5 rounded-full" style="background:${esc(sec.color || '#888')}"></span>
      <span class="bd-group-icon inline-flex items-center" style="color:${esc(sec.color || '#ccc')}">${iconHtml}</span>
      <span class="bd-group-label text-sm font-medium opacity-90 cursor-text px-1 py-0.5 rounded hover:bg-base-content/5"
            data-section-id="${esc(sec.id)}" tabindex="0" title="${esc(t('renameSectionHint'))}">${esc(sec.label)}</span>
      ${countBadge}
    </div>
  `;
  if (!items.length) {
    return `
      <section class="bd-group mb-8" data-section-id="${esc(sec.id)}">
        ${headHtml}
        <div class="bd-empty-section py-8 px-4 text-center text-base-content/40 text-xs border border-dashed border-base-content/10 rounded-lg mx-2">
          ${esc(t('emptySectionHint'))}
        </div>
      </section>
    `;
  }
  return `
    <section class="bd-group mb-8" data-section-id="${esc(sec.id)}">
      ${headHtml}
      <div class="bd-carousel relative">
        <button class="bd-carousel-arrow left btn btn-circle btn-sm absolute top-1/2 -translate-y-1/2 -left-1 z-10 opacity-0 transition-opacity bg-base-100/85 backdrop-blur border border-base-content/15 hover:bg-base-content/15">
          <span class="text-lg leading-none">‹</span>
        </button>
        <div class="bd-carousel-track flex gap-2.5 overflow-x-hidden py-1 scroll-smooth">${cards}</div>
        <button class="bd-carousel-arrow right btn btn-circle btn-sm absolute top-1/2 -translate-y-1/2 -right-1 z-10 opacity-0 transition-opacity bg-base-100/85 backdrop-blur border border-base-content/15 hover:bg-base-content/15">
          <span class="text-lg leading-none">›</span>
        </button>
      </div>
    </section>
  `;
}

// ============================================================
// RENDER
// ============================================================
let _renderCount = 0;

export function renderAll(): void {
  _renderCount++;
  const start = performance.now();
  cleanupDragState('renderAll');
  console.log('[BD-RENDER]', tstamp(), 'renderAll start #' + _renderCount, { body: Array.from(document.body.classList).join(' ') || '(none)' });

  const app = document.getElementById('app')!;
  const byId = timed('groupByMembership', () => groupByMembership(STATE.all, STATE.membership, STATE.sections));
  const sorted = STATE.sections.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const htmlBuildStart = performance.now();
  const html = sorted.map((sec) => sectionHTML(sec, byId[sec.id] || [])).join('');
  console.log('[BD-PERF]', tstamp(), 'sectionHTML loop', (performance.now() - htmlBuildStart).toFixed(1) + 'ms', '(' + sorted.length + ' sections)');

  const innerHTMLStart = performance.now();
  app.innerHTML = html || `<div class="text-center py-10 opacity-50 text-sm">${esc(t('noSections'))}</div>`;
  console.log('[BD-PERF]', tstamp(), 'app.innerHTML set', (performance.now() - innerHTMLStart).toFixed(1) + 'ms');

  timed('initCarousels', () => initCarousels());
  timed('initThumbObserver', () => initThumbObserver());
  timed('setupDragAndDrop', () => setupDragAndDrop());

  const total = (performance.now() - start).toFixed(1);
  console.log('[BD-RENDER]', tstamp(), 'renderAll #' + _renderCount + ' done in ' + total + 'ms');
}

// ============================================================
// CAROUSEL
// ============================================================
function initCarousels(): void {
  document.querySelectorAll<HTMLElement>('.bd-carousel').forEach((vp) => setupCarousel(vp));
}

function setupCarousel(viewport: HTMLElement): void {
  const track = viewport.querySelector<HTMLElement>('.bd-carousel-track')!;
  const cards = Array.from(track.querySelectorAll<HTMLElement>('.dial-wrap'));
  if (!cards.length) return;

  // Largura/gap vêm de constantes — sem leitura de offsetWidth por card.
  // Lemos viewport.offsetWidth (uma vez), mas só depois de todos os cards
  // terem largura fixa via classes Tailwind do cardHTML.
  const cardW = CARD_WIDTH_PX + CARD_GAP_PX;
  const visibleCount = Math.max(1, Math.ceil(viewport.offsetWidth / cardW));
  const shouldLoop = cards.length > visibleCount;

  const leftBtn = viewport.querySelector<HTMLElement>('.bd-carousel-arrow.left')!;
  const rightBtn = viewport.querySelector<HTMLElement>('.bd-carousel-arrow.right')!;

  if (!shouldLoop) {
    leftBtn.classList.add('hidden');
    if (cards.length <= visibleCount) rightBtn.classList.add('hidden');
  }
  viewport.addEventListener('mouseenter', () => {
    if (!leftBtn.classList.contains('hidden')) leftBtn.classList.add('opacity-100');
    if (!rightBtn.classList.contains('hidden')) rightBtn.classList.add('opacity-100');
  });
  viewport.addEventListener('mouseleave', () => {
    leftBtn.classList.remove('opacity-100');
    rightBtn.classList.remove('opacity-100');
  });

  const scrollAmount = cardW * Math.max(1, Math.floor(visibleCount / 2));
  leftBtn.addEventListener('click', (e) => { e.stopPropagation(); track.scrollBy({ left: -scrollAmount, behavior: 'smooth' }); });
  rightBtn.addEventListener('click', (e) => { e.stopPropagation(); track.scrollBy({ left: scrollAmount, behavior: 'smooth' }); });

  if (!shouldLoop) return;

  // Bloco de clones montado em DocumentFragment (DOM offline) e inserido em
  // dois lotes. Um deep-clone por slot, sem layout thrash por card.
  const cloneCount = visibleCount + 1;

  const prependFrag = document.createDocumentFragment();
  for (let i = cards.length - cloneCount; i < cards.length; i++) {
    const idx = Math.max(0, i);
    const clone = cards[idx].cloneNode(true) as HTMLElement;
    clone.classList.add('bd-carousel-clone');
    const actions = clone.querySelector('.dial-actions');
    if (actions) actions.remove();
    prependFrag.appendChild(clone);
  }
  const appendFrag = document.createDocumentFragment();
  for (let i = 0; i < cloneCount && i < cards.length; i++) {
    const clone = cards[i].cloneNode(true) as HTMLElement;
    clone.classList.add('bd-carousel-clone');
    const actions = clone.querySelector('.dial-actions');
    if (actions) actions.remove();
    appendFrag.appendChild(clone);
  }
  track.insertBefore(prependFrag, track.firstChild);
  track.appendChild(appendFrag);

  track.style.scrollBehavior = 'auto';
  track.scrollLeft = cloneCount * cardW;
  track.style.scrollBehavior = 'smooth';

  let ticking = false;
  const realWidth = cards.length * cardW;
  const prependWidth = cloneCount * cardW;

  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const sl = track.scrollLeft;
      const maxReal = prependWidth + realWidth;
      if (sl >= maxReal) {
        track.style.scrollBehavior = 'auto';
        track.scrollLeft = prependWidth + (sl - maxReal);
        track.style.scrollBehavior = 'smooth';
      } else if (sl <= 0) {
        track.style.scrollBehavior = 'auto';
        track.scrollLeft = maxReal - prependWidth + sl;
        track.style.scrollBehavior = 'smooth';
      }
      ticking = false;
    });
  });
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
let _initDone = false;
window.addEventListener('resize', () => {
  if (!_initDone) {
    console.log('[BD-PERF]', tstamp(), 'resize ignored (init not done)');
    return;
  }
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    console.log('[BD-PERF]', tstamp(), 'resize triggering renderAll');
    if (STATE.all.length) renderAll();
  }, 300);
});

// ============================================================
// SEARCH
// ============================================================
function renderSearch(q: string): void {
  const app = document.getElementById('app')!;
  if (!q.trim()) { renderAll(); return; }
  const lq = q.toLowerCase();
  const res = STATE.all.filter((b) => {
    if (b.title.toLowerCase().indexOf(lq) !== -1) return true;
    if (b.url.toLowerCase().indexOf(lq) !== -1) return true;
    for (const f of b.folderList) {
      if (f.toLowerCase().indexOf(lq) !== -1) return true;
    }
    return false;
  });
  if (!res.length) {
    app.innerHTML = `<div class="text-center py-10 opacity-50 text-sm">${esc(t('searchNoResults', [q]))}</div>`;
    return;
  }
  const show = res.slice(0, 20);
  const cards = show.map((bm) => cardHTML(bm)).join('');
  app.innerHTML = `
    <section class="mb-8">
      <div class="flex items-center gap-2.5 pl-1 mb-3.5">
        <span class="w-1.5 h-1.5 rounded-full bg-base-content/40"></span>
        <span class="inline-flex">${iconSVG('search', 16)}</span>
        <span class="text-sm font-medium opacity-90">"${esc(q)}"</span>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5">${cards}</div>
    </section>
  `;
  initThumbObserver();
}

// ============================================================
// RENAME SECTION INLINE
// ============================================================
function startRenameSection(labelEl: HTMLElement): void {
  const sectionId = labelEl.getAttribute('data-section-id');
  const sec = STATE.sections.find((s) => s.id === sectionId);
  if (!sec) return;
  console.warn('[BD-RENAME] startRenameSection called', { sectionId, label: sec.label });
  const oldLabel = sec.label;
  labelEl.classList.add('bg-base-content/10', 'outline', 'outline-1', 'outline-primary/50');
  labelEl.setAttribute('contenteditable', 'true');
  labelEl.focus();
  const range = document.createRange();
  range.selectNodeContents(labelEl);
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function finish(save: boolean): void {
    labelEl.classList.remove('bg-base-content/10', 'outline', 'outline-1', 'outline-primary/50');
    labelEl.removeAttribute('contenteditable');
    const newLabel = (labelEl.textContent || '').trim();
    if (save && newLabel && newLabel !== oldLabel && sec) {
      sec.label = newLabel;
      saveSections(STATE.sections).then(() => dbg('renamed section ' + sectionId + ' -> ' + newLabel));
    } else {
      labelEl.textContent = oldLabel;
    }
    labelEl.removeEventListener('blur', onBlur);
    labelEl.removeEventListener('keydown', onKey);
  }
  function onBlur(): void { finish(true); }
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  }
  labelEl.addEventListener('blur', onBlur);
  labelEl.addEventListener('keydown', onKey);
}

// ============================================================
// CHROME BOOKMARK LISTENERS
// ============================================================
function setupBookmarkListeners(): void {
  if (!bookmarksApiAvailable()) return;

  onBookmarkRemoved(async (id) => {
    if (Object.prototype.hasOwnProperty.call(STATE.membership, id)) {
      delete STATE.membership[id];
      await saveMembership(STATE.membership);
    }
    STATE.all = STATE.all.filter((b) => b.id !== id);
    renderAll();
  });

  onBookmarkCreated(async (id, node) => {
    if (!node.url) return;
    STATE.all.push({
      id,
      title: node.title || '',
      url: node.url,
      folders: new Set<string>([]),
      folderList: [],
      added: node.dateAdded || Date.now(),
    });
    STATE.membership[id] = 'inbox';
    await saveMembership(STATE.membership);
    renderAll();
  });

  onBookmarkChanged((id, changes) => {
    for (let i = 0; i < STATE.all.length; i++) {
      if (STATE.all[i].id === id) {
        if (changes.title !== undefined) STATE.all[i].title = changes.title;
        if (changes.url !== undefined) STATE.all[i].url = changes.url;
        break;
      }
    }
    const titleEl = document.querySelector('.dial-title[data-bmid="' + id + '"]');
    if (titleEl && changes.title !== undefined) titleEl.textContent = clean(changes.title);
  });
}

// ============================================================
// INIT
// ============================================================
export async function init(): Promise<void> {
  dbg('init start');

  // Wiring de renderer entre módulos
  registerDndRenderer(renderAll);
  registerModalRenderer(renderAll);
  registerOpsRenderer(renderAll);
  registerAiRenderer(renderAll);

  const app = document.getElementById('app')!;
  app.innerHTML = `<div class="text-center py-10 opacity-50 text-sm">${esc(t('loadingBookmarks'))}</div>`;

  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) settingsBtn.innerHTML = iconSVG('settings', 18);
  const shuffleBtn = document.getElementById('btn-shuffle');
  if (shuffleBtn) shuffleBtn.innerHTML = iconSVG('shuffle', 16) + `<span class="ml-1.5">${esc(t('shuffle'))}</span>`;

  try {
    const tree = await getTree();

    timed('collectBookmarks(tree)', () => {
      STATE.all = collectBookmarks(tree);
    });
    dbg('total bookmarks: ' + STATE.all.length);

    const loaded = await loadAll();
    let state: { sections: Section[] | null; membership: Membership; meta: Meta | null } = {
      sections: loaded.sections,
      membership: loaded.membership || {},
      meta: loaded.meta,
    };

    if (!state.meta || !state.meta.seeded) {
      dbg('first-time seed');
      state = await ensureSeeded(
        state,
        STATE.all,
        tree,
        saveInitialBackup,
        { sections: saveSections, membership: saveMembership, meta: saveMeta }
      );
    } else if (needsReSeed(state.meta)) {
      // Regras de seed mudaram de versão: re-semear membership com as regras
      // novas. Não toca em bd:sections nem em bd:initial-backup.
      dbg('seed rules v' + (state.meta.version || 1) + ' -> v' + SEED_VERSION + ': re-seeding membership');
      state.membership = await reSeedAll(STATE.all, saveMembership);
      state.meta = { version: SEED_VERSION, seeded: true };
      await saveMeta(state.meta);
    } else {
      const rec = reconcileMembership(state.membership, STATE.all, 'inbox');
      if (rec.added.length || rec.removed.length) {
        dbg('reconcile: +' + rec.added.length + ' -' + rec.removed.length);
        state.membership = rec.membership;
        await saveMembership(state.membership);
      }
    }

    STATE.sections = state.sections || [];
    STATE.membership = state.membership;
    STATE.meta = state.meta;
    STATE.sections.sort((a, b) => (a.order || 0) - (b.order || 0));

    renderAll();
    setupBookmarkListeners();
    _initDone = true;
    dbg('render complete (init unblocked)');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dbg('ERROR: ' + message);
    app.innerHTML = `
      <div class="text-center py-10 opacity-70 text-sm">
        ${esc(t('loadErrorTitle'))}<br>
        ${esc(t('loadErrorHint'))}
        <pre class="mt-3 p-3 bg-base-content/10 rounded text-error text-left text-xs max-h-48 overflow-auto whitespace-pre-wrap">${esc(message)}\n\n${esc(getLog().join('\n'))}</pre>
      </div>
    `;
  }
}

// ============================================================
// EVENT WIRING
// ============================================================
export function wireEvents(): void {
  // Clique delegado em cards + ações
  document.getElementById('app')!.addEventListener('click', (e) => {
    const target = e.target as Element;
    const editBtn = target.closest('.btn-edit');
    if (editBtn) {
      e.preventDefault(); e.stopPropagation();
      editBookmark(editBtn.getAttribute('data-id') || '', editBtn.getAttribute('data-title') || '');
      return;
    }
    const delBtn = target.closest('.btn-del');
    if (delBtn) {
      e.preventDefault(); e.stopPropagation();
      deleteBookmark(delBtn.getAttribute('data-id') || '', delBtn.getAttribute('data-title') || '');
      return;
    }
    const labelEl = target.closest<HTMLElement>('.bd-group-label[data-section-id]');
    if (labelEl && labelEl.getAttribute('contenteditable') !== 'true') {
      console.log('[BD-CLICK] label click -> startRename', { sectionId: labelEl.getAttribute('data-section-id') });
      e.preventDefault(); e.stopPropagation();
      startRenameSection(labelEl);
      return;
    }
    const card = target.closest('.dial-wrap[data-href]');
    if (card) {
      const href = card.getAttribute('data-href');
      if (!href) return;
      const vid = ytId(href);
      if (vid) {
        // Vídeo do YouTube toca em modal na própria new tab.
        openVideoModal(vid, href, card.getAttribute('title') || '');
        return;
      }
      window.location.href = href;
    }
  });

  document.getElementById('btn-shuffle')!.addEventListener('click', () => {
    (document.getElementById('search') as HTMLInputElement).value = '';
    renderAll();
  });

  document.getElementById('btn-settings')!.addEventListener('click', () => openSectionsModal());

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  document.getElementById('search')!.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderSearch((e.target as HTMLInputElement).value), 200);
  });

  document.addEventListener('keydown', (e) => {
    const search = document.getElementById('search') as HTMLInputElement;
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      search.focus();
    }
    if (e.key === 'Escape') {
      search.value = '';
      search.blur();
      renderAll();
    }
  });
}

// ============================================================
// HIDE BRAVE'S INJECTED FOOTER
// ============================================================
export function setupBraveFooterHiding(): void {
  function hideBraveFooter(): void {
    const known = ['app', 'stats', 'search', 'btn-shuffle', 'btn-settings'];
    const bodyChildren = document.body.children;
    for (let i = 0; i < bodyChildren.length; i++) {
      const el = bodyChildren[i] as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'link' || tag === 'style') continue;
      if (el.classList.contains('header') || el.id === 'app') continue;
      if (el.classList.contains('bd-modal-overlay')) continue;
      if (el.id === 'search') continue;
      if (!el.id || known.indexOf(el.id) === -1) {
        if (el.className && (el.className.toString().indexOf('header') !== -1)) continue;
        el.style.display = 'none';
      }
    }
  }
  hideBraveFooter();
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length) hideBraveFooter();
    }
  });
  observer.observe(document.body, { childList: true });
}
