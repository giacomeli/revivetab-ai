// ui/dnd.ts
// Drag-and-drop HTML5 para mover cards de bookmark entre seções.

import { STATE, tstamp } from '../state';
import { saveMembership } from '../data/storage';

type RenderFn = () => void;
let _renderAll: RenderFn | null = null;
export function registerRenderer(fn: RenderFn): void { _renderAll = fn; }

let _globalsWired = false;
let _dragSeq = 0;
let _currentDragId: string | null = null;
let _dragStartTime = 0;

const DND_LOG = true; // desligar em produção se ficar ruidoso
function log(...args: unknown[]): void { if (DND_LOG) console.log('[BD-DND]', tstamp(), ...args); }
function bodyClasses(): string { return Array.from(document.body.classList).join(' ') || '(none)'; }

export function setupDragAndDrop(): void {
  const start = performance.now();
  _wireGlobalsOnce();
  const cards = document.querySelectorAll<HTMLElement>('.dial-wrap');
  let real = 0, clones = 0;
  for (const card of cards) {
    if (card.classList.contains('bd-carousel-clone')) {
      card.setAttribute('draggable', 'false');
      clones++;
    } else {
      card.setAttribute('draggable', 'true');
      _wireCard(card);
      real++;
    }
  }
  const zones = document.querySelectorAll<HTMLElement>('.bd-group');
  for (const zone of zones) _wireZone(zone);
  const dur = (performance.now() - start).toFixed(1);
  log('setupDragAndDrop wired', { realCards: real, clones, zones: zones.length, durMs: dur });
}

// cleanupDragState — remove TODAS as classes de drag do documento.
export function cleanupDragState(reason?: string): void {
  const had = {
    bodyDragging: document.body.classList.contains('bd-dragging'),
    cardDragging: document.querySelectorAll('.bd-card-dragging').length,
    dropTargets: document.querySelectorAll('.bd-drop-target').length,
  };
  document.body.classList.remove('bd-dragging');
  document.querySelectorAll('.bd-card-dragging')
    .forEach((el) => el.classList.remove('bd-card-dragging'));
  document.querySelectorAll('.bd-drop-target')
    .forEach((el) => el.classList.remove('bd-drop-target'));
  if (had.bodyDragging || had.cardDragging || had.dropTargets) {
    log('cleanupDragState', reason || '(no reason)', 'cleared:', had);
  }
}

function _wireGlobalsOnce(): void {
  if (_globalsWired) return;
  _globalsWired = true;
  log('wiring global listeners');

  document.addEventListener('dragend', (e) => {
    log('doc:dragend (capture)', { target: (e.target as Element | null)?.tagName, body: bodyClasses() });
    cleanupDragState('doc:dragend');
  }, true);

  document.addEventListener('drop', (e) => {
    log('doc:drop (capture)', { target: (e.target as Element | null)?.tagName, body: bodyClasses() });
    cleanupDragState('doc:drop');
  }, true);

  window.addEventListener('mouseup', () => {
    if (document.body.classList.contains('bd-dragging')) {
      log('window:mouseup while bd-dragging — forcing cleanup');
      cleanupDragState('window:mouseup');
    }
  });

  window.addEventListener('pointerup', () => {
    if (document.body.classList.contains('bd-dragging')) {
      log('window:pointerup while bd-dragging — forcing cleanup');
      cleanupDragState('window:pointerup');
    }
  });

  window.addEventListener('blur', () => {
    if (document.body.classList.contains('bd-dragging')) {
      log('window:blur while bd-dragging — forcing cleanup');
      cleanupDragState('window:blur');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('bd-dragging')) {
      log('ESC pressed during drag — forcing cleanup');
      cleanupDragState('escape');
    }
  });
}

function _wireCard(card: HTMLElement): void {
  card.addEventListener('dragstart', (e) => {
    const bmId = _bookmarkIdFromCard(card);
    if (!bmId) {
      log('dragstart aborted — no bookmarkId on card');
      e.preventDefault();
      return;
    }
    _dragSeq++;
    _currentDragId = bmId;
    _dragStartTime = performance.now();
    log('dragstart', { seq: _dragSeq, bmId, srcSection: (card.closest('.bd-group') as HTMLElement | null)?.dataset.sectionId });
    const dt = e.dataTransfer;
    if (dt) {
      dt.setData('text/plain', bmId);
      dt.effectAllowed = 'move';
    }
    document.body.classList.add('bd-dragging');
    card.classList.add('bd-card-dragging');
  });
  card.addEventListener('dragend', (e) => {
    const elapsed = _dragStartTime ? (performance.now() - _dragStartTime).toFixed(1) : '?';
    log('card:dragend', { seq: _dragSeq, bmId: _currentDragId, dropEffect: e.dataTransfer?.dropEffect, body: bodyClasses(), dragDurMs: elapsed });
    _currentDragId = null;
    _dragStartTime = 0;
    cleanupDragState('card:dragend');
  });
}

function _wireZone(group: HTMLElement): void {
  const sectionId = group.dataset.sectionId;

  group.addEventListener('dragover', (e) => {
    if (!document.body.classList.contains('bd-dragging')) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!group.classList.contains('bd-drop-target')) {
      log('dragenter zone', { sectionId });
    }
    group.classList.add('bd-drop-target');
  });
  group.addEventListener('dragleave', (e) => {
    if (!group.contains(e.relatedTarget as Node | null)) {
      log('dragleave zone', { sectionId });
      group.classList.remove('bd-drop-target');
    }
  });
  group.addEventListener('drop', (e) => {
    const bmId = e.dataTransfer?.getData('text/plain');
    if (!bmId || bmId !== _currentDragId || !sectionId) return;
    e.preventDefault();
    log('drop on zone', { destSectionId: sectionId, bmId, body: bodyClasses() });
    cleanupDragState('zone:drop');
    moveBookmark(bmId, sectionId);
  });
}

function _bookmarkIdFromCard(card: HTMLElement): string | null {
  const directId = card.getAttribute('data-bm-id');
  if (directId) return directId;
  const titleEl = card.querySelector('.dial-title[data-bmid]');
  return titleEl ? titleEl.getAttribute('data-bmid') : null;
}

export async function moveBookmark(bmId: string, destSectionId: string): Promise<void> {
  const currentSection = STATE.membership ? STATE.membership[bmId] : null;
  if (!STATE.membership || currentSection === destSectionId) {
    log('moveBookmark NO-OP (same section)', { bmId, currentSection, destSectionId, body: bodyClasses() });
    return;
  }
  log('moveBookmark MOVING', { bmId, from: currentSection, to: destSectionId });
  STATE.membership[bmId] = destSectionId;
  await saveMembership(STATE.membership);
  if (_renderAll) {
    log('moveBookmark calling renderAll');
    _renderAll();
  }
}
