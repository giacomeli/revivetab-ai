// ai-client.js — cliente OpenAI-compatible para DeepSeek e OpenRouter.
// Payload e parse são funções puras (testáveis em Vitest); apenas
// fetchModels/classifyBatch tocam a rede.

export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    extraHeaders: {},
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    // Headers opcionais de atribuição de app do OpenRouter.
    extraHeaders: { 'HTTP-Referer': 'https://bookmark-dial.extension', 'X-Title': 'Bookmark Dial' },
  },
};

// Monta o payload de classificação (função pura).
export function buildClassifyPayload(bookmarks, sections, model) {
  const sectionLines = sections.map((s) => '- ' + s.id + ': ' + s.label).join('\n');
  const system = [
    'Voce organiza bookmarks de navegador em secoes tematicas.',
    'Recebera um array JSON de bookmarks (id, title, url, folders) e deve atribuir cada um a exatamente UMA secao.',
    'Secoes validas (id: descricao):',
    sectionLines,
    'Regras:',
    '- Use somente os ids de secao listados acima.',
    '- Considere o titulo, o dominio da URL e as pastas de origem (folders).',
    '- Em caso de incerteza, use "inbox".',
    '- Responda APENAS um objeto JSON valido no formato {"assignments": {"<bookmarkId>": "<sectionId>"}}, sem texto adicional.',
  ].join('\n');
  const items = bookmarks.map((b) => ({
    id: b.id,
    title: b.title,
    url: b.url,
    folders: b.folderList || [],
  }));
  return {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(items) },
    ],
  };
}

// Valida a resposta do modelo (função pura): seção desconhecida vira inbox,
// id de bookmark desconhecido é ignorado.
export function parseAssignments(content, validSectionIds, validBookmarkIds) {
  // Modelos sem JSON mode às vezes devolvem o JSON entre cercas de código.
  const cleaned = String(content || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Resposta do modelo nao e JSON valido');
  }
  const raw = data && data.assignments;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Resposta do modelo sem o campo "assignments"');
  }
  const sectionSet = new Set(validSectionIds);
  const bookmarkSet = new Set(validBookmarkIds);
  const out = {};
  for (const bmId of Object.keys(raw)) {
    if (!bookmarkSet.has(bmId)) continue;
    const sid = raw[bmId];
    out[bmId] = sectionSet.has(sid) ? sid : 'inbox';
  }
  return out;
}

function _apiError(status, providerLabel) {
  if (status === 401 || status === 403) {
    return new Error('API key invalida ou sem permissao no ' + providerLabel + '. Confira a chave na aba IA.');
  }
  if (status === 402) {
    return new Error('Sem creditos no ' + providerLabel + '.');
  }
  if (status === 429) {
    return new Error('Rate limit do ' + providerLabel + ' atingido. Aguarde um pouco e tente de novo.');
  }
  return new Error('Erro HTTP ' + status + ' na API do ' + providerLabel + '.');
}

async function _request(provider, path, apiKey, options = {}) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('Provider desconhecido: ' + provider);
  let res;
  try {
    res = await fetch(p.baseUrl + path, {
      ...options,
      headers: {
        // O endpoint de modelos do OpenRouter é público — só manda auth com key.
        ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {}),
        'Content-Type': 'application/json',
        ...p.extraHeaders,
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new Error('Falha de rede ao chamar o ' + p.label + '. Verifique a conexao.');
  }
  if (!res.ok) throw _apiError(res.status, p.label);
  return res.json();
}

// Lista ids de modelos do provider. Também serve de "testar conexão".
export async function fetchModels(provider, apiKey) {
  const data = await _request(provider, PROVIDERS[provider].modelsPath, apiKey);
  return (data.data || []).map((m) => m.id);
}

// Classifica um lote de bookmarks. Retorna { [bookmarkId]: sectionId } validado.
export async function classifyBatch(config, bookmarks, sections, signal) {
  const payload = buildClassifyPayload(bookmarks, sections, config.model);
  const data = await _request(
    config.provider,
    PROVIDERS[config.provider].chatPath,
    config.apiKeys[config.provider],
    { method: 'POST', body: JSON.stringify(payload), signal }
  );
  const content = data && data.choices && data.choices[0]
    && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Resposta vazia do modelo');
  return parseAssignments(content, sections.map((s) => s.id), bookmarks.map((b) => b.id));
}
