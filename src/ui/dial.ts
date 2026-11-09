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
  return d.innerHTML.replaceAll('"', '&quot;');
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
      alt="" draggable="false" />
      <div class="bd-yt-play absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-red-600/85 flex items-center justify-center pointer-events-none">
        <span class="block w-0 h-0 ml-0.5 border-y-[7px] border-y-transparent border-l-[12px] border-l-white"></span>
      </div>`;
  } else {
    thumb = `<img class="bd-site-thumb bd-lazy-thumb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 object-contain opacity-0 transition-opacity duration-300 rounded-xl drop-shadow"
      data-src="${esc(favLg)}"
      data-initial="${initial}"
      alt="" draggable="false" />`;
  }
  const placeholder = `
    <div class="bd-thumb-placeholder absolute inset-0 flex items-center justify-center bg-base-content/10">
      <div class="bd-thumb-spinner w-5 h-5 rounded-full border-2 border-base-content/20 border-t-base-content/60 motion-safe:animate-spin-slow"></div>
    </div>`;
  const actions = `
    <div class="dial-actions pointer-events-none absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 motion-safe:transition-opacity group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 group-hover/card:pointer-events-auto group-hover/card:opacity-100">
      <button type="button" class="btn-edit btn btn-xs btn-square border-base-content/15 bg-base-100/95 hover:bg-info"
              data-id="${esc(bm.id)}" data-title="${esc(bm.title)}" title="${esc(t('editTitleTooltip'))}" aria-label="${esc(t('edit'))}">
        ${iconSVG('pencil', 14)}
      </button>
      <button type="button" class="btn-del btn btn-xs btn-square border-base-content/15 bg-base-100/95 hover:bg-error"
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
    <div class="dial-wrap group/card relative flex w-[170px] min-w-[170px] flex-none flex-col overflow-hidden rounded-xl border border-base-content/10 bg-base-200 hover:border-base-content/25 motion-safe:transition-colors"
         data-bm-id="${esc(bm.id)}" data-href="${esc(bm.url)}" title="${esc(bm.title)}">
      <a href="${esc(bm.url)}" draggable="false" aria-label="${esc(title)}" class="bd-bookmark-link flex flex-1 flex-col rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <div class="bd-card-thumb relative h-[105px] flex items-center justify-center overflow-hidden bg-base-content/10">
          ${placeholder}${thumb}
        </div>
        <div class="bd-card-body flex flex-1 flex-col gap-0.5 px-3 py-2.5">
          ${breadcrumb}
          <div class="dial-title text-[0.78rem] font-semibold leading-snug line-clamp-2" data-bmid="${esc(bm.id)}">${esc(title)}</div>
          <div class="bd-card-domain mt-auto flex items-center gap-1 pt-1 text-[0.68rem] text-base-content/65">
            <img src="${fav}" alt="" draggable="false" class="h-3 w-3 shrink-0 rounded-sm" /><span class="truncate">${esc(d)}</span>
          </div>
        </div>
      </a>
      ${actions}
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
  const sectionId = esc(sec.id);
  const color = esc(sec.color || '#888');
  const countBadge = capped
    ? `<span class="badge badge-ghost badge-sm shrink-0 tabular-nums text-base-content/70" title="${esc(t('cappedBadgeTitle', [String(total), String(MAX_PER_SECTION)]))}">${total}/${MAX_PER_SECTION}</span>`
    : `<span class="badge badge-ghost badge-sm shrink-0 tabular-nums text-base-content/70">${total}</span>`;
  const carouselControls = items.length
    ? `
      <div class="bd-carousel-controls ml-auto hidden shrink-0 gap-1">
        <button type="button" class="bd-carousel-arrow left btn btn-square btn-sm border-base-content/15 bg-base-200"
                aria-label="${esc(t('carouselPrevious'))}" aria-controls="carousel-${sectionId}">
          <span aria-hidden="true" class="text-lg leading-none">‹</span>
        </button>
        <button type="button" class="bd-carousel-arrow right btn btn-square btn-sm border-base-content/15 bg-base-200"
                aria-label="${esc(t('carouselNext'))}" aria-controls="carousel-${sectionId}">
          <span aria-hidden="true" class="text-lg leading-none">›</span>
        </button>
      </div>`
    : '';
  const content = items.length
    ? `
      <div class="bd-carousel min-w-0">
        <div id="carousel-${sectionId}" class="bd-carousel-track flex gap-2.5 overflow-x-auto overscroll-x-contain py-0.5">${cards}</div>
      </div>`
    : `
      <p class="bd-empty-section rounded-lg border border-dashed border-base-content/15 px-4 py-3 text-sm text-base-content/65">
        ${esc(t('emptySectionHint'))}
      </p>`;
  return `
    <section class="bd-group min-w-0 rounded-2xl border border-base-content/10 bg-base-100 p-3 sm:p-4"
             data-section-id="${sectionId}" aria-labelledby="section-${sectionId}">
      <header class="bd-group-head mb-2.5 flex min-h-8 items-center gap-2">
        <span class="bd-group-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-base-content/5" aria-hidden="true" style="color:${color}">${iconHtml}</span>
        <h2 id="section-${sectionId}" class="min-w-0 text-sm font-semibold sm:text-base">
          <span class="bd-group-label block cursor-text truncate rounded px-1 py-0.5 hover:bg-base-content/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                data-section-id="${sectionId}" role="button" tabindex="0" title="${esc(t('renameSectionHint'))}">${esc(sec.label)}</span>
        </h2>
        ${countBadge}
        ${carouselControls}
      </header>
      ${content}
    </section>
  `;
}

// ============================================================
// RENDER
// ============================================================
let _renderCount = 0;

export function renderAll(): void {
  const search = document.querySelector<HTMLInputElement>('#search')!;
  if (search.value.trim()) {
    renderSearch(search.value);
    return;
  }
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
  const viewportWidth = track.clientWidth;
  if (!cards.length || track.scrollWidth <= viewportWidth) return;

  // A largura vem de um único card por carrossel, inclusive no breakpoint móvel.
  const cardStep = cards[0].offsetWidth + Number.parseFloat(getComputedStyle(track).columnGap);
  const visibleCount = Math.max(1, Math.ceil(viewportWidth / cardStep));
  const scrollAmount = cardStep * Math.max(1, Math.floor(visibleCount / 2));
  const controls = viewport.closest('.bd-group')!.querySelector<HTMLElement>('.bd-carousel-controls')!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  controls.classList.replace('hidden', 'flex');
  controls.querySelector('.left')!.addEventListener('click', () => scroll(-scrollAmount));
  controls.querySelector('.right')!.addEventListener('click', () => scroll(scrollAmount));

  function scroll(left: number): void {
    track.scrollBy({ left, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  // Bloco de clones montado em DocumentFragment (DOM offline) e inserido em
  // dois lotes. Um deep-clone por slot, sem layout thrash por card.
  const cloneCount = Math.min(cards.length, visibleCount + 1);

  function cloneCards(start: number, end: number): DocumentFragment {
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const clone = cards[i].cloneNode(true) as HTMLElement;
      clone.classList.add('bd-carousel-clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelector<HTMLAnchorElement>('.bd-bookmark-link')!.tabIndex = -1;
      clone.querySelector('.dial-actions')?.remove();
      fragment.appendChild(clone);
    }
    return fragment;
  }

  track.prepend(cloneCards(cards.length - cloneCount, cards.length));
  track.append(cloneCards(0, cloneCount));
  const realWidth = cards.length * cardStep;
  const prependWidth = cloneCount * cardStep;
  track.scrollLeft = prependWidth;

  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const sl = track.scrollLeft;
      const maxReal = prependWidth + realWidth;
      if (sl >= maxReal) {
        track.scrollLeft = sl - realWidth;
      } else if (sl <= 0) {
        track.scrollLeft = sl + realWidth;
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
    const search = document.querySelector<HTMLInputElement>('#search')!;
    if (!STATE.all.length || search.value.trim()) return;
    const focusedArrow = document.activeElement?.closest<HTMLElement>('.bd-carousel-arrow');
    const sectionId = focusedArrow?.closest<HTMLElement>('.bd-group')?.dataset.sectionId;
    const arrowSide = focusedArrow?.classList.contains('left') ? 'left' : 'right';
    renderAll();
    if (sectionId) {
      const group = document.querySelector(`.bd-group[data-section-id="${CSS.escape(sectionId)}"]`);
      const arrow = group?.querySelector<HTMLElement>(`.bd-carousel-controls:not(.hidden) .${arrowSide}`);
      (arrow ?? group?.querySelector<HTMLElement>('.bd-group-label'))?.focus({ preventScroll: true });
    }
  }, 300);
});

// ============================================================
// SEARCH
// ============================================================
function renderSearch(q: string): void {
  const app = document.getElementById('app')!;
  if (!q.trim()) { renderAll(); return; }
  cleanupDragState('renderSearch');
  const lq = q.trim().toLowerCase();
  const res = STATE.all.filter((b) => {
    if (b.title.toLowerCase().indexOf(lq) !== -1) return true;
    if (b.url.toLowerCase().indexOf(lq) !== -1) return true;
    for (const f of b.folderList) {
      if (f.toLowerCase().indexOf(lq) !== -1) return true;
    }
    return false;
  });
  if (!res.length) {
    thumbObserver?.disconnect();
    app.innerHTML = `<p role="status" class="rounded-2xl border border-base-content/10 bg-base-100 px-4 py-8 text-center text-sm text-base-content/70">${esc(t('searchNoResults', [q]))}</p>`;
    return;
  }
  const show = res.slice(0, 20);
  const cards = show.map((bm) => cardHTML(bm)).join('');
  app.innerHTML = `
    <section class="min-w-0 rounded-2xl border border-base-content/10 bg-base-100 p-3 sm:p-4">
      <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span class="inline-flex shrink-0" aria-hidden="true">${iconSVG('search', 16)}</span>
        <span class="min-w-0 truncate">"${esc(q)}"</span>
      </h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(125px,1fr))] gap-2.5 [&>.dial-wrap]:w-full [&>.dial-wrap]:min-w-0 md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">${cards}</div>
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
  labelEl.setAttribute('contenteditable', 'plaintext-only');
  labelEl.setAttribute('role', 'textbox');
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
    labelEl.setAttribute('role', 'button');
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
    document.querySelectorAll<HTMLElement>(`.dial-wrap[data-bm-id="${CSS.escape(id)}"]`).forEach((card) => {
      const link = card.querySelector<HTMLAnchorElement>('.bd-bookmark-link')!;
      if (changes.title !== undefined) {
        const title = clean(changes.title) || t('untitled');
        card.title = changes.title;
        link.setAttribute('aria-label', title);
        card.querySelector('.dial-title')!.textContent = title;
        card.querySelectorAll<HTMLElement>('.btn-edit, .btn-del').forEach((button) => {
          button.dataset.title = changes.title;
        });
      }
      if (changes.url !== undefined) {
        card.dataset.href = changes.url;
        link.href = changes.url;
      }
    });
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
  if (shuffleBtn) shuffleBtn.innerHTML = iconSVG('shuffle', 16) + `<span class="hidden sm:inline">${esc(t('shuffle'))}</span>`;
  document.getElementById('search-icon')!.innerHTML = iconSVG('search', 17);

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
  const app = document.getElementById('app')!;
  const search = document.querySelector<HTMLInputElement>('#search')!;
  app.addEventListener('click', (e) => {
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
    if (labelEl && !labelEl.isContentEditable) {
      console.log('[BD-CLICK] label click -> startRename', { sectionId: labelEl.getAttribute('data-section-id') });
      e.preventDefault(); e.stopPropagation();
      startRenameSection(labelEl);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('.bd-bookmark-link');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const href = link.getAttribute('href') || '';
    const vid = ytId(href);
    if (vid) {
      // Vídeo do YouTube toca em modal na própria new tab.
      e.preventDefault();
      openVideoModal(vid, href, link.closest<HTMLElement>('.dial-wrap')?.title || '');
    }
  });

  app.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || (e.key !== 'Enter' && e.key !== ' ')) return;
    const label = (e.target as Element).closest<HTMLElement>('.bd-group-label[data-section-id]');
    if (label && !label.isContentEditable) {
      e.preventDefault();
      startRenameSection(label);
    }
  });

  document.getElementById('btn-shuffle')!.addEventListener('click', () => {
    search.value = '';
    renderAll();
  });

  document.getElementById('btn-settings')!.addEventListener('click', () => openSectionsModal());

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderSearch(search.value), 200);
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || document.querySelector('.bd-modal-overlay, dialog[open]')) return;
    const target = e.target as Element;
    if (target.closest('#rss-feed')) return;
    const editing = target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
    if (e.key === '/' && !editing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      search.focus();
    }
    if (e.key === 'Escape' && search.value && (!editing || target === search)) {
      e.preventDefault();
      clearTimeout(debounceTimer);
      search.value = '';
      renderAll();
    }
  });
}

// ============================================================
// HIDE BRAVE'S INJECTED FOOTER
// ============================================================
export function setupBraveFooterHiding(): void {
  function hideBraveFooter(): void {
    const known = ['dashboard-header', 'dashboard'];
    const bodyChildren = document.body.children;
    for (let i = 0; i < bodyChildren.length; i++) {
      const el = bodyChildren[i] as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'link' || tag === 'style') continue;
      if (el.classList.contains('bd-modal-overlay') || tag === 'dialog') continue;
      if (!known.includes(el.id)) el.style.display = 'none';
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
