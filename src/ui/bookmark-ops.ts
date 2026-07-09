// ui/bookmark-ops.ts — modais de editar/excluir bookmark (daisyUI).
// Escritas em chrome.bookmarks passam pelo adaptador data/bookmarks.

import { STATE, dbg } from '../state';
import { showModal, closeModal } from './modal';
import { saveMembership } from '../data/storage';
import { updateTitle, removeBookmark } from '../data/bookmarks';
import { iconSVG } from '../assets/icons';
import { t } from '../services/i18n';

function esc(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function clean(t: string): string {
  return t.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '')
    .replace(/\s*\|\s*[^|]+$/, '').trim() || t;
}

type RenderFn = () => void;
let _renderAll: RenderFn | null = null;
export function registerRenderer(fn: RenderFn): void { _renderAll = fn; }

export function editBookmark(bmId: string, currentTitle: string): void {
  const html =
    `<div class="p-6">
      <h3 class="text-lg font-semibold mb-4">${esc(t('editBookmarkHeading'))}</h3>
      <input class="input input-bordered w-full" id="modal-edit-input" type="text" value="${esc(currentTitle)}"/>
      <div class="modal-action mt-6">
        <button class="btn btn-ghost" id="modal-cancel">${esc(t('cancel'))}</button>
        <button class="btn btn-primary" id="modal-save">${esc(t('save'))}</button>
      </div>
    </div>`;

  showModal(html);
  const input = document.getElementById('modal-edit-input') as HTMLInputElement;
  input.focus();
  input.select();

  document.getElementById('modal-cancel')!.addEventListener('click', closeModal);

  document.getElementById('modal-save')!.addEventListener('click', async () => {
    const newTitle = input.value.trim();
    if (!newTitle || newTitle === currentTitle) { closeModal(); return; }

    try {
      await updateTitle(bmId, newTitle);
    } catch (err) {
      dbg('Edit error: ' + (err instanceof Error ? err.message : String(err)));
      return;
    }
    dbg('Updated bookmark ' + bmId + ' title to: ' + newTitle);

    for (let i = 0; i < STATE.all.length; i++) {
      if (STATE.all[i].id === bmId) { STATE.all[i].title = newTitle; break; }
    }
    const titleEl = document.querySelector('.dial-title[data-bmid="' + bmId + '"]');
    if (titleEl) titleEl.textContent = clean(newTitle);
    const editBtn = document.querySelector('.btn-edit[data-id="' + bmId + '"]');
    if (editBtn) editBtn.setAttribute('data-title', newTitle);
    const delBtn = document.querySelector('.btn-del[data-id="' + bmId + '"]');
    if (delBtn) delBtn.setAttribute('data-title', newTitle);
    closeModal();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (document.getElementById('modal-save') as HTMLButtonElement).click();
  });
}

export function deleteBookmark(bmId: string, title: string): void {
  let displayTitle = clean(title);
  if (displayTitle.length > 50) displayTitle = displayTitle.substring(0, 50) + '...';

  // O placeholder $TITLE$ recebe o título já escapado e envolto em <strong>;
  // a mensagem em si não carrega markup nos catálogos.
  const strongTitle = `<strong class="opacity-100">"${esc(displayTitle)}"</strong>`;
  const html =
    `<div class="p-6">
      <h3 class="text-lg font-semibold mb-2">${esc(t('deleteBookmark'))}</h3>
      <p class="text-sm opacity-75 mb-4">
        ${t('deleteConfirmQuestion', [strongTitle])}<br>
        ${esc(t('deleteConfirmWarning'))}
      </p>
      <div class="modal-action">
        <button class="btn btn-ghost" id="modal-cancel">${esc(t('cancel'))}</button>
        <button class="btn btn-error" id="modal-confirm-del">${iconSVG('trash-2', 16)} ${esc(t('delete'))}</button>
      </div>
    </div>`;

  showModal(html);

  document.getElementById('modal-cancel')!.addEventListener('click', closeModal);

  document.getElementById('modal-confirm-del')!.addEventListener('click', async () => {
    try {
      await removeBookmark(bmId);
    } catch (err) {
      dbg('Delete error: ' + (err instanceof Error ? err.message : String(err)));
      closeModal();
      return;
    }
    dbg('Deleted bookmark ' + bmId);

    STATE.all = STATE.all.filter((b) => b.id !== bmId);
    if (Object.prototype.hasOwnProperty.call(STATE.membership, bmId)) {
      delete STATE.membership[bmId];
      saveMembership(STATE.membership);
    }
    if (_renderAll) _renderAll();
    closeModal();
  });
}
