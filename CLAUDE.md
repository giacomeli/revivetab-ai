# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome/Brave browser extension (Manifest V3) que substitui a new tab page por um speed dial customizável de bookmarks. Stack: **Vite + @crxjs/vite-plugin + TailwindCSS + daisyUI**, com testes em **Vitest**. Código em JavaScript (ES modules).

## Development Workflow

### Comandos principais

```bash
npm install              # instala deps (primeira vez)
npm run dev              # Vite dev server com HMR (na pasta dist/)
npm run build            # build de produção -> dist/
npm test                 # vitest run
npm run test:watch       # vitest em watch
```

### Carregar a extensão no Brave/Chrome

Sempre carregue a pasta **`dist/`** (output do build), não a raiz:

1. `npm run build` (ou `npm run dev` para iterar)
2. `brave://extensions` (ou `chrome://extensions`)
3. Developer Mode ligado
4. "Load unpacked" → selecione a pasta **`dist/`**
5. Para iterar: rodar `npm run dev`, clicar Reload na extensão, abrir new tab.

`npm run dev` mantém um watch que reescreve `dist/` em cada mudança — basta clicar Reload na extensão.

### Versão

Atualizar `version` em `manifest.json` (também sai no build).

## Architecture

### Estrutura de arquivos

```
bookmark-dial/
├── package.json              # deps + scripts
├── vite.config.js            # config Vite + @crxjs
├── tailwind.config.js        # tema daisyUI custom 'bookmark-dial'
├── postcss.config.js         # tailwindcss + autoprefixer
├── manifest.json             # Manifest V3 (chrome_url_overrides aponta para index.html)
├── index.html                # entry HTML (carrega /src/main.js)
├── src/
│   ├── main.js               # entry point: importa styles, chama init/wireEvents
│   ├── state.js              # STATE compartilhado entre módulos + dbg()
│   ├── icons.js              # LUCIDE_ICONS (40 SVGs embutidos) + iconSVG()
│   ├── storage.js            # wrapper chrome.storage.local (BD_KEYS, load/save)
│   ├── sections.js           # DEFAULT_SECTIONS, SEED_RULES, slugify, seedCategorize, reconcileMembership, ensureSeeded, reSeedAll
│   ├── modal.js              # showModal/closeModal helpers (daisyUI modal)
│   ├── bookmark-ops.js       # editBookmark/deleteBookmark modais
│   ├── modal-sections.js     # modal "Gerenciar seções" completo
│   ├── dnd.js                # drag-and-drop entre seções
│   ├── dial.js               # walk, render, carousel, search, init, listeners
│   └── styles.css            # @tailwind + custom mínimo (DnD outlines, gradient bg)
├── test/
│   └── sections.test.js      # Vitest — funções puras
├── icons/
│   └── icon128.png           # ícone da extensão
└── dist/                     # output do build (gitignored)
```

### Categorização — modelo "tags + override manual"

A categorização **não é determinada pela árvore de pastas a cada load**. Em vez disso:

1. **Primeira instalação**: roda `seedCategorize()` em todos os bookmarks. Match por pasta tem prioridade sobre match por URL. Resultado salvo em `bd:membership`. Backup completo da árvore vai para `bd:initial-backup`.
2. **Loads seguintes**: lê `bd:membership` (fonte de verdade) e renderiza. Reconciliação só adiciona bookmarks novos (no Inbox) e remove os que sumiram do Brave.
3. **Drag-and-drop** atualiza `STATE.membership` e persiste.

### Storage schema

| Chave | Conteúdo |
| --- | --- |
| `bd:sections` | `[{ id, label, icon, color, order, builtin? }]` ordenado por `order` |
| `bd:membership` | `{ [bookmarkId]: sectionId }` — fonte de verdade da categorização |
| `bd:meta` | `{ version, seeded }` |
| `bd:initial-backup` | `{ savedAt, tree }` — snapshot antes da primeira semeadura |

### State global (src/state.js)

`STATE` é o único container mutável compartilhado:

```js
{ sections: [], membership: {}, meta: null, all: [] }
```

Todos os módulos importam `STATE` desse arquivo. Não há `window.STATE` nem variáveis globais soltas.

### Renderer wiring

Cada módulo que precisa disparar re-render registra a função `renderAll` via `registerRenderer()`:

- `dnd.js` → `registerRenderer(renderAll)` — para depois de drop
- `modal-sections.js` → idem — para depois de CRUD de seções
- `bookmark-ops.js` → idem — para depois de delete

Evita import circular (eles não importam `dial.js` diretamente).

### Styling

- **TailwindCSS** + **daisyUI** com tema custom `bookmark-dial` (dark, gradient índigo/roxo herdando a paleta original).
- Components principais usam classes daisyUI: `btn`, `btn-primary`, `btn-ghost`, `input`, `input-bordered`, `modal`, `modal-box`, `modal-action`, `modal-backdrop`, `tooltip`.
- CSS custom em `src/styles.css` cobre apenas: gradient de background, drag-and-drop visuals (outline tracejado/sólido nas drop zones), responsive breakpoint do carousel.
- Tema configurado em `tailwind.config.js` em `daisyui.themes` — para mudar cores das seções padrão ou da UI, editar lá.

### Princípio de segurança

`chrome.bookmarks` é **read-only por padrão**. As únicas operações de escrita são:

- `chrome.bookmarks.update(id, {title})` — botão lápis no card.
- `chrome.bookmarks.remove(id)` — botão X no card.

Movimentar cards entre seções no Dial **não altera** a estrutura de pastas do browser — só mexe em `bd:membership`. Backup automático em `bd:initial-backup` antes da primeira modificação. Backup manual via "Exportar backup" no modal.

### Listeners do Chrome bookmarks

Configurados em `setupBookmarkListeners()` em `src/dial.js`:

- `onRemoved` → remove de membership + re-render.
- `onCreated` → adiciona ao Inbox + re-render.
- `onChanged` → atualiza título in-place.
- `onMoved` → ignorado (membership é independente de pastas).

### Testes

`npm test` roda Vitest sobre `test/sections.test.js`. Cobre `slugify`, `uniqueSectionId`, `seedCategorize`, `reconcileMembership` — funções puras de `src/sections.js`. UI/DOM é verificada manualmente carregando a extensão.

### Padrões de classe CSS

Classes prefixadas com `bd-` são **seletores estruturais** usados pelo JS (DnD, search). Não as remova nem renomeie sem buscar referências em JS. Exemplos: `.dial-wrap`, `.bd-group`, `.bd-group-head`, `.bd-group-label`, `.bd-carousel`, `.bd-carousel-track`, `.bd-carousel-clone`, `.bd-modal-overlay`, `.bd-section-list`, `.bd-section-row`.

Outras classes (Tailwind utilities, daisyUI components) são puramente estilo e podem ser editadas livremente.
