# Plano: Classificação automática de bookmarks por IA (DeepSeek e OpenRouter)

- **Data:** 08-07-2026
- **Branch:** `main`
- **Status:** Executado

## Contexto

Implementa a spec desta pasta: configuração de provider/key/modelo na aba IA do modal, cliente LLM
OpenAI-compatible único, organização em lotes sequenciais com prévia + aplicar + desfazer.

Princípio de testabilidade seguido nas Etapas 2 e 3: toda a lógica (payload, parse, chunking,
orquestração, diff) em funções puras ou com dependências injetadas (`classifyFn`), para cobrir em
Vitest sem mock de `fetch`. A validação com a API real usa um script Node fora do repositório
(scratchpad), lendo a chave de desenvolvimento de arquivo local — a chave nunca entra no repo.

## Etapa 1 — Storage: chaves `bd:ai` e `bd:membership-undo`

**Arquivos:**
- `src/storage.js`

**Ações:**
- Adicionar a `BD_KEYS`: `ai: 'bd:ai'`, `membershipUndo: 'bd:membership-undo'`.
- `loadAiConfig()` retornando default `{ provider: 'deepseek', apiKeys: { deepseek: '', openrouter: '' }, model: '' }`
  mesclado com o salvo; `saveAiConfig(config)`.
- `loadMembershipUndo()` / `saveMembershipUndo(snapshot)` (snapshot: `{ savedAt, membership }`) /
  `clearMembershipUndo()`.

**Verificação:**
- `npm test` e `npm run build` verdes (sem regressão).

## Etapa 2 — Cliente LLM (`src/ai-client.js`)

**Arquivos:**
- `src/ai-client.js` (criar)
- `test/ai.test.js` (criar — primeira parte)

**Ações:**
- `PROVIDERS`: deepseek (`https://api.deepseek.com`, chat `/chat/completions`, models `/models`) e
  openrouter (`https://openrouter.ai/api/v1`, chat `/chat/completions`, models `/models`; headers
  extras `HTTP-Referer`/`X-Title` identificando a extensão).
- `buildClassifyPayload(bookmarks, sections, model)` (pura): system prompt pt-BR (classificar nas
  seções id+label fornecidas, responder só o JSON `{"assignments": {id: sectionId}}`, `inbox` na
  incerteza), user content com JSON compacto de `{id, title, url, folders}`, `temperature: 0`,
  `response_format: {type: 'json_object'}`.
- `parseAssignments(content, validSectionIds, validBookmarkIds)` (pura): JSON.parse defensivo;
  seção inválida -> `inbox`; id de bookmark desconhecido -> ignorado; sem `assignments` -> erro.
- `fetchModels(provider, apiKey)` e `classifyBatch(config, bookmarks, sections)` com `fetch`;
  erros normalizados (401/403 -> key inválida; 429 -> rate limit; rede -> mensagem amigável).
  `classifyBatch` aceita `AbortSignal` para cancelamento.
- Testes: shape do payload (mensagens, response_format, temperature), casos de `parseAssignments`
  (feliz, seção inválida, id desconhecido, JSON malformado, sem campo assignments).

**Verificação:**
- `npm test` verde.
- Script Node no scratchpad (fora do repo) importando `src/ai-client.js`, lendo a chave dev de
  arquivo local: `fetchModels('deepseek', key)` lista modelos e `classifyBatch` com 3 bookmarks
  fake retorna assignments válidos contra as seções default.

## Etapa 3 — Orquestração e prévia (`src/ai-organize.js`)

**Arquivos:**
- `src/ai-organize.js` (criar)
- `test/ai.test.js` (ampliar)

**Ações:**
- `chunk(items, size = 80)` (pura).
- `selectScope(all, membership, scope)` (pura): `'inbox'` -> só bookmarks com membership `inbox` ou
  ausente; `'all'` -> todos.
- `organize({ bookmarks, sections, config, classifyFn, onProgress, signal })`: loop sequencial nos
  chunks; por chunk, 1 retry em erro; falha dupla registra o chunk como falho e segue; respeita
  `signal` (cancelamento preserva o já classificado); retorna
  `{ assignments, failedCount, cancelled }`. `classifyFn` injetada (produção usa `classifyBatch`).
- `computePreview(currentMembership, assignments, sections)` (pura): total classificado, total de
  mudanças efetivas, por seção `{ gains, losses }`; ignora assignments iguais ao atual.
- Testes: chunk, selectScope, computePreview e organize com `classifyFn` fake (sucesso, retry após
  falha, falha dupla, cancelamento no meio).

**Verificação:**
- `npm test` verde.

## Etapa 4 — UI: abas no modal e aba IA (`src/modal-ai.js`)

**Arquivos:**
- `src/modal-sections.js`
- `src/modal-ai.js` (criar)

**Ações:**
- `modal-sections.js`: estrutura de abas daisyUI (`tabs tabs-bordered`) — "Seções" (conteúdo atual
  intacto) e "IA" (delegado a `renderAiTab()` de `modal-ai.js`). Estado da aba ativa local ao modal.
- `modal-ai.js`:
  - Form de config ligado a `bd:ai` (select provider, input key type password com alternar
    visibilidade, seletor de modelo — DeepSeek: select populado por `fetchModels`; OpenRouter:
    input com `datalist` populado do endpoint público; botão "Testar conexão" com resultado
    inline).
  - Bloco de execução: radio de escopo (Inbox default | Todos), botão "Organizar com IA",
    progresso (lote x/y + bookmarks processados), botão Cancelar (AbortController).
  - Prévia: resumo (total, mudanças, por seção com ganhos/perdas) + "Aplicar" / "Descartar".
    Aplicar: `saveMembershipUndo` do membership atual, grava novo membership em `STATE` +
    `saveMembership`, re-render via renderer registrado, fecha a prévia.
  - "Desfazer última organização" visível quando `bd:membership-undo` existe; restaura e limpa.
  - Nenhuma key em logs; mensagens de erro amigáveis vindas do cliente.

**Verificação:**
- `npm run build` sem erros.
- Manual (extensão): abas alternam; aba Seções sem regressão (CRUD, reorder, re-seed, export).

## Etapa 5 — Manifest, versão e documentação

**Arquivos:**
- `manifest.json`
- `package.json`
- `CLAUDE.md`

**Ações:**
- `host_permissions`: adicionar `https://api.deepseek.com/*` e `https://openrouter.ai/*`.
- Versão `3.2.0` -> `3.3.0` nos dois arquivos.
- `CLAUDE.md`: módulos novos na tabela, chaves `bd:ai`/`bd:membership-undo` no schema, seção curta
  do fluxo de organização por IA (lotes, prévia, undo, onde ficam as permissões).

**Verificação:**
- `npm run build`; `node -e` confirmando permissões e versão no `dist/manifest.json`.
- `grep -r "sk-" src/ test/ specs/` vazio.

## Etapa 6 — Validação de ponta a ponta

**Ações:**
- Rodar Verificação Final (abaixo).
- Checklist manual com o usuário (extensão carregada, chave dev na aba IA): testar conexão, organizar
  Inbox com prévia/aplicar/desfazer, organizar Todos (~1460 bookmarks) com cancelamento no meio, key
  inválida -> erro amigável.

**Verificação:**
- Critérios de Sucesso da spec todos marcados.

## Verificação Final

1. `npm test` — suíte completa verde (sections, tree, yt, ai).
2. `npm run build` — `dist/` sem erros; manifest 3.3.0 com host_permissions dos dois providers.
3. `grep -r "sk-" src/ test/ specs/` — nenhuma chave no repositório.
4. Manual: fluxo completo da aba IA (config, testar conexão, organizar Inbox/Todos, prévia, aplicar,
   desfazer, cancelar) e aba Seções sem regressão.
