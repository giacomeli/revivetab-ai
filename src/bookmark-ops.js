// bookmark-ops.js — edit/delete bookmark modals using daisyUI.

import { STATE, dbg } from './state.js';
import { showModal, closeModal } from './modal.js';
import { saveMembership } from './storage.js';
import { iconSVG } from './icons.js';

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function clean(t) {
  return t.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '')
    .replace(/\s*\|\s*[^|]+$/, '').trim() || t;
}

let _renderAll = null;
export function registerRenderer(fn) { _renderAll = fn; }

export function editBookmark(bmId, currentTitle) {
  const html =
    `<div class="p-6">
      <h3 class="text-lg font-semibold mb-4">Editar favorito</h3>
      <input class="input input-bordered w-full" id="modal-edit-input" type="text" value="${esc(currentTitle)}"/>
      <div class="modal-action mt-6">
        <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="modal-save">Salvar</button>
      </div>
    </div>`;

  showModal(html);
  const input = document.getElementById('modal-edit-input');
  input.focus();
  input.select();

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('modal-save').addEventListener('click', () => {
    const newTitle = input.value.trim();
    if (!newTitle || newTitle === currentTitle) { closeModal(); return; }

    chrome.bookmarks.update(bmId, { title: newTitle }, () => {
      if (chrome.runtime.lastError) {
        dbg('Edit error: ' + chrome.runtime.lastError.message);
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
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('modal-save').click();
  });
}

export function deleteBookmark(bmId, title) {
  let displayTitle = clean(title);
  if (displayTitle.length > 50) displayTitle = displayTitle.substring(0, 50) + '...';

  const html =
    `<div class="p-6">
      <h3 class="text-lg font-semibold mb-2">Excluir favorito</h3>
      <p class="text-sm opacity-75 mb-4">
        Tem certeza que deseja excluir <strong class="opacity-100">"${esc(displayTitle)}"</strong>?<br>
        Isso vai remover o favorito permanentemente do browser.
      </p>
      <div class="modal-action">
        <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
        <button class="btn btn-error" id="modal-confirm-del">${iconSVG('trash-2', 16)} Excluir</button>
      </div>
    </div>`;

  showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('modal-confirm-del').addEventListener('click', () => {
    chrome.bookmarks.remove(bmId, () => {
      if (chrome.runtime.lastError) {
        dbg('Delete error: ' + chrome.runtime.lastError.message);
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
  });
}
