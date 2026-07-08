// modal.js — shared modal helper using daisyUI modal classes.

let _activeEscHandler = null;

export function showModal(html, options = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal modal-open bd-modal-overlay';
  const boxClass = options.boxClass || (options.wide ? 'modal-box max-w-2xl p-0' : 'modal-box');
  overlay.innerHTML =
    `<div class="${boxClass}">${html}</div>` +
    `<div class="modal-backdrop bg-black/60"></div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('modal-backdrop')) {
      closeModal();
    }
  });

  _activeEscHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', _activeEscHandler);
  return overlay;
}

export function closeModal() {
  const m = document.querySelector('.bd-modal-overlay');
  if (m) m.remove();
  if (_activeEscHandler) {
    document.removeEventListener('keydown', _activeEscHandler);
    _activeEscHandler = null;
  }
}
