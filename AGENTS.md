# AGENTS.md

Este arquivo orienta agentes de código (Claude Code, Codex, Cursor, etc.) ao trabalhar neste
repositório.

## Visão geral

**ReviveTab AI** (título de loja: "ReviveTab AI: Bookmarks & Speed Dial") — extensão para browsers Chromium (Manifest V3) que substitui a new tab page por um speed dial de bookmarks com seções customizáveis, busca, drag-and-drop, carousels infinitos, player de YouTube em modal e organização por IA. Pitch: favoritos esquecidos ("cemitério de links") voltam à vida a cada nova guia. Stack: **TypeScript estrito + Vite + @crxjs/vite-plugin + TailwindCSS + daisyUI**, testes em **Vitest**. Sem framework de UI (DOM direto via template strings). O código é genérico — nada nele pode acoplar a estrutura de pastas ou dados de um usuário específico.

## Comandos

```bash
npm run dev              # Vite dev server com HMR (escreve em dist/)
npm run build            # build de produção -> dist/
npm run typecheck        # tsc --noEmit (strict) — rodar junto com os testes
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

### Arquitetura em camadas (src/)

Dependência unidirecional: `ui/` pode importar de `services/`, `data/`, `assets/`, `state.ts` e
`types.ts`; `services/` só de `data/` e `types.ts`; `data/` só de `types.ts`. **Nunca** importar
`ui/` a partir de camadas inferiores — quando uma camada de baixo precisa disparar re-render, a UI
registra `renderAll` via `registerRenderer()` (padrão existente).

| Camada | Módulo | Responsabilidade |
| --- | --- | --- |
| raiz | `main.ts` | Entry point: importa styles, chama `applyTheme` + `watchSystemTheme`, `setupBraveFooterHiding`, `wireEvents`, `init` |
| raiz | `types.ts` | Tipos de domínio (`Bookmark`, `Section`, `Membership`, `AiConfig`, `TreeNode`...) |
| raiz | `state.ts` | `STATE` mutável compartilhado + `dbg()` + instrumentação (`timed`, `timedAsync`, `tstamp`) |
| assets | `assets/icons.ts` | SVGs Lucide embutidos + `iconSVG(name, size)` |
| assets | `assets/styles.css` | Tailwind + CSS custom mínimo (gradient, DnD, responsivo) |
| data | `data/storage.ts` | Wrapper de `chrome.storage.local` (`BD_KEYS`, load/save, export backup) |
| data | `data/bookmarks.ts` | Adaptador de `chrome.bookmarks`: `getTree`, `updateTitle`, `removeBookmark`, listeners — única porta para essa API |
| services | `services/sections.ts` | `DEFAULT_SECTIONS`, `SEED_RULES` genérico, `SEED_VERSION`, funções puras de categorização |
| services | `services/tree.ts` | Módulo puro: `walk` e `collectBookmarks` (árvore do browser -> lista flat) |
| services | `services/theme.ts` | Resolução e persistência do tema (`bd:theme` no localStorage): `resolveTheme` puro, `applyTheme`, `watchSystemTheme` |
| services | `services/yt.ts` | Módulo puro: `ytId(url)` — detecção de vídeo do YouTube |
| services | `services/ai-client.ts` | Cliente OpenAI-compatible (DeepSeek/OpenRouter): payload/parse puros + fetch |
| services | `services/ai-organize.ts` | Orquestração da classificação por IA: chunking, retry, cancelamento, diff |
| ui | `ui/dial.ts` | O maior módulo: `renderAll`, carousel infinito, busca, lazy-load, `init` |
| ui | `ui/dnd.ts` | Drag-and-drop de cards entre seções (HTML5 DnD) |
| ui | `ui/modal.ts` | `showModal`/`closeModal` genéricos (daisyUI modal; `options.boxClass` customiza o box) |
| ui | `ui/modal-sections.ts` | Modal "Gerenciar seções": abas Seções/IA, CRUD, reorder, re-seed, export |
| ui | `ui/modal-ai.ts` | Aba "IA": config (provider/key/modelo), execução, prévia, desfazer |
| ui | `ui/video-modal.ts` | Player de YouTube embutido (`openVideoModal` + regra DNR de Referer) |
| ui | `ui/bookmark-ops.ts` | Modais de editar título / excluir bookmark (escrita via `data/bookmarks`) |

### Leitura da árvore (services/tree.ts)

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

`STATE` (em `state.ts`, tipado como `AppState`) é o único container mutável compartilhado: `{ sections, membership, meta, all }`. Não existe `window.STATE`.

Módulos que precisam disparar re-render (`ui/dnd.ts`, `ui/modal-sections.ts`, `ui/modal-ai.ts`, `ui/bookmark-ops.ts`) recebem `renderAll` via `registerRenderer()` chamado em `init()` — evita import circular com `ui/dial.ts`.

### Render e performance

`renderAll()` reconstrói `#app` inteiro via `innerHTML` (sem virtual DOM). Pontos de performance deliberados — manter ao mexer no render:

- **`MAX_PER_SECTION = 50`** (`ui/dial.ts`): seções acima disso mostram 50 cards aleatórios (shuffle + slice) com badge `total/50`; o restante continua acessível pela busca. Principal knob de perf.
- **Larguras fixas de card**: `CARD_WIDTH_PX`/`CARD_GAP_PX` em `ui/dial.ts` precisam bater com as classes `w-[170px] min-w-[170px]` no template de `cardHTML` e com o override responsivo em `assets/styles.css`. A matemática do carousel depende disso para não ler `offsetWidth` por card.
- **Thumbs lazy**: `IntersectionObserver` sobre `.bd-lazy-thumb[data-src]`, com fallback favicon -> inicial da letra.
- **Carousel infinito**: clones (`.bd-carousel-clone`) pré/pós via DocumentFragment + scroll-jump nas bordas. Clones têm `draggable="false"` e perdem os botões de ação.
- **Instrumentação**: logs com prefixos `[BD]`, `[BD-PERF]`, `[BD-RENDER]`, `[BD-DND]` — filtrar por prefixo no console ao debugar. `timed()`/`timedAsync()` marcam `SLOW` acima de 50ms.

### Drag-and-drop (ui/dnd.ts)

Estado visual controlado por classes: `body.bd-dragging` (gate global), `.bd-card-dragging`, `.bd-drop-target`. O CSS em `styles.css` só renderiza indicadores enquanto `body.bd-dragging` existe, com hard reset em `body:not(.bd-dragging)` — proteção contra classes vazadas. `cleanupDragState()` é chamado defensivamente em dragend/drop/mouseup/pointerup/blur/Escape e no início de todo `renderAll()`. Ao mexer em DnD, preservar essas camadas de cleanup.

### Player de YouTube (ui/video-modal.ts)

Clique em card cujo URL tem vídeo identificável por `ytId()` abre `openVideoModal()` — iframe `youtube.com/embed` com autoplay em modal — em vez de navegar. Escape/backdrop fecham (a remoção do iframe para a reprodução); o link "Abrir no YouTube" é a saída para vídeos com embed desabilitado. Cards não-YouTube navegam direto.

O YouTube exige o header `Referer` no player embutido (Error 153 sem ele) e o Chrome não envia `Referer` de páginas `chrome-extension://` — `referrerpolicy` no iframe não resolve. Por isso `ui/video-modal.ts` registra uma regra DNR de sessão (antes do primeiro embed) que injeta o header apenas em `sub_frame` iniciados pela extensão; o manifest precisa de `declarativeNetRequestWithHostAccess` + `host_permissions` dos domínios do YouTube. O **valor** do Referer deve ser `chrome.runtime.id` — outros valores (ex.: `https://www.youtube.com/`) produzem Error 152 "video unavailable". Não remover essas permissões nem mudar o valor sem retestar o player.

### Organização por IA (services/ai-client.ts, services/ai-organize.ts, ui/modal-ai.ts)

Aba "IA" no modal Gerenciar seções. DeepSeek e OpenRouter são OpenAI-compatible — um único cliente com base URL/headers por provider (`PROVIDERS` em `services/ai-client.ts`); `host_permissions` no manifest cobrem os dois domínios. A classificação roda em lotes sequenciais de 80 (`BATCH_SIZE`), com retry 1x por lote, cancelamento via `AbortController` e escopo Inbox/todos. O resultado **sempre** passa por prévia (diff via `computePreview`) antes de gravar `bd:membership`; aplicar salva snapshot em `bd:membership-undo` (botão Desfazer). A IA usa apenas seções existentes — resposta com seção desconhecida cai no Inbox (`parseAssignments`). Payload/parse/chunk/diff são funções puras testadas em `test/ai.test.ts`; a orquestração recebe `classifyFn` injetada, então nada disso exige mock de `fetch`.

### Listeners do Chrome bookmarks (ui/dial.ts via data/bookmarks.ts)

- `onRemoved` -> remove de membership + re-render
- `onCreated` -> adiciona ao Inbox + re-render
- `onChanged` -> atualiza título/URL in-place (sem re-render completo)
- `onMoved` -> ignorado (membership é independente de pastas)

### Princípio de segurança

`chrome.bookmarks` é **read-only por padrão** e todo acesso passa pelo adaptador `data/bookmarks.ts`. As únicas escritas são `updateTitle` (botão lápis) e `removeBookmark` (botão X), consumidas por `ui/bookmark-ops.ts`. Mover cards entre seções nunca altera a estrutura de pastas do browser. Backup automático em `bd:initial-backup`; backup manual via "Exportar backup" no modal de seções.

### Internacionalização (chrome.i18n)

UI em três idiomas via `chrome.i18n` nativo: catálogos em `_locales/{en,es,pt_BR}/messages.json`
(`default_locale: "en"`; o idioma segue o browser do usuário). Regras:

- **Toda string nova de UI nasce como chave nos TRÊS catálogos** — paridade de chaves é obrigatória
  (verificar com o script node que compara `Object.keys` dos três arquivos).
- Código consome via `t(key, subs?)` de `services/i18n.ts` (fallback: sem `chrome.i18n`, retorna a
  própria chave — é assim que os testes rodam sem mock). Estáticos do `index.html` usam atributos
  `data-i18n-*` aplicados por `main.ts` no boot.
- `name`/`short_name`/`description` do manifest usam `__MSG_*__`; cada `appDesc` tem no máximo 132
  chars. O @crxjs copia `_locales/` para o `dist/` automaticamente.
- Labels das seções default são resolvidos **no momento do seed** (`defaultSections()`): instalação
  nova ganha o idioma do browser; instalações existentes mantêm os labels salvos.
- Prompt da IA é inglês fixo (língua para o modelo, não UI); logs `[BD-*]` não são localizados.
- Mensagens nos catálogos são texto puro — markup (ex.: `<strong>`) entra por placeholder já
  escapado, nunca dentro do `messages.json`.

### Styling

- Três temas daisyUI: `light` e `dark` stock + `revivetab` (clássico, custom em
  `tailwind.config.js` — o objeto de cores não muda sem redesign da marca). O tema efetivo é
  resolvido por `services/theme.ts` (preferência `auto`/`light`/`dark`/`revivetab` na chave
  `bd:theme` do **localStorage** — não `chrome.storage`; default `auto` segue
  `prefers-color-scheme`) e aplicado em `data-theme` no `<html>`. `public/theme-init.js`
  (script clássico no `<head>`; CSP do MV3 bloqueia inline) aplica o tema antes do primeiro
  paint e duplica a resolução mínima — mudou um, mudou o outro. O gradiente da marca é escopado
  a `[data-theme='revivetab']` em `styles.css`; nos demais temas o fundo é `bg-base-200`.
  Seletor de tema: bloco "Tema" no modal Gerenciar seções.
- Novas classes de cor em templates usam tokens semânticos do daisyUI (`base-*`, `primary`...).
  Preto/branco fixos são exceções deliberadas: badge do YouTube, backdrop de modal, letterbox
  do player.
- CSS custom em `src/assets/styles.css` cobre só: gradient de fundo, visuais de DnD e breakpoint responsivo do carousel. O resto é utility class no template.
- O `content` do `tailwind.config.js` precisa incluir `./src/**/*.{js,ts,html}` — sem o `ts` no glob, o Tailwind purga as classes usadas nos templates e o CSS encolhe de ~70 kB para ~18 kB (sintoma de UI quebrada).
- **Classes prefixadas `bd-` e `dial-` são seletores estruturais usados pelo JS** (DnD, busca, lazy-load, rename inline). Não remover/renomear sem buscar referências em JS. Exemplos: `.dial-wrap`, `.dial-title`, `.bd-group`, `.bd-group-head`, `.bd-group-label`, `.bd-carousel`, `.bd-carousel-track`, `.bd-carousel-clone`, `.bd-lazy-thumb`, `.bd-modal-overlay`. Classes Tailwind/daisyUI são puramente estilo e podem ser editadas livremente.

### Testes

`npm test` roda os cinco arquivos de `test/*.test.ts` (sections, tree, yt, ai, theme) — todos sobre funções puras de `services/`. UI/DOM é verificada manualmente carregando a extensão (não há ambiente de teste com `chrome.*` mockado). Rodar `npm run typecheck` junto: o Vite transpila TS sem checar tipos, então só o tsc pega erro de tipo.
