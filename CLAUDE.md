# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome/Brave browser extension (Manifest V3) que substitui a new tab page por um speed dial customizável de bookmarks. Sem build system, sem dependências de npm — vanilla JavaScript, HTML e CSS. Testes Node.js puros sem framework para funções puras.

## Development Workflow

- **Carregar a extensão**: `chrome://extensions` (ou `brave://extensions`) → Developer Mode → "Load unpacked" → selecionar este diretório.
- **Testar mudanças**: editar arquivos, clicar Reload na extensão, abrir new tab.
- **Rodar testes unitários**: `node test/sections.test.js` (cobre `slugify`, `uniqueSectionId`, `seedCategorize`, `reconcileMembership`).
- **Versão**: atualizar `version` em `manifest.json`.

## Architecture

Seis módulos JavaScript carregados em ordem específica em `newtab.html`:

- **`icons.js`** — Mapa `LUCIDE_ICONS` (40 ícones Lucide embutidos como SVG strings) + helper `iconSVG(name, size)` + `iconNames()`. Zero dependências de rede.
- **`storage.js`** — Wrapper async sobre `chrome.storage.local`. Chaves: `bd:sections`, `bd:membership`, `bd:meta`, `bd:initial-backup`. Funções: `loadAll`, `saveSections`, `saveMembership`, `saveMeta`, `saveInitialBackup`, `loadInitialBackup`, `exportBackup`.
- **`sections.js`** — Configuração de seções e categorização. Exporta: `DEFAULT_SECTIONS` (8 seções padrão + Inbox builtin), `SEED_RULES` (regras de match por pasta/URL), `slugify`, `uniqueSectionId`, `seedCategorize`, `reconcileMembership`, `ensureSeeded`, `reSeedAll`. Suporta `module.exports` para testes Node.
- **`dnd.js`** — Setup de drag-and-drop entre seções via HTML5 DnD API. Função pública `setupDragAndDrop()` (chamada de `dial.js` após cada render) e `moveBookmark(bmId, destSectionId)`.
- **`modal-sections.js`** — Modal "Gerenciar seções": criar, renomear (label/ícone/cor), excluir, reordenar (drag), recategorizar e exportar backup. Função pública `openSectionsModal()`.
- **`dial.js`** — Entry point. Inicializa storage, lê bookmarks, faz semeadura na primeira instalação, reconcilia membership a cada load, renderiza seções (via `STATE.sections` + `STATE.membership`), registra listeners de `chrome.bookmarks`, e cuida do search, modal de edit/delete de bookmark, lazy-load de thumbs e infinite carousel.

`style.css` — tema dark, layout responsivo, estilos de drag-and-drop, modal, icon picker, color picker.

### Categorização — modelo "tags + override manual"

A categorização **não é determinada pela árvore de pastas a cada load**. Em vez disso:

1. **Primeira instalação**: roda `seedCategorize()` em todos os bookmarks. Match por pasta tem prioridade sobre match por URL (resolve o bug histórico de YouTubes em pasta `Music` caindo em `Watch`). Resultado salvo em `bd:membership`. Backup completo da árvore vai para `bd:initial-backup`.
2. **Loads seguintes**: lê `bd:membership` (fonte de verdade) e renderiza. Reconciliação só adiciona bookmarks novos (no Inbox) e remove os que sumiram do Brave.
3. **Drag-and-drop** atualiza `STATE.membership` e persiste.

Bookmarks do browser **nunca** são modificados pela movimentação de cards entre seções. As únicas operações que tocam `chrome.bookmarks` são as duas explícitas: editar título (botão lápis no card) e excluir bookmark (botão X). Se você vir uma nova chamada para `chrome.bookmarks.create`/`move`/`remove` fora dessas, é bug.

### Storage schema

| Chave | Conteúdo |
| --- | --- |
| `bd:sections` | `[{ id, label, icon, color, order, builtin? }]` ordenado por `order` |
| `bd:membership` | `{ [bookmarkId]: sectionId }` — fonte de verdade da categorização |
| `bd:meta` | `{ version, seeded }` |
| `bd:initial-backup` | `{ savedAt, tree }` — snapshot da árvore antes da primeira semeadura |

### Drag-and-drop

- Cards reais (`.dial-wrap:not(.carousel-clone)`) recebem `draggable="true"`.
- Clones de carrossel recebem `draggable="false"`.
- Drop zones: `.group-head` (sempre visível, mesmo em seção vazia) e `.carousel-viewport`.
- `data-bm-id` no wrap permite recuperar o ID no drop.
- `data-section-id` no `.group` identifica a seção destino.

### Listeners do Chrome bookmarks

Configurados em `setupBookmarkListeners()` em `dial.js`:

- `onRemoved` → remove de membership + re-render.
- `onCreated` → adiciona ao Inbox + re-render.
- `onChanged` → atualiza título in-place sem re-render completo.
- `onMoved` → ignorado (membership é independente da estrutura de pastas).

### Funções puras em dial.js

- **`walk(node, folders)`** — Recursive tree walker. Achata a árvore do Chrome num array `{id, title, url, folders, folderList, added}`.
- **`groupByMembership(bookmarks, membership, sections)`** — Agrupa bookmarks por seção via membership. Bookmark sem entrada cai em Inbox.
- **`cardHTML(b)`** — Renderiza um card. YouTube usa thumbnail API; outros usam favicon grande (128px) via `chrome-extension://<id>/_favicon/`. Lazy-load via `IntersectionObserver`.
- **`sectionHTML(sec, items)`** — Renderiza header (ícone Lucide + label clicável para rename inline) + carousel ou empty-state.
- **`renderSearch(q)`** — Filtra todos os bookmarks por título, URL ou folder name. Limit 20 resultados.
- **`startRenameSection(labelEl)`** — Inline rename via `contenteditable`. Enter salva, Escape cancela.

### Princípio de segurança

`chrome.bookmarks` é **read-only por padrão**. Backup automático em `bd:initial-backup` antes da primeira modificação de qualquer storage. Backup manual exportável a qualquer momento via modal.
