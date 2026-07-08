// modal-ai.js — aba "IA" do modal: configuração de provider/key/modelo e
// organização automática de bookmarks com prévia, aplicar e desfazer.

import { STATE, dbg } from './state.js';
import { iconSVG } from './icons.js';
import {
  loadAiConfig, saveAiConfig, saveMembership,
  loadMembershipUndo, saveMembershipUndo, clearMembershipUndo,
} from './storage.js';
import { PROVIDERS, fetchModels, classifyBatch } from './ai-client.js';
import { selectScope, organize, computePreview } from './ai-organize.js';

let _renderAll = null;
export function registerRenderer(fn) { _renderAll = fn; }

let _config = null;
let _controller = null;
let _running = false;

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

export async function renderAiTab(container) {
  _config = await loadAiConfig();
  const undo = await loadMembershipUndo();

  const providerOptions = Object.keys(PROVIDERS).map((id) =>
    `<option value="${esc(id)}" ${id === _config.provider ? 'selected' : ''}>${esc(PROVIDERS[id].label)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="bd-ai-tab px-6 py-4 overflow-auto flex-1 max-h-[60vh]">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">Provider</label>
          <select id="bd-ai-provider" class="select select-bordered select-sm w-full">${providerOptions}</select>
        </div>
        <div>
          <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">Modelo</label>
          <input id="bd-ai-model" list="bd-ai-model-list" autocomplete="off" spellcheck="false"
                 class="input input-bordered input-sm w-full" placeholder="ex: deepseek-v4-flash"
                 value="${esc(_config.model)}"/>
          <datalist id="bd-ai-model-list"></datalist>
        </div>
      </div>

      <div class="mt-3">
        <label class="block text-xs uppercase tracking-wider opacity-60 mb-1.5">API key do provider</label>
        <div class="flex gap-1.5">
          <input id="bd-ai-key" type="password" autocomplete="off" spellcheck="false"
                 class="input input-bordered input-sm flex-1"
                 value="${esc(_config.apiKeys[_config.provider] || '')}"/>
          <button id="bd-ai-key-toggle" class="btn btn-sm btn-ghost" type="button">Mostrar</button>
          <button id="bd-ai-test" class="btn btn-sm btn-outline" type="button">Testar conexão</button>
        </div>
        <div id="bd-ai-status" class="text-xs mt-1.5 min-h-4 opacity-80"></div>
      </div>

      <div class="divider my-3"></div>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex gap-4">
          <label class="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name="bd-ai-scope" value="inbox" class="radio radio-xs" checked/>
            Só não categorizados
          </label>
          <label class="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name="bd-ai-scope" value="all" class="radio radio-xs"/>
            Todos os bookmarks
          </label>
        </div>
        <div class="flex gap-2">
          <button id="bd-ai-undo" class="btn btn-sm btn-ghost ${undo ? '' : 'hidden'}" type="button">
            Desfazer última organização
          </button>
          <button id="bd-ai-run" class="btn btn-sm btn-primary" type="button">
            ${iconSVG('bot', 14)} Organizar com IA
          </button>
        </div>
      </div>

      <div id="bd-ai-progress" class="hidden mt-4">
        <div class="flex items-center justify-between text-xs opacity-80 mb-1.5">
          <span id="bd-ai-progress-label">Preparando...</span>
          <button id="bd-ai-cancel" class="btn btn-xs btn-ghost" type="button">Cancelar</button>
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

async function _persistConfig() {
  await saveAiConfig(_config);
}

function _wireConfig(container) {
  const providerEl = container.querySelector('#bd-ai-provider');
  const keyEl = container.querySelector('#bd-ai-key');
  const modelEl = container.querySelector('#bd-ai-model');
  const statusEl = container.querySelector('#bd-ai-status');

  providerEl.addEventListener('change', async () => {
    _config.provider = providerEl.value;
    keyEl.value = _config.apiKeys[_config.provider] || '';
    statusEl.textContent = '';
    container.querySelector('#bd-ai-model-list').innerHTML = '';
    await _persistConfig();
    _loadModels(container, true);
  });

  keyEl.addEventListener('change', async () => {
    _config.apiKeys[_config.provider] = keyEl.value.trim();
    await _persistConfig();
  });

  modelEl.addEventListener('change', async () => {
    _config.model = modelEl.value.trim();
    await _persistConfig();
  });

  container.querySelector('#bd-ai-key-toggle').addEventListener('click', (e) => {
    const show = keyEl.type === 'password';
    keyEl.type = show ? 'text' : 'password';
    e.target.textContent = show ? 'Ocultar' : 'Mostrar';
  });

  container.querySelector('#bd-ai-test').addEventListener('click', async () => {
    statusEl.textContent = 'Testando...';
    try {
      const models = await fetchModels(_config.provider, _config.apiKeys[_config.provider] || '');
      statusEl.textContent = 'Conexão ok — ' + models.length + ' modelos disponíveis.';
      _fillModelList(container, models);
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

function _fillModelList(container, models) {
  const datalist = container.querySelector('#bd-ai-model-list');
  if (!datalist) return;
  datalist.innerHTML = models.map((m) => `<option value="${esc(m)}"></option>`).join('');
}

async function _loadModels(container, silent) {
  const key = _config.apiKeys[_config.provider] || '';
  // DeepSeek exige key para listar; OpenRouter tem endpoint público.
  if (_config.provider === 'deepseek' && !key) return;
  try {
    const models = await fetchModels(_config.provider, key);
    _fillModelList(container, models);
  } catch (err) {
    if (!silent) container.querySelector('#bd-ai-status').textContent = err.message;
  }
}

// ---------- Execução ----------

function _wireRun(container) {
  container.querySelector('#bd-ai-run').addEventListener('click', () => _run(container));
  container.querySelector('#bd-ai-cancel').addEventListener('click', () => {
    if (_controller) _controller.abort();
  });
  container.querySelector('#bd-ai-undo').addEventListener('click', () => _handleUndo(container));
}

async function _run(container) {
  if (_running) return;
  const statusEl = container.querySelector('#bd-ai-status');
  const key = _config.apiKeys[_config.provider] || '';
  if (!key) { statusEl.textContent = 'Configure a API key antes de organizar.'; return; }
  if (!_config.model) { statusEl.textContent = 'Escolha um modelo antes de organizar.'; return; }

  const scope = container.querySelector('input[name="bd-ai-scope"]:checked').value;
  const targets = selectScope(STATE.all, STATE.membership, scope);
  if (!targets.length) {
    statusEl.textContent = 'Nenhum bookmark no escopo selecionado.';
    return;
  }

  const runBtn = container.querySelector('#bd-ai-run');
  const progressWrap = container.querySelector('#bd-ai-progress');
  const progressLabel = container.querySelector('#bd-ai-progress-label');
  const progressBar = container.querySelector('#bd-ai-progress-bar');
  const previewEl = container.querySelector('#bd-ai-preview');

  _running = true;
  _controller = new AbortController();
  runBtn.disabled = true;
  statusEl.textContent = '';
  previewEl.classList.add('hidden');
  progressWrap.classList.remove('hidden');
  progressLabel.textContent = 'Classificando ' + targets.length + ' bookmarks...';
  progressBar.value = 0;

  dbg('ai-organize start: scope=' + scope + ' targets=' + targets.length);
  try {
    const result = await organize({
      bookmarks: targets,
      sections: STATE.sections,
      config: _config,
      classifyFn: classifyBatch,
      signal: _controller.signal,
      onProgress: (p) => {
        // Modal fechado no meio da execução: aborta o restante.
        if (!progressLabel.isConnected) { _controller.abort(); return; }
        progressLabel.textContent = 'Lote ' + p.batchesDone + ' de ' + p.batchesTotal
          + ' — ' + p.classified + ' classificados'
          + (p.failed ? ' (' + p.failed + ' com falha)' : '');
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

function _renderPreview(container, result) {
  const previewEl = container.querySelector('#bd-ai-preview');
  const preview = computePreview(STATE.membership, result.assignments, STATE.sections);

  const notes = [];
  if (result.cancelled) notes.push('Execução cancelada — prévia parcial do que já foi classificado.');
  if (result.failedCount) notes.push(result.failedCount + ' bookmarks ficaram de fora (lotes com falha).');

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

  const body = preview.changes === 0
    ? '<p class="text-sm opacity-70">Nenhuma mudança sugerida — tudo já está na seção indicada pelo modelo.</p>'
    : `
      <p class="text-sm opacity-80 mb-2">${preview.total} bookmarks classificados, <strong>${preview.changes} mudanças</strong>:</p>
      <ul class="mb-3">${rows}</ul>
    `;

  previewEl.innerHTML = `
    <div class="bg-base-content/5 border border-primary/30 rounded-lg p-4">
      <h4 class="text-sm font-semibold mb-2">Prévia da organização</h4>
      ${notes.map((n) => `<p class="text-xs text-warning mb-1.5">${esc(n)}</p>`).join('')}
      ${body}
      <div class="flex gap-2 justify-end">
        <button id="bd-ai-discard" class="btn btn-sm btn-ghost" type="button">Descartar</button>
        ${preview.changes > 0 ? '<button id="bd-ai-apply" class="btn btn-sm btn-primary" type="button">Aplicar</button>' : ''}
      </div>
    </div>
  `;
  previewEl.classList.remove('hidden');

  previewEl.querySelector('#bd-ai-discard').addEventListener('click', () => {
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
  });
  const applyBtn = previewEl.querySelector('#bd-ai-apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => _applyAssignments(container, result.assignments));
  }
}

async function _applyAssignments(container, assignments) {
  await saveMembershipUndo({ ...STATE.membership });
  for (const bmId of Object.keys(assignments)) {
    STATE.membership[bmId] = assignments[bmId];
  }
  await saveMembership(STATE.membership);

  const previewEl = container.querySelector('#bd-ai-preview');
  previewEl.classList.add('hidden');
  previewEl.innerHTML = '';
  container.querySelector('#bd-ai-undo').classList.remove('hidden');
  container.querySelector('#bd-ai-status').textContent = 'Organização aplicada.';
  dbg('ai-organize applied');
  if (_renderAll) _renderAll();
}

async function _handleUndo(container) {
  const snap = await loadMembershipUndo();
  if (!snap || !snap.membership) return;
  STATE.membership = snap.membership;
  await saveMembership(STATE.membership);
  await clearMembershipUndo();
  container.querySelector('#bd-ai-undo').classList.add('hidden');
  container.querySelector('#bd-ai-status').textContent = 'Organização desfeita.';
  dbg('ai-organize undone');
  if (_renderAll) _renderAll();
}
