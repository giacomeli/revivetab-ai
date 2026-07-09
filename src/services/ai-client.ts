// services/ai-client.ts — cliente OpenAI-compatible para DeepSeek e OpenRouter.
// Payload e parse são funções puras (testáveis em Vitest); apenas
// fetchModels/classifyBatch tocam a rede.

import type { AiConfig, AiProviderId, Assignments, ClassifiableBookmark, Section } from '../types';
import { t } from './i18n';

interface ProviderDef {
  label: string;
  baseUrl: string;
  chatPath: string;
  modelsPath: string;
  extraHeaders: Record<string, string>;
}

export const PROVIDERS: Record<AiProviderId, ProviderDef> = {
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
    extraHeaders: { 'HTTP-Referer': 'https://github.com/julianjedi/revivetab-ai', 'X-Title': 'ReviveTab AI' },
  },
};

interface ChatCompletionPayload {
  model: string;
  temperature: number;
  response_format: { type: 'json_object' };
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}

// Monta o payload de classificação (função pura).
export function buildClassifyPayload(
  bookmarks: ClassifiableBookmark[],
  sections: Array<Pick<Section, 'id' | 'label'>>,
  model: string
): ChatCompletionPayload {
  // Prompt em inglês (língua única para qualquer modelo/provider); os labels
  // das seções chegam no idioma do usuário e são dados, não instrução.
  const sectionLines = sections.map((s) => '- ' + s.id + ': ' + s.label).join('\n');
  const system = [
    'You organize browser bookmarks into thematic sections.',
    'You will receive a JSON array of bookmarks (id, title, url, folders) and must assign each one to exactly ONE section.',
    'Valid sections (id: description):',
    sectionLines,
    'Rules:',
    '- Use only the section ids listed above.',
    '- Consider the title, the URL domain, and the source folders.',
    '- When unsure, use "inbox".',
    '- Respond ONLY with a valid JSON object in the format {"assignments": {"<bookmarkId>": "<sectionId>"}}, with no additional text.',
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
export function parseAssignments(
  content: string,
  validSectionIds: string[],
  validBookmarkIds: string[]
): Assignments {
  // Modelos sem JSON mode às vezes devolvem o JSON entre cercas de código.
  const cleaned = String(content || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(t('aiErrorResponseNotJSON'));
  }
  const raw = (data as { assignments?: unknown } | null)?.assignments;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(t('aiErrorMissingAssignments'));
  }
  const sectionSet = new Set(validSectionIds);
  const bookmarkSet = new Set(validBookmarkIds);
  const out: Assignments = {};
  for (const [bmId, sid] of Object.entries(raw as Record<string, unknown>)) {
    if (!bookmarkSet.has(bmId)) continue;
    out[bmId] = (typeof sid === 'string' && sectionSet.has(sid)) ? sid : 'inbox';
  }
  return out;
}

function _apiError(status: number, providerLabel: string): Error {
  if (status === 401 || status === 403) {
    return new Error(t('aiErrorInvalidKey', [providerLabel]));
  }
  if (status === 402) {
    return new Error(t('aiErrorNoCredits', [providerLabel]));
  }
  if (status === 429) {
    return new Error(t('aiErrorRateLimit', [providerLabel]));
  }
  return new Error(t('aiErrorHttp', [String(status), providerLabel]));
}

async function _request(
  provider: AiProviderId,
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<unknown> {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(t('aiErrorUnknownProvider', [provider]));
  let res: Response;
  try {
    res = await fetch(p.baseUrl + path, {
      ...options,
      headers: {
        // O endpoint de modelos do OpenRouter é público — só manda auth com key.
        ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {}),
        'Content-Type': 'application/json',
        ...p.extraHeaders,
        ...((options.headers as Record<string, string>) || {}),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new Error(t('aiErrorNetwork', [p.label]));
  }
  if (!res.ok) throw _apiError(res.status, p.label);
  return res.json();
}

// Lista ids de modelos do provider. Também serve de "testar conexão".
export async function fetchModels(provider: AiProviderId, apiKey: string): Promise<string[]> {
  const data = await _request(provider, PROVIDERS[provider].modelsPath, apiKey) as { data?: Array<{ id: string }> };
  return (data.data || []).map((m) => m.id);
}

// Classifica um lote de bookmarks. Retorna { [bookmarkId]: sectionId } validado.
export async function classifyBatch(
  config: AiConfig,
  bookmarks: ClassifiableBookmark[],
  sections: Section[],
  signal?: AbortSignal
): Promise<Assignments> {
  const payload = buildClassifyPayload(bookmarks, sections, config.model);
  const data = await _request(
    config.provider,
    PROVIDERS[config.provider].chatPath,
    config.apiKeys[config.provider],
    { method: 'POST', body: JSON.stringify(payload), signal }
  ) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(t('aiErrorEmptyResponse'));
  return parseAssignments(content, sections.map((s) => s.id), bookmarks.map((b) => b.id));
}
