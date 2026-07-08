// dial.js
// Main rendering, search, carousel, init, bookmark listeners.

import { STATE, dbg, getLog, tstamp, timed, timedAsync } from './state.js';
import { collectBookmarks } from './tree.js';
import { ytId } from './yt.js';
import { iconSVG } from './icons.js';
import {
  loadAll, saveSections, saveMembership, saveMeta, saveInitialBackup,
} from './storage.js';
import { ensureSeeded, reconcileMembership, needsReSeed, reSeedAll, SEED_VERSION } from './sections.js';
import { setupDragAndDrop, registerRenderer as registerDndRenderer, cleanupDragState } from './dnd.js';
import { openSectionsModal, registerRenderer as registerModalRenderer } from './modal-sections.js';
import { registerRenderer as registerAiRenderer } from './modal-ai.js';
import { editBookmark, deleteBookmark, registerRenderer as registerOpsRenderer } from './bookmark-ops.js';
import { showModal } from './modal.js'; // ensure side imports
import { openVideoModal } from './video-modal.js';

// ============================================================
// HELPERS
// ============================================================
function extractDomain(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
function clean(t) {
  return t.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '')
    .replace(/\s*\|\s*[^|]+$/, '').trim() || t;
}
function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}
function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function faviconUrl(u, size) {
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
function groupByMembership(bookmarks, membership, sections) {
  const out = {};
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
// Cap on cards rendered per section. Above this, MAX_PER_SECTION items are
// picked at random (shuffle + slice) from the section's bookmarks. Remaining
// are still searchable via the search box. Main perf knob (initCarousels was
// 570ms+ before this cap).
const MAX_PER_SECTION = 50;
const CARD_WIDTH_PX = 170;
const CARD_GAP_PX = 10;

// ============================================================
// CARD HTML
// ============================================================
function cardHTML(bm) {
  const d = extractDomain(bm.url);
  const yt = ytId(bm.url);
  const title = clean(bm.title);
  const initial = (d.charAt(0) || '?').toUpperCase();
  const fav = faviconUrl(bm.url);
  const favLg = faviconUrl(bm.url, 128);
  let thumb;
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
    <div class="bd-thumb-placeholder absolute inset-0 flex items-center justify-center bg-black/15">
      <div class="bd-thumb-spinner w-5 h-5 rounded-full border-2 border-white/10 border-t-white/40 animate-spin-slow"></div>
    </div>`;
  const actions = `
    <div class="dial-actions absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
      <button class="btn-edit btn btn-xs btn-square bg-white/10 hover:bg-info/50 border-0 backdrop-blur"
              data-id="${esc(bm.id)}" data-title="${esc(bm.title)}" title="Editar título" aria-label="Editar">
        ${iconSVG('pencil', 14)}
      </button>
      <button class="btn-del btn btn-xs btn-square bg-white/10 hover:bg-error/60 border-0 backdrop-blur"
              data-id="${esc(bm.id)}" data-title="${esc(bm.title)}" title="Excluir favorito" aria-label="Excluir">
        ${iconSVG('x', 14)}
      </button>
    </div>`;
  const crumbs = bm.folderList.filter((f) => f);
  const breadcrumb = crumbs.length
    ? `<div class="bd-card-breadcrumb text-[0.58rem] text-base-content/45 truncate mb-0.5">${crumbs.map((f) => esc(f)).join(' <span class="opacity-50 mx-0.5">›</span> ')}</div>`
    : '';

  // Width classes applied here (in the HTML template) to avoid a giant
  // post-render loop adding them per-card in initCarousels.
  return `
    <div class="dial-wrap group/card relative flex flex-col overflow-hidden rounded-2xl bg-base-content/5 hover:bg-base-content/10 border border-base-content/5 hover:border-base-content/15 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover cursor-pointer flex-none w-[170px] min-w-[170px]"
         data-bm-id="${esc(bm.id)}" data-href="${esc(bm.url)}" title="${esc(bm.title)}">
      ${actions}
      <div class="bd-card-thumb relative h-[105px] flex items-center justify-center overflow-hidden bg-black/25">
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
let thumbObserver = null;
function initThumbObserver() {
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      thumbObserver.unobserve(img);
      loadThumb(img);
    }
  }, { rootMargin: '200px 600px' });
  document.querySelectorAll('.bd-lazy-thumb[data-src]').forEach((img) => thumbObserver.observe(img));
}

function loadThumb(img) {
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
    const ph = img.parentElement.querySelector('.bd-thumb-placeholder');
    if (ph) ph.style.display = 'none';
  };
  loader.onerror = () => {
    if (fallback) {
      img.setAttribute('data-src', fallback);
      img.removeAttribute('data-fallback');
      loadThumb(img);
      return;
    }
    const ph = img.parentElement.querySelector('.bd-thumb-placeholder');
    if (ph) ph.innerHTML = `<span class="text-2xl font-bold uppercase opacity-50 text-base-content/50">${initial}</span>`;
    img.style.display = 'none';
  };
  loader.src = src;
}

// ============================================================
// SECTION HTML
// ============================================================
function sectionHTML(sec, items) {
  const total = items.length;
  const capped = total > MAX_PER_SECTION;
  // shuffle for variety; if capped, only build HTML for the first MAX_PER_SECTION.
  const pick = capped ? shuffle(items).slice(0, MAX_PER_SECTION) : shuffle(items);
  const cards = pick.map((bm) => cardHTML(bm)).join('');
  const iconHtml = iconSVG(sec.icon || 'bookmark', 18);
  const countBadge = capped
    ? `<span class="badge badge-sm badge-ghost ml-2 opacity-60" title="Total ${total} — mostrando ${MAX_PER_SECTION} aleatórios (clique Shuffle para outros, use a busca para encontrar específicos)">${total}/${MAX_PER_SECTION}</span>`
    : (total > 0 ? `<span class="text-xs opacity-40 ml-2">${total}</span>` : '');
  const headHtml = `
    <div class="bd-group-head flex items-center gap-2.5 pl-1 mb-3.5">
      <span class="bd-group-dot w-1.5 h-1.5 rounded-full" style="background:${esc(sec.color || '#888')}"></span>
      <span class="bd-group-icon inline-flex items-center" style="color:${esc(sec.color || '#ccc')}">${iconHtml}</span>
      <span class="bd-group-label text-sm font-medium opacity-90 cursor-text px-1 py-0.5 rounded hover:bg-base-content/5"
            data-section-id="${esc(sec.id)}" tabindex="0" title="Clique para renomear">${esc(sec.label)}</span>
      ${countBadge}
    </div>
  `;
  if (!items.length) {
    return `
      <section class="bd-group mb-8" data-section-id="${esc(sec.id)}">
        ${headHtml}
        <div class="bd-empty-section py-8 px-4 text-center text-base-content/40 text-xs border border-dashed border-base-content/10 rounded-lg mx-2">
          Arraste um card aqui
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

export function renderAll() {
  _renderCount++;
  const start = performance.now();
  cleanupDragState('renderAll');
  console.log('[BD-RENDER]', tstamp(), 'renderAll start #' + _renderCount, { body: Array.from(document.body.classList).join(' ') || '(none)' });

  const app = document.getElementById('app');
  const byId = timed('groupByMembership', () => groupByMembership(STATE.all, STATE.membership, STATE.sections));
  const sorted = STATE.sections.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const htmlBuildStart = performance.now();
  const html = sorted.map((sec) => sectionHTML(sec, byId[sec.id] || [])).join('');
  console.log('[BD-PERF]', tstamp(), 'sectionHTML loop', (performance.now() - htmlBuildStart).toFixed(1) + 'ms', '(' + sorted.length + ' sections)');

  const innerHTMLStart = performance.now();
  app.innerHTML = html || '<div class="text-center py-10 opacity-50 text-sm">Nenhuma seção configurada.</div>';
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
function initCarousels() {
  document.querySelectorAll('.bd-carousel').forEach((vp) => setupCarousel(vp));
}

function setupCarousel(viewport) {
  const track = viewport.querySelector('.bd-carousel-track');
  const cards = Array.from(track.querySelectorAll('.dial-wrap'));
  if (!cards.length) return;

  // Width/gap come from constants — no offsetWidth read needed for the card.
  // We DO read viewport.offsetWidth (once), but only after all cards have
  // their fixed widths applied via cardHTML's Tailwind classes.
  const cardW = CARD_WIDTH_PX + CARD_GAP_PX;
  const visibleCount = Math.max(1, Math.ceil(viewport.offsetWidth / cardW));
  const shouldLoop = cards.length > visibleCount;

  const leftBtn = viewport.querySelector('.bd-carousel-arrow.left');
  const rightBtn = viewport.querySelector('.bd-carousel-arrow.right');

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

  // Build clone block in a DocumentFragment first (offline DOM), then insert
  // in two batches. Single deep-clone per slot, no per-card layout thrash.
  const cloneCount = visibleCount + 1;

  const prependFrag = document.createDocumentFragment();
  for (let i = cards.length - cloneCount; i < cards.length; i++) {
    const idx = Math.max(0, i);
    const clone = cards[idx].cloneNode(true);
    clone.classList.add('bd-carousel-clone');
    const actions = clone.querySelector('.dial-actions');
    if (actions) actions.remove();
    prependFrag.appendChild(clone);
  }
  const appendFrag = document.createDocumentFragment();
  for (let i = 0; i < cloneCount && i < cards.length; i++) {
    const clone = cards[i].cloneNode(true);
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

let resizeTimer;
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
function renderSearch(q) {
  const app = document.getElementById('app');
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
    app.innerHTML = `<div class="text-center py-10 opacity-50 text-sm">Nada encontrado para "${esc(q)}"</div>`;
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
function startRenameSection(labelEl) {
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
  selection.removeAllRanges();
  selection.addRange(range);

  function finish(save) {
    labelEl.classList.remove('bg-base-content/10', 'outline', 'outline-1', 'outline-primary/50');
    labelEl.removeAttribute('contenteditable');
    const newLabel = labelEl.textContent.trim();
    if (save && newLabel && newLabel !== oldLabel) {
      sec.label = newLabel;
      saveSections(STATE.sections).then(() => dbg('renamed section ' + sectionId + ' -> ' + newLabel));
    } else {
      labelEl.textContent = oldLabel;
    }
    labelEl.removeEventListener('blur', onBlur);
    labelEl.removeEventListener('keydown', onKey);
  }
  function onBlur() { finish(true); }
  function onKey(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  }
  labelEl.addEventListener('blur', onBlur);
  labelEl.addEventListener('keydown', onKey);
}

// ============================================================
// CHROME BOOKMARK LISTENERS
// ============================================================
function setupBookmarkListeners() {
  if (!chrome.bookmarks || !chrome.bookmarks.onRemoved) return;

  chrome.bookmarks.onRemoved.addListener(async (id) => {
    if (Object.prototype.hasOwnProperty.call(STATE.membership, id)) {
      delete STATE.membership[id];
      await saveMembership(STATE.membership);
    }
    STATE.all = STATE.all.filter((b) => b.id !== id);
    renderAll();
  });

  chrome.bookmarks.onCreated.addListener(async (id, node) => {
    if (!node.url) return;
    STATE.all.push({
      id,
      title: node.title || '(sem titulo)',
      url: node.url,
      folders: new Set([]),
      folderList: [],
      added: node.dateAdded || Date.now(),
    });
    STATE.membership[id] = 'inbox';
    await saveMembership(STATE.membership);
    renderAll();
  });

  chrome.bookmarks.onChanged.addListener((id, changes) => {
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
export async function init() {
  dbg('init start');

  // Cross-module renderer wiring
  registerDndRenderer(renderAll);
  registerModalRenderer(renderAll);
  registerOpsRenderer(renderAll);
  registerAiRenderer(renderAll);

  const app = document.getElementById('app');
  app.innerHTML = '<div class="text-center py-10 opacity-50 text-sm">Carregando favoritos...</div>';

  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) settingsBtn.innerHTML = iconSVG('settings', 18);
  const shuffleBtn = document.getElementById('btn-shuffle');
  if (shuffleBtn) shuffleBtn.innerHTML = iconSVG('shuffle', 16) + '<span class="ml-1.5">Shuffle</span>';

  try {
    const tree = await new Promise((resolve, reject) => {
      chrome.bookmarks.getTree((t) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(t);
      });
    });

    timed('collectBookmarks(tree)', () => {
      STATE.all = collectBookmarks(tree);
    });
    dbg('total bookmarks: ' + STATE.all.length);

    const loaded = await loadAll();
    let state = {
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

    STATE.sections = state.sections;
    STATE.membership = state.membership;
    STATE.meta = state.meta;
    STATE.sections.sort((a, b) => (a.order || 0) - (b.order || 0));

    renderAll();
    setupBookmarkListeners();
    _initDone = true;
    dbg('render complete (init unblocked)');
  } catch (err) {
    dbg('ERROR: ' + err.message);
    app.innerHTML = `
      <div class="text-center py-10 opacity-70 text-sm">
        Erro ao carregar bookmarks.<br>
        Verifique permissões em brave://extensions
        <pre class="mt-3 p-3 bg-black/30 rounded text-error text-left text-xs max-h-48 overflow-auto whitespace-pre-wrap">${esc(err.message)}\n\n${esc(getLog().join('\n'))}</pre>
      </div>
    `;
  }
}

// ============================================================
// EVENT WIRING
// ============================================================
export function wireEvents() {
  // Delegated card click + actions
  document.getElementById('app').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit');
    if (editBtn) {
      e.preventDefault(); e.stopPropagation();
      editBookmark(editBtn.getAttribute('data-id'), editBtn.getAttribute('data-title'));
      return;
    }
    const delBtn = e.target.closest('.btn-del');
    if (delBtn) {
      e.preventDefault(); e.stopPropagation();
      deleteBookmark(delBtn.getAttribute('data-id'), delBtn.getAttribute('data-title'));
      return;
    }
    const labelEl = e.target.closest('.bd-group-label[data-section-id]');
    if (labelEl && labelEl.getAttribute('contenteditable') !== 'true') {
      console.log('[BD-CLICK] label click -> startRename', { sectionId: labelEl.getAttribute('data-section-id') });
      e.preventDefault(); e.stopPropagation();
      startRenameSection(labelEl);
      return;
    }
    const card = e.target.closest('.dial-wrap[data-href]');
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

  document.getElementById('btn-shuffle').addEventListener('click', () => {
    document.getElementById('search').value = '';
    renderAll();
  });

  document.getElementById('btn-settings').addEventListener('click', () => openSectionsModal());

  let debounceTimer;
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderSearch(e.target.value), 200);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      document.getElementById('search').focus();
    }
    if (e.key === 'Escape') {
      document.getElementById('search').value = '';
      document.getElementById('search').blur();
      renderAll();
    }
  });
}

// ============================================================
// HIDE BRAVE'S INJECTED FOOTER
// ============================================================
export function setupBraveFooterHiding() {
  function hideBraveFooter() {
    const known = ['app', 'stats', 'search', 'btn-shuffle', 'btn-settings'];
    const bodyChildren = document.body.children;
    for (let i = 0; i < bodyChildren.length; i++) {
      const el = bodyChildren[i];
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
