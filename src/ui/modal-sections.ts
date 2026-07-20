// ui/modal-sections.ts
// Modal "Gerenciar seções" — abas: Seções (CRUD + re-seed + export) e IA
// (organização automática, ver modal-ai.ts).

import { STATE } from '../state';
import { showModal, closeModal } from './modal';
import { iconSVG, iconNames } from '../assets/icons';
import { saveSections, saveMembership, exportBackup } from '../data/storage';
import { slugify, uniqueSectionId, reSeedAll } from '../services/sections';
import { getThemePref, setThemePref, normalizeThemePref } from '../services/theme';
import type { ThemePref } from '../services/theme';
import { renderAiTab } from './modal-ai';
import { t } from '../services/i18n';
import type { Section } from '../types';

const COLOR_PALETTE = [
  '#4fc3f7', '#ef5350', '#ff9800', '#66bb6a', '#ce93d8',
  '#ab47bc', '#ffa726', '#26c6da', '#ffd54f', '#8d6e63',
];

const THEME_OPTIONS: { pref: ThemePref; labelKey: string }[] = [
  { pref: 'auto',      labelKey: 'themeAuto' },
  { pref: 'light',     labelKey: 'themeLight' },
  { pref: 'dark',      labelKey: 'themeDark' },
  { pref: 'revivetab', labelKey: 'themeClassic' },
];

function _themeBlockHTML(): string {
  const current = getThemePref();
  const buttons = THEME_OPTIONS.map(({ pref, labelKey }) => {
    const active = pref === current ? ' btn-active' : '';
    return `<button type="button" class="bd-theme-opt btn btn-sm join-item flex-1${active}"
            data-theme-pref="${pref}">${esc(t(labelKey))}</button>`;
  }).join('');
  return `
    <div class="bd-theme-block mb-4">
      <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">${esc(t('theme'))}</label>
      <div class="join w-full">${buttons}</div>
    </div>
  `;
}

type RenderFn = () => void;
let _renderAll: RenderFn | null = null;
export function registerRenderer(fn: RenderFn): void { _renderAll = fn; }

function esc(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

export function openSectionsModal(): void {
  if (document.querySelector('.bd-sections-modal')) return;

  const html = `
    <div class="bd-sections-modal flex flex-col h-full">
      <div class="flex items-center justify-between px-6 py-4 border-b border-base-content/10">
        <h3 class="text-lg font-semibold">${esc(t('manageSections'))}</h3>
        <button class="btn btn-ghost btn-sm btn-square" id="bd-close-modal" aria-label="${esc(t('close'))}">
          ${iconSVG('x', 16)}
        </button>
      </div>
      <div class="tabs tabs-bordered px-6 pt-2" role="tablist">
        <a class="tab tab-active bd-modal-tab" data-tab="sections" role="tab">${esc(t('tabSections'))}</a>
        <a class="tab bd-modal-tab" data-tab="ai" role="tab">${esc(t('tabAi'))}</a>
      </div>
      <div class="bd-tab-panel flex flex-col" data-panel="sections">
        <div class="px-6 py-4 overflow-auto flex-1 max-h-[60vh]">
          ${_themeBlockHTML()}
          <button class="btn btn-outline btn-block btn-sm mb-3 bd-add-section">
            ${iconSVG('plus', 16)} ${esc(t('newSection'))}
          </button>
          <ul class="bd-section-list space-y-1.5"></ul>
        </div>
        <div class="px-6 py-3 border-t border-base-content/10 flex flex-wrap gap-2 justify-end">
          <button class="btn btn-sm btn-ghost" id="bd-reseed">
            ${iconSVG('shuffle', 14)} ${esc(t('reseedAuto'))}
          </button>
          <button class="btn btn-sm btn-ghost" id="bd-export">
            ${iconSVG('layers', 14)} ${esc(t('exportBackup'))}
          </button>
        </div>
      </div>
      <div class="bd-tab-panel flex flex-col hidden" data-panel="ai"></div>
    </div>
  `;

  const overlay = showModal(html, { wide: true });
  const root = overlay.querySelector('.bd-sections-modal')!.parentElement!; // modal-box
  root.classList.add('bd-sections-modal');

  overlay.querySelector('#bd-close-modal')!.addEventListener('click', closeModal);
  overlay.querySelector('.bd-add-section')!.addEventListener('click', _showCreateForm);
  overlay.querySelector('#bd-reseed')!.addEventListener('click', _handleReSeed);
  overlay.querySelector('#bd-export')!.addEventListener('click', _handleExport);

  overlay.querySelectorAll<HTMLElement>('.bd-modal-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      overlay.querySelectorAll<HTMLElement>('.bd-modal-tab').forEach((t) => t.classList.toggle('tab-active', t === tab));
      overlay.querySelectorAll<HTMLElement>('.bd-tab-panel').forEach((p) => {
        p.classList.toggle('hidden', p.getAttribute('data-panel') !== target);
      });
    });
  });

  overlay.querySelectorAll<HTMLElement>('.bd-theme-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      setThemePref(normalizeThemePref(btn.getAttribute('data-theme-pref')));
      overlay.querySelectorAll<HTMLElement>('.bd-theme-opt').forEach((b) => {
        b.classList.toggle('btn-active', b === btn);
      });
    });
  });

  _renderSectionList();
  renderAiTab(overlay.querySelector<HTMLElement>('.bd-tab-panel[data-panel="ai"]')!);
}

function _renderSectionList(): void {
  const list = document.querySelector<HTMLElement>('.bd-section-list');
  if (!list) return;
  const sorted = STATE.sections.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  list.innerHTML = sorted.map((s) => {
    const isBuiltin = !!s.builtin;
    const deleteOrPin = isBuiltin
      ? `<span class="bd-row-pin tooltip" data-tip="${esc(t('builtinSection'))}">
           <span class="text-warning/80">${iconSVG('star', 16)}</span>
         </span>`
      : `<button class="bd-delete-section btn btn-ghost btn-xs btn-square" aria-label="${esc(t('delete'))}">
           ${iconSVG('trash-2', 16)}
         </button>`;
    return `
      <li class="bd-section-row flex items-center gap-2.5 px-3 py-2 rounded-lg bg-base-content/5 hover:bg-base-content/10 transition cursor-grab"
          data-section-id="${esc(s.id)}" draggable="true">
        <span class="bd-drag-handle opacity-40 select-none" title="${esc(t('dragToReorder'))}">
          ${iconSVG('grip-vertical', 14)}
        </span>
        <span class="inline-flex" style="color:${esc(s.color)}">
          ${iconSVG(s.icon || 'bookmark', 18)}
        </span>
        <span class="flex-1 text-sm">${esc(s.label)}</span>
        <span class="inline-flex gap-1">
          <button class="bd-edit-section btn btn-ghost btn-xs btn-square" aria-label="${esc(t('edit'))}">
            ${iconSVG('pencil', 16)}
          </button>
          ${deleteOrPin}
        </span>
      </li>
    `;
  }).join('');

  list.querySelectorAll<HTMLElement>('.bd-edit-section').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.bd-section-row')!;
      _showEditForm(row.getAttribute('data-section-id')!);
    });
  });
  list.querySelectorAll<HTMLElement>('.bd-delete-section').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.bd-section-row')!;
      _handleDelete(row.getAttribute('data-section-id')!);
    });
  });
  _wireReorder();
}

// ---------- Form (create + edit) ----------

interface SectionFormValues {
  label: string;
  icon: string;
  color: string;
}

function _formHTML(values: SectionFormValues, submitLabel: string): string {
  const iconGrid = iconNames().map((n) => {
    const sel = (n === values.icon)
      ? 'bg-primary/20 border-primary/60 text-primary-content'
      : 'border-transparent text-base-content/70 hover:bg-base-content/10';
    return `<button type="button" class="bd-icon-pick btn btn-ghost btn-xs btn-square border ${sel}"
            data-icon="${esc(n)}" title="${esc(n)}">${iconSVG(n, 18)}</button>`;
  }).join('');

  const colorPalette = COLOR_PALETTE.map((c) => {
    const sel = (c === values.color) ? 'border-base-content scale-110' : 'border-base-content/10';
    return `<button type="button" class="bd-color-pick w-6 h-6 rounded-full border-2 ${sel} transition"
            data-color="${esc(c)}" style="background:${esc(c)}" title="${esc(c)}"></button>`;
  }).join('');

  return `
    <div class="bd-section-form bg-base-content/5 border border-primary/30 rounded-lg p-4 mb-3">
      <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">${esc(t('formName'))}</label>
      <input type="text" class="bd-form-input input input-bordered input-sm w-full"
             name="label" value="${esc(values.label || '')}" maxlength="40"/>

      <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5 mt-3">${esc(t('formIcon'))}</label>
      <div class="bd-icon-grid grid grid-cols-8 gap-1 p-1 rounded bg-base-content/10 max-h-44 overflow-y-auto">
        ${iconGrid}
      </div>

      <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5 mt-3">${esc(t('formColor'))}</label>
      <div class="bd-color-row flex items-center gap-1.5 flex-wrap">
        ${colorPalette}
        <input type="color" class="bd-color-custom w-8 h-8 p-0 rounded-full border border-base-content/15 bg-transparent cursor-pointer"
               value="${esc(values.color)}"/>
      </div>

      <div class="flex gap-2 justify-end mt-4">
        <button class="bd-form-cancel btn btn-ghost btn-sm" type="button">${esc(t('cancel'))}</button>
        <button class="bd-form-submit btn btn-primary btn-sm" type="button">${esc(submitLabel)}</button>
      </div>
    </div>
  `;
}

function _wireForm(form: HTMLElement, submitFn: (values: SectionFormValues) => Promise<void> | void): void {
  const labelInput = form.querySelector<HTMLInputElement>('input[name="label"]')!;
  const colorCustom = form.querySelector<HTMLInputElement>('.bd-color-custom')!;
  const iconSelected = form.querySelector<HTMLElement>('.bd-icon-pick.bg-primary\\/20');
  const colorSelected = form.querySelector<HTMLElement>('.bd-color-pick.border-base-content');
  const current: SectionFormValues = {
    label: labelInput.value,
    icon: iconSelected ? iconSelected.getAttribute('data-icon')! : 'bookmark',
    color: colorSelected
      ? colorSelected.getAttribute('data-color')!
      : colorCustom.value,
  };
  form.querySelectorAll<HTMLElement>('.bd-icon-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll<HTMLElement>('.bd-icon-pick').forEach((b) => {
        b.classList.remove('bg-primary/20', 'border-primary/60', 'text-primary-content');
        b.classList.add('border-transparent', 'text-base-content/70', 'hover:bg-base-content/10');
      });
      btn.classList.add('bg-primary/20', 'border-primary/60', 'text-primary-content');
      btn.classList.remove('border-transparent', 'text-base-content/70', 'hover:bg-base-content/10');
      current.icon = btn.getAttribute('data-icon')!;
    });
  });
  form.querySelectorAll<HTMLElement>('.bd-color-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.querySelectorAll<HTMLElement>('.bd-color-pick').forEach((b) => {
        b.classList.remove('border-base-content', 'scale-110');
        b.classList.add('border-base-content/10');
      });
      btn.classList.add('border-base-content', 'scale-110');
      btn.classList.remove('border-base-content/10');
      current.color = btn.getAttribute('data-color')!;
      colorCustom.value = current.color;
    });
  });
  colorCustom.addEventListener('input', (e) => {
    current.color = (e.target as HTMLInputElement).value;
    form.querySelectorAll<HTMLElement>('.bd-color-pick').forEach((b) => {
      b.classList.remove('border-base-content', 'scale-110');
      b.classList.add('border-base-content/10');
    });
  });
  labelInput.addEventListener('input', (e) => {
    current.label = (e.target as HTMLInputElement).value;
  });
  form.querySelector<HTMLElement>('.bd-form-cancel')!.addEventListener('click', () => form.remove());
  form.querySelector<HTMLElement>('.bd-form-submit')!.addEventListener('click', async () => {
    if (!current.label.trim()) return;
    await submitFn(current);
    form.remove();
    _renderSectionList();
    if (_renderAll) _renderAll();
  });
}

// ---------- Create ----------

function _showCreateForm(): void {
  const list = document.querySelector<HTMLElement>('.bd-section-list');
  const container = list ? list.parentElement : null;
  if (!list || !container) return;
  const existing = container.querySelector('.bd-section-form');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = _formHTML({ label: '', icon: 'bookmark', color: COLOR_PALETTE[0] }, t('create'));
  const form = wrapper.firstElementChild as HTMLElement;
  container.insertBefore(form, list);

  _wireForm(form, (values) => _createSection(values));
  form.querySelector<HTMLInputElement>('input[name="label"]')!.focus();
}

async function _createSection(values: SectionFormValues): Promise<void> {
  const ids = STATE.sections.map((s) => s.id);
  const newId = uniqueSectionId(slugify(values.label), ids);
  const nonBuiltinOrders = STATE.sections.filter((s) => !s.builtin).map((s) => s.order || 0);
  const maxOrder = nonBuiltinOrders.length ? Math.max.apply(null, nonBuiltinOrders) : -1;
  STATE.sections.push({
    id: newId,
    label: values.label.trim(),
    icon: values.icon,
    color: values.color,
    order: maxOrder + 1,
  });
  STATE.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
  await saveSections(STATE.sections);
}

// ---------- Edit ----------

function _showEditForm(sectionId: string): void {
  const sec = STATE.sections.find((s) => s.id === sectionId);
  if (!sec) return;
  const row = document.querySelector('.bd-section-row[data-section-id="' + sectionId + '"]');
  if (!row) return;
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains('bd-section-form')) { existing.remove(); return; }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = _formHTML({ label: sec.label, icon: sec.icon, color: sec.color }, t('save'));
  const form = wrapper.firstElementChild as HTMLElement;
  row.parentNode!.insertBefore(form, row.nextSibling);

  _wireForm(form, async (values) => {
    sec.label = values.label.trim();
    sec.icon = values.icon;
    sec.color = values.color;
    await saveSections(STATE.sections);
  });
  const inp = form.querySelector<HTMLInputElement>('input[name="label"]')!;
  inp.focus(); inp.select();
}

// ---------- Delete ----------

async function _handleDelete(sectionId: string): Promise<void> {
  const sec = STATE.sections.find((s) => s.id === sectionId);
  if (!sec || sec.builtin) return;

  let count = 0;
  for (const bmId in STATE.membership) {
    if (STATE.membership[bmId] === sectionId) count++;
  }

  const msg = count > 0
    ? t('deleteSectionConfirmWithCount', [sec.label, String(count)])
    : t('deleteSectionConfirm', [sec.label]);

  if (!confirm(msg)) return;

  for (const bmId in STATE.membership) {
    if (STATE.membership[bmId] === sectionId) STATE.membership[bmId] = 'inbox';
  }
  STATE.sections = STATE.sections.filter((s) => s.id !== sectionId);

  await saveMembership(STATE.membership);
  await saveSections(STATE.sections);

  _renderSectionList();
  if (_renderAll) _renderAll();
}

// ---------- Reorder ----------

let _reorderState: string | null = null;

function _wireReorder(): void {
  const rows = document.querySelectorAll<HTMLElement>('.bd-section-row');
  rows.forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      _reorderState = row.getAttribute('data-section-id');
      row.classList.add('opacity-40');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', _reorderState || '');
      }
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('opacity-40');
      _reorderState = null;
    });
    row.addEventListener('dragover', (e) => {
      if (_reorderState && _reorderState !== row.getAttribute('data-section-id')) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        row.classList.add('outline', 'outline-2', 'outline-primary/60', 'bg-primary/10');
      }
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('outline', 'outline-2', 'outline-primary/60', 'bg-primary/10');
    });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('outline', 'outline-2', 'outline-primary/60', 'bg-primary/10');
      const draggedId = _reorderState || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
      const targetId = row.getAttribute('data-section-id');
      if (!draggedId || draggedId === targetId) return;
      await _reorderSection(draggedId, targetId!);
    });
  });
}

async function _reorderSection(draggedId: string, targetId: string): Promise<void> {
  const nonBuiltin: Section[] = STATE.sections.filter((s) => !s.builtin);
  const builtin: Section[] = STATE.sections.filter((s) => s.builtin);
  nonBuiltin.sort((a, b) => (a.order || 0) - (b.order || 0));

  const draggedIdx = nonBuiltin.findIndex((s) => s.id === draggedId);
  let targetIdx = nonBuiltin.findIndex((s) => s.id === targetId);
  if (draggedIdx === -1) return;
  if (targetIdx === -1) targetIdx = nonBuiltin.length;

  const moved = nonBuiltin.splice(draggedIdx, 1)[0];
  if (targetIdx > draggedIdx) targetIdx--;
  nonBuiltin.splice(targetIdx, 0, moved);

  for (let i = 0; i < nonBuiltin.length; i++) nonBuiltin[i].order = i;
  builtin.forEach((s) => { if (s.id === 'inbox') s.order = 999; });

  STATE.sections = nonBuiltin.concat(builtin);
  await saveSections(STATE.sections);
  _renderSectionList();
  if (_renderAll) _renderAll();
}

// ---------- Re-seed ----------

async function _handleReSeed(): Promise<void> {
  if (!confirm(t('reseedConfirm'))) return;

  const membership = await reSeedAll(STATE.all, saveMembership);
  STATE.membership = membership;
  _renderSectionList();
  if (_renderAll) _renderAll();
  alert(t('reseedDone'));
}

// ---------- Export ----------

async function _handleExport(): Promise<void> {
  try {
    const data = await exportBackup();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = 'revivetab-ai-backup-' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert(t('exportError', [err instanceof Error ? err.message : String(err)]));
  }
}
