// dnd.js
// HTML5 Drag-and-Drop handlers for moving bookmark cards between sections.

import { STATE } from './state.js';
import { saveMembership } from './storage.js';

let _renderAll = null;
export function registerRenderer(fn) { _renderAll = fn; }

export function setupDragAndDrop() {
  const cards = document.querySelectorAll('.dial-wrap');
  for (const card of cards) {
    if (card.classList.contains('bd-carousel-clone')) {
      card.setAttribute('draggable', 'false');
    } else {
      card.setAttribute('draggable', 'true');
      _wireCard(card);
    }
  }
  const zones = document.querySelectorAll('.bd-group-head, .bd-carousel');
  for (const zone of zones) _wireZone(zone);
}

function _wireCard(card) {
  card.addEventListener('dragstart', (e) => {
    const bmId = _bookmarkIdFromCard(card);
    if (!bmId) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', bmId);
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('bd-dragging');
    card.classList.add('bd-card-dragging');
  });
  card.addEventListener('dragend', () => {
    document.body.classList.remove('bd-dragging');
    card.classList.remove('bd-card-dragging');
    document.querySelectorAll('.bd-drop-target').forEach((el) => el.classList.remove('bd-drop-target'));
  });
}

function _wireZone(zone) {
  const group = zone.closest('.bd-group');
  if (!group) return;
  zone.addEventListener('dragover', (e) => {
    if (!document.body.classList.contains('bd-dragging')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    group.classList.add('bd-drop-target');
  });
  zone.addEventListener('dragleave', (e) => {
    if (!group.contains(e.relatedTarget)) group.classList.remove('bd-drop-target');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    group.classList.remove('bd-drop-target');
    const bmId = e.dataTransfer.getData('text/plain');
    const destSectionId = group.getAttribute('data-section-id');
    if (!bmId || !destSectionId) return;
    moveBookmark(bmId, destSectionId);
  });
}

function _bookmarkIdFromCard(card) {
  const directId = card.getAttribute('data-bm-id');
  if (directId) return directId;
  const titleEl = card.querySelector('.dial-title[data-bmid]');
  return titleEl ? titleEl.getAttribute('data-bmid') : null;
}

export async function moveBookmark(bmId, destSectionId) {
  if (!STATE.membership || STATE.membership[bmId] === destSectionId) return;
  STATE.membership[bmId] = destSectionId;
  await saveMembership(STATE.membership);
  if (_renderAll) _renderAll();
}
