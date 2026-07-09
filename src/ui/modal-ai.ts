// ui/modal-ai.ts — aba "IA" do modal: configuração de provider/key/modelo e
// organização automática de bookmarks com prévia, aplicar e desfazer.

import { STATE, dbg } from '../state';
import { iconSVG } from '../assets/icons';
import {
  loadAiConfig, saveAiConfig, saveMembership,
  loadMembershipUndo, saveMembershipUndo, clearMembershipUndo,
} from '../data/storage';
import { PROVIDERS, fetchModels, classifyBatch } from '../services/ai-client';
import { selectScope, organize, computePreview } from '../services/ai-organize';
import { t } from '../services/i18n';
import type { OrganizeScope } from '../services/ai-organize';
import type { AiConfig, AiProviderId, Assignments, OrganizeResult } from '../types';

type RenderFn = () => void;
let _renderAll: RenderFn | null = null;
export function registerRenderer(fn: RenderFn): void { _renderAll = fn; }

let _config: AiConfig | null = null;
let _controller: AbortController | null = null;
let _running = false;

function esc(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

export async function renderAiTab(container: HTMLElement): Promise<void> {
  _config = await loadAiConfig();
  const config = _config;
  const undo = await loadMembershipUndo();

  const providerOptions = (Object.keys(PROVIDERS) as AiProviderId[]).map((id) =>
    `<option value="${esc(id)}" ${id === config.provider ? 'selected' : ''}>${esc(PROVIDERS[id].label)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="bd-ai-tab px-6 py-4 overflow-auto flex-1 max-h-[60vh]">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">${esc(t('aiProvider'))}</label>
          <select id="bd-ai-provider" class="select select-bordered select-sm w-full">${providerOptions}</select>
        </div>
        <div>
          <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">${esc(t('aiModel'))}</label>
          <input id="bd-ai-model" list="bd-ai-model-list" autocomplete="off" spellcheck="false"
                 class="input input-bordered input-sm w-full" placeholder="${esc(t('aiModelPlaceholder'))}"
                 value="${esc(config.model)}"/>
          <datalist id="bd-ai-model-list"></datalist>
        </div>
      </div>

      <div class="mt-3">
        <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">${esc(t('aiApiKeyLabel'))}</label>
        <div class="flex gap-1.5">
          <input id="bd-ai-key" type="password" autocomplete="off" spellcheck="false"
                 class="input input-bordered input-sm flex-1"
                 value="${esc(config.apiKeys[config.provider] || '')}"/>
          <button id="bd-ai-key-toggle" class="btn btn-sm btn-ghost" type="button">${esc(t('show'))}</button>
          <button id="bd-ai-test" class="btn btn-sm btn-outline" type="button">${esc(t('aiTestConnection'))}</button>
        </div>
        <div id="bd-ai-status" class="text-xs mt-1.5 min-h-4 opacity-80"></div>
      </div>

      <div class="divider my-3"></div>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex gap-4">
          <label class="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name="bd-ai-scope" value="inbox" class="radio radio-xs" checked/>
            ${esc(t('aiScopeInbox'))}
          </label>
          <label class="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name="bd-ai-scope" value="all" class="radio radio-xs"/>
            ${esc(t('aiScopeAll'))}
          </label>
        </div>
        <div class="flex gap-2">
          <button id="bd-ai-undo" class="btn btn-sm btn-ghost ${undo ? '' : 'hidden'}" type="button">
            ${esc(t('aiUndoLast'))}
          </button>
          <button id="bd-ai-run" class="btn btn-sm btn-primary" type="button">
            ${iconSVG('bot', 14)} ${esc(t('aiOrganize'))}
          </button>
        </div>
      </div>

      <div id="bd-ai-progress" class="hidden mt-4">
        <div class="flex items-center justify-between text-xs opacity-80 mb-1.5">
          <span id="bd-ai-progress-label">${esc(t('aiPreparing'))}</span>
          <button id="bd-ai-cancel" class="btn btn-xs btn-ghost" type="button">${esc(t('cancel'))}</button>
        </div>
        <progress id="bd-ai-progress-bar" class="progress progress-primary w-full" value="0" max="100"></progress>
      </div>

      <div id="bd-ai-preview" class="hidden mt-4"></div>
    </div>
  `;

  _wireConfig(container);
  _wireRun(container);
  // Carrega a lista de modelos em silêncio (OpenRouter dispensa key).
  _loadModels(container, true);
}

// ---------- Config ----------

async function _persistConfig(): Promise<void> {
  if (_config) await saveAiConfig(_config);
}

function _wireConfig(container: HTMLElement): void {
  const providerEl = container.querySelector<HTMLSelectElement>('#bd-ai-provider')!;
  const keyEl = container.querySelector<HTMLInputElement>('#bd-ai-key')!;
  const modelEl = container.querySelector<HTMLInputElement>('#bd-ai-model')!;
  const statusEl = container.querySelector<HTMLElement>('#bd-ai-status')!;

  providerEl.addEventListener('change', async () => {
    if (!_config) return;
    _config.provider = providerEl.value as AiProviderId;
    keyEl.value = _config.apiKeys[_config.provider] || '';
    statusEl.textContent = '';
    container.querySelector('#bd-ai-model-list')!.innerHTML = '';
    await _persistConfig();
    _loadModels(container, true);
  });

  keyEl.addEventListener('change', async () => {
    if (!_config) return;
    _config.apiKeys[_config.provider] = keyEl.value.trim();
    await _persistConfig();
  });

  modelEl.addEventListener('change', async () => {
    if (!_config) return;
    _config.model = modelEl.value.trim();
    await _persistConfig();
  });

  container.querySelector<HTMLButtonElement>('#bd-ai-key-toggle')!.addEventListener('click', (e) => {
    const show = keyEl.type === 'password';
    keyEl.type = show ? 'text' : 'password';
    (e.target as HTMLButtonElement).textContent = show ? t('hide') : t('show');
  });

  container.querySelector<HTMLButtonElement>('#bd-ai-test')!.addEventListener('click', async () => {
    if (!_config) return;
    statusEl.textContent = t('aiTesting');
    try {
      const models = await fetchModels(_config.provider, _config.apiKeys[_config.provider] || '');
      statusEl.textContent = t('aiConnectionOk', [String(models.length)]);
      _fillModelList(container, models);
    } catch (err) {
      statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  });
}

function _fillModelList(container: HTMLElement, models: string[]): void {
  const datalist = container.querySelector('#bd-ai-model-list');
  if (!datalist) return;
  datalist.innerHTML = models.map((m) => `<option value="${esc(m)}"></option>`).join('');
}

async function _loadModels(container: HTMLElement, silent: boolean): Promise<void> {
  if (!_config) return;
  const key = _config.apiKeys[_config.provider] || '';
  // DeepSeek exige key para listar; OpenRouter tem endpoint público.
  if (_config.provider === 'deepseek' && !key) return;
  try {
    const models = await fetchModels(_config.provider, key);
    _fillModelList(container, models);
  } catch (err) {
    if (!silent) {
      const statusEl = container.querySelector<HTMLElement>('#bd-ai-status');
      if (statusEl) statusEl.textContent = err instanceof Error ? err.message : String(err);
    }
  }
}

// ---------- Execução ----------

function _wireRun(container: HTMLElement): void {
  container.querySelector<HTMLButtonElement>('#bd-ai-run')!.addEventListener('click', () => _run(container));
  container.querySelector<HTMLButtonElement>('#bd-ai-cancel')!.addEventListener('click', () => {
    if (_controller) _controller.abort();
  });
  container.querySelector<HTMLButtonElement>('#bd-ai-undo')!.addEventListener('click', () => _handleUndo(container));
}

async function _run(container: HTMLElement): Promise<void> {
  if (_running || !_config) return;
  const config = _config;
  const statusEl = container.querySelector<HTMLElement>('#bd-ai-status')!;
  const key = config.apiKeys[config.provider] || '';
  if (!key) { statusEl.textContent = t('aiConfigureKeyFirst'); return; }
  if (!config.model) { statusEl.textContent = t('aiChooseModelFirst'); return; }

  const scope = container.querySelector<HTMLInputElement>('input[name="bd-ai-scope"]:checked')!.value as OrganizeScope;
  const targets = selectScope(STATE.all, STATE.membership, scope);
  if (!targets.length) {
    statusEl.textContent = t('aiNoBookmarksInScope');
    return;
  }

  const runBtn = container.querySelector<HTMLButtonElement>('#bd-ai-run')!;
  const progressWrap = container.querySelector<HTMLElement>('#bd-ai-progress')!;
  const progressLabel = container.querySelector<HTMLElement>('#bd-ai-progress-label')!;
  const progressBar = container.querySelector<HTMLProgressElement>('#bd-ai-progress-bar')!;
  const previewEl = container.querySelector<HTMLElement>('#bd-ai-preview')!;

  _running = true;
  _controller = new AbortController();
  runBtn.disabled = true;
  statusEl.textContent = '';
  previewEl.classList.add('hidden');
  progressWrap.classList.remove('hidden');
  progressLabel.textContent = t('aiClassifying', [String(targets.length)]);
  progressBar.value = 0;

  dbg('ai-organize start: scope=' + scope + ' targets=' + targets.length);
  try {
    const result = await organize({
      bookmarks: targets,
      sections: STATE.sections,
      config,
      classifyFn: classifyBatch,
      signal: _controller.signal,
      onProgress: (p) => {
        // Modal fechado no meio da execução: aborta o restante.
        if (!progressLabel.isConnected) { _controller?.abort(); return; }
        progressLabel.textContent = t('aiBatchProgress', [String(p.batchesDone), String(p.batchesTotal), String(p.classified)])
          + (p.failed ? ' ' + t('aiBatchFailedSuffix', [String(p.failed)]) : '');
        progressBar.value = Math.round((p.batchesDone / p.batchesTotal) * 100);
      },
    });
    dbg('ai-organize done: classified=' + Object.keys(result.assignments).length
      + ' failed=' + result.failedCount + ' cancelled=' + result.cancelled);
    if (previewEl.isConnected) _renderPreview(container, result);
  } finally {
    _running = false;
    _controller = null;
    if (runBtn.isConnected) {
      runBtn.disabled = false;
      progressWrap.classList.add('hidden');
    }
  }
}

// ---------- Prévia ----------

function _renderPreview(container: HTMLElement, result: OrganizeResult): void {
  const previewEl = container.querySelector<HTMLElement>('#bd-ai-preview')!;
  const preview = computePreview(STATE.membership, result.assignments, STATE.sections);

  const notes: string[] = [];
  if (result.cancelled) notes.push(t('aiPreviewCancelled'));
  if (result.failedCount) notes.push(t('aiPreviewFailed', [String(result.failedCount)]));

  const sorted = STATE.sections.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const rows = sorted
    .map((s) => ({ s, d: preview.bySection[s.id] }))
    .filter((x) => x.d && (x.d.gains > 0 || x.d.losses > 0))
    .map(({ s, d }) => `
      <li class="flex items-center gap-2 text-sm py-1 border-b border-base-content/5 last:border-0">
        <span class="w-1.5 h-1.5 rounded-full" style="background:${esc(s.color || '#888')}"></span>
        <span class="flex-1">${esc(s.label)}</span>
        ${d.gains ? `<span class="text-success text-xs">+${d.gains}</span>` : ''}
        ${d.losses ? `<span class="text-error text-xs">-${d.losses}</span>` : ''}
      </li>
    `).join('');

  // O placeholder $CHANGES$ recebe o número já envolto em <strong>; a
  // mensagem nos catálogos permanece texto puro.
  const body = preview.changes === 0
    ? `<p class="text-sm opacity-70">${esc(t('aiPreviewNoChanges'))}</p>`
    : `
      <p class="text-sm opacity-80 mb-2">${t('aiPreviewSummary', [String(preview.total), '<strong>' + preview.changes + '</strong>'])}</p>
      <ul class="mb-3">${rows}</ul>
    `;

  previewEl.innerHTML = `
    <div class="bg-base-content/5 border border-primary/30 rounded-lg p-4">
      <h4 class="text-sm font-semibold mb-2">${esc(t('aiPreviewTitle'))}</h4>
      ${notes.map((n) => `<p class="text-xs text-warning mb-1.5">${esc(n)}</p>`).join('')}
      ${body}
      <div class="flex gap-2 justify-end">
        <button id="bd-ai-discard" class="btn btn-sm btn-ghost" type="button">${esc(t('discard'))}</button>
        ${preview.changes > 0 ? `<button id="bd-ai-apply" class="btn btn-sm btn-primary" type="button">${esc(t('apply'))}</button>` : ''}
      </div>
    </div>
  `;
  previewEl.classList.remove('hidden');

  previewEl.querySelector<HTMLButtonElement>('#bd-ai-discard')!.addEventListener('click', () => {
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
  });
  const applyBtn = previewEl.querySelector<HTMLButtonElement>('#bd-ai-apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => _applyAssignments(container, result.assignments));
  }
}

async function _applyAssignments(container: HTMLElement, assignments: Assignments): Promise<void> {
  await saveMembershipUndo({ ...STATE.membership });
  for (const bmId of Object.keys(assignments)) {
    STATE.membership[bmId] = assignments[bmId];
  }
  await saveMembership(STATE.membership);

  const previewEl = container.querySelector<HTMLElement>('#bd-ai-preview')!;
  previewEl.classList.add('hidden');
  previewEl.innerHTML = '';
  container.querySelector<HTMLElement>('#bd-ai-undo')!.classList.remove('hidden');
  container.querySelector<HTMLElement>('#bd-ai-status')!.textContent = t('aiApplied');
  dbg('ai-organize applied');
  if (_renderAll) _renderAll();
}

async function _handleUndo(container: HTMLElement): Promise<void> {
  const snap = await loadMembershipUndo();
  if (!snap || !snap.membership) return;
  STATE.membership = snap.membership;
  await saveMembership(STATE.membership);
  await clearMembershipUndo();
  container.querySelector<HTMLElement>('#bd-ai-undo')!.classList.add('hidden');
  container.querySelector<HTMLElement>('#bd-ai-status')!.textContent = t('aiUndone');
  dbg('ai-organize undone');
  if (_renderAll) _renderAll();
}
