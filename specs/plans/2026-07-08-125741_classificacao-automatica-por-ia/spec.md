# Spec: Classificação automática de bookmarks por IA (DeepSeek e OpenRouter)

- **Data:** 08-07-2026
- **Branch:** `main` (mesma decisão do trabalho anterior)
- **Status:** Executado

## Contexto

O seed genérico (spec `2026-07-08-113316`) categoriza pelo óbvio — keywords de pasta e domínios
conhecidos — e o restante cai no Inbox. A classificação semântica por LLM foi registrada naquela spec
como etapa futura; esta spec a implementa.

Decisões do usuário (registradas em 08-07-2026):

- Escopo escolhível na hora da execução: "Só não categorizados (Inbox)" (default) ou "Todos os
  bookmarks".
- A IA usa **apenas as seções existentes** (incluindo as criadas pelo usuário); não propõe nem cria
  seções.
- Configuração na **aba "IA" do modal Gerenciar seções** (o modal ganha abas: Seções | IA).
- Resultado sempre passa por **prévia + aplicar** — nada muda sem confirmação.

Validações já feitas com a chave de desenvolvimento do usuário (mantida fora do repositório):

- `GET https://api.deepseek.com/models` — HTTP 200; modelos disponíveis: `deepseek-v4-flash`,
  `deepseek-v4-pro`.
- `POST https://api.deepseek.com/chat/completions` com `response_format: {type: "json_object"}` e
  `temperature: 0` retorna exatamente o contrato desejado:
  `{"assignments": {"<bookmarkId>": "<sectionId>"}}`.
- `GET https://openrouter.ai/api/v1/models` (público, sem key) — 344 modelos com `id` e
  `context_length`; serve de fonte para o seletor de modelo do OpenRouter.

Ambos providers são OpenAI-compatible (mesmo shape de `chat/completions`), o que permite um único
cliente com base URL e headers por provider.

## Requisitos

1. **Configuração de IA persistida.** Nova chave `bd:ai` em `chrome.storage.local`:
   `{ provider: 'deepseek' | 'openrouter', apiKeys: { deepseek: '', openrouter: '' }, model: '' }`.
   A API key nunca aparece em código, logs ou repositório; no input ela é mascarada (type password
   com alternar visibilidade).
2. **Aba "IA" no modal Gerenciar seções.** O modal passa a ter abas (daisyUI `tabs`): "Seções"
   (conteúdo atual, intacto) e "IA", contendo:
   - Select de provider (DeepSeek | OpenRouter).
   - Input de API key do provider selecionado.
   - Seleção de modelo: para DeepSeek, opções carregadas de `GET /models` (com a key); para
     OpenRouter, input com busca sobre a lista de `GET /api/v1/models` (público).
   - Botão "Testar conexão" (chama o endpoint de modelos do provider e reporta ok/erro).
   - Escopo da organização (radio: "Só não categorizados" default | "Todos os bookmarks") e botão
     "Organizar com IA".
3. **Cliente LLM único** (`src/ai-client.js`). `chat/completions` com `temperature: 0` e
   `response_format: {type: 'json_object'}`; base URL e headers por provider (OpenRouter usa os
   headers opcionais `HTTP-Referer`/`X-Title` para identificação). Prompt de sistema em pt-BR:
   classifica bookmarks nas seções fornecidas (id + label), responde SÓ o JSON
   `{"assignments": {id: sectionId}}`, usa `inbox` na incerteza.
4. **Orquestração em lotes** (`src/ai-organize.js`):
   - Lotes de até 80 bookmarks (campos: id, title, url, folderList) por request, sequenciais.
   - Progresso visível na aba (lote x de y) e botão Cancelar (aborta o que falta; o já classificado
     entra na prévia).
   - Erro em um lote: 1 retry; falhou de novo, o lote é marcado como falho e a execução continua
     (bookmarks do lote ficam como estão).
   - Resposta validada: `sectionId` inexistente vira `inbox`; ids desconhecidos são ignorados.
5. **Prévia + aplicar.** Ao final, resumo com: total classificado, total de mudanças efetivas e
   contagem por seção (entradas/saídas), com botões "Aplicar" e "Descartar". Aplicar salva snapshot
   do membership anterior em `bd:membership-undo`, persiste o novo membership e re-renderiza; botão
   "Desfazer última organização" fica disponível na aba IA enquanto houver snapshot.
6. **Permissões.** `host_permissions` para `https://api.deepseek.com/*` e `https://openrouter.ai/*`
   no `manifest.json` (fetch cross-origin de extension page exige host permission; dispensa CORS).
7. **Testes.** Funções puras testáveis em Vitest: montagem do payload/prompt, parse e validação de
   `assignments` (seção inválida -> inbox, id desconhecido ignorado, JSON malformado -> erro
   tratado), chunking, merge de lotes e cálculo do diff da prévia.

## Restrições

- A IA **não cria, renomeia nem remove seções**; não toca em pastas do browser (`chrome.bookmarks`
  segue read-only fora das duas operações já existentes).
- Membership continua sendo a única fonte de verdade; a organização por IA é só mais um escritor de
  `bd:membership`, como o drag-and-drop.
- Nenhuma mudança em `SEED_RULES`/seed — caminhos independentes.
- Requests sequenciais (sem concorrência) na v1 — evita rate limit e simplifica cancelamento.
- Sem estimativa de custo em tokens na v1 (mostrar contagem de bookmarks/lotes basta).
- A chave de desenvolvimento do usuário não entra em nenhum arquivo do repositório (testes de
  desenvolvimento a leem de fora do repo); será revogada pelo usuário após a validação.
- Não commitar nem fazer push sem pedido explícito.

## Arquivos Envolvidos

| Arquivo | Ação |
| --- | --- |
| `src/ai-client.js` | Criar — payloads, fetch por provider, parse/validação da resposta |
| `src/ai-organize.js` | Criar — chunking, orquestração sequencial, retry, diff da prévia |
| `src/modal-ai.js` | Criar — conteúdo da aba IA (config, execução, progresso, prévia, desfazer) |
| `src/modal-sections.js` | Modificar — estrutura de abas Seções / IA no modal existente |
| `src/storage.js` | Modificar — chaves `bd:ai` e `bd:membership-undo` + load/save |
| `manifest.json` | Modificar — host_permissions dos dois providers; versão 3.3.0 |
| `package.json` | Modificar — versão 3.3.0 |
| `test/ai.test.js` | Criar — casos das funções puras (requisito 7) |
| `CLAUDE.md` | Modificar — módulos novos, chave `bd:ai`, fluxo de organização por IA |

## Critérios de Sucesso

- [x] `npm test` verde incluindo os novos casos de `ai.test.js` — 54 testes.
- [x] `grep -rE "sk-[a-zA-Z0-9]{20,}"` (padrão estrito de chave) não encontra nada no repositório;
      validação ao vivo do `ai-client.js` contra a API real do DeepSeek rodou de script no scratchpad
      (fora do repo): fetchModels ok, classifyBatch classificou corretamente, key inválida gerou erro
      amigável.
- [x] `npm run build` gera `dist/` sem erros, com as host_permissions novas no manifest (3.3.0).
- [ ] Manual: configurar provider DeepSeek + key + modelo na aba IA, "Testar conexão" ok; key
      inválida mostra erro amigável.
- [ ] Manual: "Organizar com IA" no escopo Inbox mostra progresso, prévia coerente e Aplicar move os
      cards; Descartar não muda nada; Desfazer restaura o membership anterior.
- [ ] Manual: escopo "Todos" funciona nos ~1460 bookmarks reais (lotes sequenciais, cancelável).
- [ ] Aba Seções continua funcionando exatamente como antes (CRUD, reorder, re-seed, export).
