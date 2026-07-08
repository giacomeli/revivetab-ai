# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

Extensão para browsers Chromium (Manifest V3) que substitui a new tab page por um speed dial de bookmarks com seções customizáveis, busca, drag-and-drop, carousels infinitos e player de YouTube em modal. Stack: **Vite + @crxjs/vite-plugin + TailwindCSS + daisyUI**, testes em **Vitest**. JavaScript puro (ES modules), sem framework de UI. O código é genérico — nada nele pode acoplar a estrutura de pastas ou dados de um usuário específico.

## Comandos

```bash
npm run dev              # Vite dev server com HMR (escreve em dist/)
npm run build            # build de produção -> dist/
npm test                 # vitest run (suite completa)
npm run test:watch       # vitest em watch
npx vitest run -t "slugify"   # rodar um teste específico por nome
```

### Carregar a extensão no browser

Sempre carregar a pasta **`dist/`** (output do build), nunca a raiz:

1. `npm run build` (ou `npm run dev` para iterar)
2. `brave://extensions` (ou `chrome://extensions`), Developer Mode ligado
3. "Load unpacked" apontando para `dist/`
4. Para iterar: manter `npm run dev` rodando, clicar Reload na extensão, abrir new tab

### Versão

Manter `version` sincronizada em `manifest.json` e `package.json`.

## Arquitetura

### Módulos (src/)

| Módulo | Responsabilidade |
| --- | --- |
| `main.js` | Entry point: importa styles, chama `setupBraveFooterHiding`, `wireEvents`, `init` |
| `state.js` | `STATE` mutável compartilhado + `dbg()` + instrumentação de performance (`timed`, `timedAsync`, `tstamp`) |
| `storage.js` | Wrapper de `chrome.storage.local` (`BD_KEYS`, load/save, export backup) |
| `sections.js` | `DEFAULT_SECTIONS`, `SEED_RULES` genérico, `SEED_VERSION`, funções puras de categorização (`seedCategorize`, `reconcileMembership`, `ensureSeeded`, `reSeedAll`, `needsReSeed`, `slugify`) |
| `tree.js` | Módulo puro: `walk` e `collectBookmarks` (árvore do browser -> lista flat) |
| `yt.js` | Módulo puro: `ytId(url)` — detecção de vídeo do YouTube |
| `dial.js` | O maior módulo: `renderAll`, carousel infinito, busca, lazy-load de thumbs, listeners do Chrome, `init` |
| `dnd.js` | Drag-and-drop de cards entre seções (HTML5 DnD) |
| `modal.js` | `showModal`/`closeModal` genéricos (daisyUI modal; `options.boxClass` customiza o box) |
| `video-modal.js` | Player de YouTube embutido (`openVideoModal` + regra DNR de Referer) |
| `ai-client.js` | Cliente OpenAI-compatible (DeepSeek/OpenRouter): payload/parse puros + fetch |
| `ai-organize.js` | Orquestração da classificação por IA: chunking, retry, cancelamento, diff da prévia |
| `modal-ai.js` | Aba "IA" do modal: config (provider/key/modelo), execução, prévia, desfazer |
| `modal-sections.js` | Modal "Gerenciar seções": CRUD, reorder, re-seed, export backup |
| `bookmark-ops.js` | Modais de editar título / excluir bookmark |
| `icons.js` | SVGs Lucide embutidos + `iconSVG(name, size)` |

### Leitura da árvore (tree.js)

`collectBookmarks(tree)` itera os filhos do nó raiz — os containers especiais do browser (barra de favoritos, outros favoritos, mobile), detectados **por posição, nunca por título** (títulos são localizados e variam entre browsers Chromium). Os nomes dos containers e o título do próprio bookmark **não entram** no `folderList` (nem no breadcrumb, nem no matching do seed). Favorito direto em um container fica com `folderList` vazio ("solto") e só é elegível às regras de URL.

### Categorização — modelo "tags + override manual"

A categorização **não é derivada da árvore de pastas a cada load**:

1. **Primeira instalação**: `ensureSeeded()` roda `seedCategorize()` em todos os bookmarks (match por pasta tem prioridade sobre match por URL). Resultado salvo em `bd:membership`; backup completo da árvore vai para `bd:initial-backup` antes.
2. **Loads seguintes**: `bd:membership` é a fonte de verdade. `reconcileMembership()` só adiciona bookmarks novos (no Inbox) e remove os que sumiram do browser.
3. **Drag-and-drop** atualiza `STATE.membership` e persiste — nunca mexe nas pastas do browser.

`SEED_RULES` é **genérico por contrato**: só keywords universais de nome de pasta (pt/en) e regexes de domínios amplamente conhecidos — nunca nomes de pastas pessoais. O match de pasta é por **token inteiro** (insensível a caixa e acento, separadores espaço/`-`/`_`/`/`/`.`), nunca substring — `ai` não casa com `Email`. Ao alterar as regras de forma que mude o resultado da semeadura, **incrementar `SEED_VERSION`**: instalações existentes re-semeiam automaticamente no próximo load (`needsReSeed()` em `init()`), sem tocar em `bd:sections` nem `bd:initial-backup`.

### Storage schema (chrome.storage.local)

| Chave | Conteúdo |
| --- | --- |
| `bd:sections` | `[{ id, label, icon, color, order, builtin? }]` ordenado por `order` |
| `bd:membership` | `{ [bookmarkId]: sectionId }` — fonte de verdade da categorização |
| `bd:meta` | `{ version, seeded }` — `version` acompanha `SEED_VERSION` (atual: 2) |
| `bd:initial-backup` | `{ savedAt, tree }` — snapshot antes da primeira semeadura |
| `bd:ai` | `{ provider, apiKeys: { deepseek, openrouter }, model }` — config da IA (key local, nunca em código/logs) |
| `bd:membership-undo` | `{ savedAt, membership }` — snapshot para desfazer a última organização por IA |

### State global e wiring de renderer

`STATE` (em `state.js`) é o único container mutável compartilhado: `{ sections, membership, meta, all }`. Não existe `window.STATE`.

Módulos que precisam disparar re-render (`dnd.js`, `modal-sections.js`, `bookmark-ops.js`) recebem `renderAll` via `registerRenderer()` chamado em `init()` — evita import circular com `dial.js`.

### Render e performance

`renderAll()` reconstrói `#app` inteiro via `innerHTML` (sem virtual DOM). Pontos de performance deliberados — manter ao mexer no render:

- **`MAX_PER_SECTION = 50`** (`dial.js`): seções acima disso mostram 50 cards aleatórios (shuffle + slice) com badge `total/50`; o restante continua acessível pela busca. Principal knob de perf.
- **Larguras fixas de card**: `CARD_WIDTH_PX`/`CARD_GAP_PX` em `dial.js` precisam bater com as classes `w-[170px] min-w-[170px]` no template de `cardHTML` e com o override responsivo em `styles.css`. A matemática do carousel depende disso para não ler `offsetWidth` por card.
- **Thumbs lazy**: `IntersectionObserver` sobre `.bd-lazy-thumb[data-src]`, com fallback favicon -> inicial da letra.
- **Carousel infinito**: clones (`.bd-carousel-clone`) pré/pós via DocumentFragment + scroll-jump nas bordas. Clones têm `draggable="false"` e perdem os botões de ação.
- **Instrumentação**: logs com prefixos `[BD]`, `[BD-PERF]`, `[BD-RENDER]`, `[BD-DND]` — filtrar por prefixo no console ao debugar. `timed()`/`timedAsync()` marcam `SLOW` acima de 50ms.

### Drag-and-drop (dnd.js)

Estado visual controlado por classes: `body.bd-dragging` (gate global), `.bd-card-dragging`, `.bd-drop-target`. O CSS em `styles.css` só renderiza indicadores enquanto `body.bd-dragging` existe, com hard reset em `body:not(.bd-dragging)` — proteção contra classes vazadas. `cleanupDragState()` é chamado defensivamente em dragend/drop/mouseup/pointerup/blur/Escape e no início de todo `renderAll()`. Ao mexer em DnD, preservar essas camadas de cleanup.

### Player de YouTube (video-modal.js)

Clique em card cujo URL tem vídeo identificável por `ytId()` abre `openVideoModal()` — iframe `youtube.com/embed` com autoplay em modal — em vez de navegar. Escape/backdrop fecham (a remoção do iframe para a reprodução); o link "Abrir no YouTube" é a saída para vídeos com embed desabilitado. Cards não-YouTube navegam direto.

O YouTube exige o header `Referer` no player embutido (Error 153 sem ele) e o Chrome não envia `Referer` de páginas `chrome-extension://` — `referrerpolicy` no iframe não resolve. Por isso `video-modal.js` registra uma regra DNR de sessão (antes do primeiro embed) que injeta o header apenas em `sub_frame` iniciados pela extensão; o manifest precisa de `declarativeNetRequestWithHostAccess` + `host_permissions` dos domínios do YouTube. O **valor** do Referer deve ser `chrome.runtime.id` — outros valores (ex.: `https://www.youtube.com/`) produzem Error 152 "video unavailable". Não remover essas permissões nem mudar o valor sem retestar o player.

### Organização por IA (ai-client.js, ai-organize.js, modal-ai.js)

Aba "IA" no modal Gerenciar seções. DeepSeek e OpenRouter são OpenAI-compatible — um único cliente com base URL/headers por provider (`PROVIDERS` em `ai-client.js`); `host_permissions` no manifest cobrem os dois domínios. A classificação roda em lotes sequenciais de 80 (`BATCH_SIZE`), com retry 1x por lote, cancelamento via `AbortController` e escopo Inbox/todos. O resultado **sempre** passa por prévia (diff via `computePreview`) antes de gravar `bd:membership`; aplicar salva snapshot em `bd:membership-undo` (botão Desfazer). A IA usa apenas seções existentes — resposta com seção desconhecida cai no Inbox (`parseAssignments`). Payload/parse/chunk/diff são funções puras testadas em `test/ai.test.js`; a orquestração recebe `classifyFn` injetada, então nada disso exige mock de `fetch`.

### Listeners do Chrome bookmarks (dial.js)

- `onRemoved` -> remove de membership + re-render
- `onCreated` -> adiciona ao Inbox + re-render
- `onChanged` -> atualiza título/URL in-place (sem re-render completo)
- `onMoved` -> ignorado (membership é independente de pastas)

### Princípio de segurança

`chrome.bookmarks` é **read-only por padrão**. As únicas escritas são `chrome.bookmarks.update(id, {title})` (botão lápis) e `chrome.bookmarks.remove(id)` (botão X), ambas em `bookmark-ops.js`. Mover cards entre seções nunca altera a estrutura de pastas do browser. Backup automático em `bd:initial-backup`; backup manual via "Exportar backup" no modal de seções.

### Styling

- Tema daisyUI custom `bookmark-dial` (dark, gradient índigo/roxo) definido em `tailwind.config.js` — cores da UI mudam lá.
- CSS custom em `src/styles.css` cobre só: gradient de fundo, visuais de DnD e breakpoint responsivo do carousel. O resto é utility class no template.
- **Classes prefixadas `bd-` e `dial-` são seletores estruturais usados pelo JS** (DnD, busca, lazy-load, rename inline). Não remover/renomear sem buscar referências em JS. Exemplos: `.dial-wrap`, `.dial-title`, `.bd-group`, `.bd-group-head`, `.bd-group-label`, `.bd-carousel`, `.bd-carousel-track`, `.bd-carousel-clone`, `.bd-lazy-thumb`, `.bd-modal-overlay`. Classes Tailwind/daisyUI são puramente estilo e podem ser editadas livremente.

### Testes

`npm test` roda `test/sections.test.js`: cobre `slugify`, `uniqueSectionId`, `seedCategorize`, `reconcileMembership` — as funções puras de `sections.js`. UI/DOM é verificada manualmente carregando a extensão (não há ambiente de teste com `chrome.*` mockado).
