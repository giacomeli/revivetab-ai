# Spec: Categorização Inteligente, Drag-and-Drop e CRUD de Seções

**Data:** 2026-05-24
**Projeto:** bookmark-dial (Chrome/Brave Extension, Manifest V3, vanilla JS)

## 1. Problema

A categorização atual de bookmarks tem três limitações principais:

1. **Categorização "burra":** `categorize()` em `dial.js:141-157` faz primeiro-match-vence em ordem fixa, com regras que misturam pasta e URL sem prioridade clara. Resultado: bookmarks do YouTube colocados em pastas como `Music` caem na seção `watch` (porque o match dela inclui `/youtube\.com\/watch/.test(u)` e `watch` vem antes de `music` no array `SECTIONS`).
2. **Sem mover cards:** Não há como mover um bookmark de uma seção para outra na UI. Só editar título e excluir.
3. **Seções hardcoded:** As 8 seções vivem no array `SECTIONS` em `dial.js`. Renomear, criar ou excluir exige editar código.

## 2. Decisões fundamentais

| Decisão | Escolha | Por quê |
| --- | --- | --- |
| Modelo de categorização | Tags + override manual (heurística semeia 1x; membership salva é a verdade) | Mais previsível, WYSIWYG, elimina o problema "burra" definitivamente |
| Movimentação de cards | Drag-and-drop nativo entre seções | Visual, rápido, sem dependências |
| CRUD de seções | Misto: rename inline + modal "Gerenciar seções" para criar/excluir/reordenar/ícone/cor | Baixa fricção para renomear + UI organizada para o resto |
| Ícones | Lucide SVG embutidos (sem build, sem CDN) | Alinhado com regra global "zero emojis" do user, sem mexer no build (não há) |
| Persistência | `chrome.storage.local` | Único caminho razoável (sem backend, bookmarks API não tem metadata) |
| Bookmarks do browser | Read-only (exceto rename/delete explícitos já existentes) | Princípio de segurança: customização vive em storage próprio |
| Backup | Automático antes da semeadura + exportação manual JSON | Garantia explícita pedida pelo user |

## 3. Arquitetura

### 3.1 Storage schema (chrome.storage.local)

Três chaves principais + uma para backup inicial:

```js
// bd:sections — array ordenado de seções
[
  { id: 'study',  label: 'O que estudar hoje',  icon: 'book-open', color: '#4fc3f7', order: 0 },
  { id: 'watch',  label: 'O que assistir hoje', icon: 'video',     color: '#ef5350', order: 1 },
  { id: 'music',  label: 'Praticar música',     icon: 'music',     color: '#ff9800', order: 2 },
  { id: 'tools',  label: 'Ferramentas',         icon: 'wrench',    color: '#66bb6a', order: 3 },
  { id: 'code',   label: 'Repos & Code',        icon: 'code',      color: '#ce93d8', order: 4 },
  { id: 'ai',     label: 'AI & LLMs',           icon: 'bot',       color: '#ab47bc', order: 5 },
  { id: 'work',   label: 'Trabalho',            icon: 'briefcase', color: '#ffa726', order: 6 },
  { id: 'explore',label: 'Explorar',            icon: 'globe',     color: '#26c6da', order: 7 },
  { id: 'inbox',  label: 'Não categorizado',    icon: 'inbox',     color: '#888',    order: 999, builtin: true }
]

// bd:membership — fonte da verdade: qual seção contém qual bookmark
{ "1234": "music", "5678": "study", "9012": "inbox" }

// bd:meta — versão e flags
{ version: 1, seeded: true }

// bd:initial-backup — snapshot da árvore antes da primeira semeadura
{ savedAt: '2026-05-24T...', tree: <chrome.bookmarks.getTree() output> }
```

Propriedades importantes do schema:

- `id` é imutável (gerado uma vez via slug do label inicial + sufixo numérico em caso de conflito). Rename muda só `label`.
- `icon` é o nome do ícone Lucide (string) — resolvido pelo helper `iconSVG(name)`.
- `color` é hex RGB. Paleta padrão de 10 cores + opção custom via `<input type="color">`.
- `order` é o índice de exibição. Reordenar manipula `order`.
- `builtin: true` no Inbox impede exclusão e mudança de `id` (mas permite rename, ícone, cor, reordenar).

### 3.2 Lógica de categorização

#### Primeira execução (`bd:meta.seeded === false`)

1. Lê `chrome.bookmarks.getTree()`.
2. **Salva backup** em `bd:initial-backup` antes de qualquer outra coisa.
3. Flatten via `walk()` (lógica atual mantida).
4. Para cada bookmark, aplica `seedCategorize(bm, SEED_RULES)`:
   - **Passada 1 — match por pasta** (prioridade alta): se alguma pasta do bookmark casa com a lista `folders` de uma seção, vence essa.
   - **Passada 2 — match por URL** (fallback): só se nada casou na passada 1, aplica regex de URL.
   - **Default:** Inbox.
5. Resultado vira `bd:membership`.
6. Salva `bd:meta = { version: 1, seeded: true }`.

#### Execuções seguintes (`bd:meta.seeded === true`)

1. Lê `chrome.bookmarks.getTree()` + `bd:membership` + `bd:sections`.
2. Reconcilia:
   - **Bookmark novo** (existe no Brave, não em membership): adiciona a `inbox`.
   - **Bookmark sumido** (em membership, não no Brave): remove de membership.
   - **Bookmark existente**: nada muda — fica na seção atual.
3. Renderiza por seção via membership.

#### Re-semear manual

Botão "Recategorizar tudo automaticamente" no modal limpa `bd:membership` e roda a semente novamente. **Não toca em `bd:sections`** — seções customizadas pelo user permanecem (com ícone, cor, label, ordem). Mas como SEED_RULES só conhece as 8 seções padrão, **todos os bookmarks que o user moveu manualmente para seções customizadas voltam para Inbox** (ou para uma das 8 padrão, se casarem com uma regra).

Confirmação no modal: "Isso vai apagar todas as movimentações manuais que você fez. Tem certeza?". Decisão deliberada — re-semear é "voltar ao estado inicial de categorização", e isso significa perder customização de membership. Quem quiser preservar tudo deve usar o backup antes.

#### SEED_RULES (constante em código)

```js
const SEED_RULES = {
  study:   { folders: ['study','DevOps','DotNet','Frontend','Backend','Architecture',
                       'Laravel','APIs','Mobile','Research','GB','📖'], urls: [] },
  watch:   { folders: ['🎦','videos'], urls: [/youtube\.com\/watch/, /animesonline|topflix/] },
  music:   { folders: ['Music'], urls: [/cifraclub|casadagaitaponto/] },
  tools:   { folders: ['~/tools','Util'], urls: [] },
  code:    { folders: ['.git','Nice repos'], urls: [/github\.com|gitlab\.com/] },
  ai:      { folders: ['AIs','AI'], urls: [] },
  work:    { folders: ['work','🟠 Ecomm','🟢 Maestro','Senior','Unig','NFE',
                       'Glofi','🔴 RP','Rich','Important'], urls: [] },
  explore: { folders: ['/var','/tmp','hack','Gaming','Auto','Shopping','Hardware',
                       'Finance','Design','Hosting','kb','SEO'], urls: [] },
};
```

**Observação sobre emojis em SEED_RULES:** as strings em `folders` são **nomes literais de pastas do Brave** (dados, não decoração de UI). A regra global "zero emojis em artefatos" se aplica a código de UI e prosa — não a constantes que precisam casar exatamente com nomes de pastas pré-existentes do user (`🎦`, `🟠 Ecomm`, `🟢 Maestro`, `🔴 RP`). Match é `folderName.toLowerCase().includes(rule.toLowerCase())` para tolerar variações.

### 3.3 Listeners do Chrome (sincronização em tempo real)

```js
chrome.bookmarks.onRemoved (id, info)  → membership[id] removido; re-render
chrome.bookmarks.onCreated (id, bm)    → membership[id] = 'inbox'; ALL.push; re-render
chrome.bookmarks.onChanged (id, info)  → ALL[i].title atualizado; só re-render do card
chrome.bookmarks.onMoved   (id, info)  → ignorado (membership é independente da pasta)
```

Eventos garantem que adicionar/remover/renomear bookmarks via Brave reflete sem reload da new tab.

## 4. UI

### 4.1 Modal "Gerenciar seções"

Acionado por botão no header global (ícone `settings` do Lucide, ao lado do Shuffle).

**Estrutura:**

```
Gerenciar seções                                    [X]
─────────────────────────────────────────────────────
[+ Nova seção]

⋮⋮  [book-open] O que estudar hoje      [edit] [trash]
⋮⋮  [video]     O que assistir hoje     [edit] [trash]
⋮⋮  [music]     Praticar música         [edit] [trash]
⋮⋮  [wrench]    Ferramentas             [edit] [trash]
⋮⋮  [code]      Repos & Code            [edit] [trash]
⋮⋮  [bot]       AI & LLMs               [edit] [trash]
⋮⋮  [briefcase] Trabalho                [edit] [trash]
⋮⋮  [globe]     Explorar                [edit] [trash]
⋮⋮  [inbox]     Não categorizado        [edit] [—]   ← builtin: sem delete

─────────────────────────────────────────────────────
[Recategorizar tudo automaticamente]   [Exportar backup]
```

**Operações:**

| Ação | Como | Resultado |
| --- | --- | --- |
| Criar | Botão `+ Nova seção` expande form inline: input nome + grid de ícones + paleta de cores | Push para `bd:sections` com novo id, order = max+1 |
| Renomear | (1) clique no nome no header da home (inline) **ou** (2) `edit` no modal abre form inline com nome/ícone/cor | Atualiza `label` (ou ícone/cor) da entry em `bd:sections` |
| Excluir | `trash` no modal pede confirmação | Move todos os bookmarks da seção para `inbox` no `bd:membership`, depois remove a entry de `bd:sections` |
| Reordenar | Drag handle `⋮⋮` arrasta a linha no modal | Recalcula `order` de todas as seções; salva |
| Re-semear | Botão "Recategorizar tudo automaticamente" pede confirmação | Limpa `bd:membership`, roda semente novamente |
| Backup | Botão "Exportar backup" | Download de JSON com tree + storage |

**Constraint do Inbox (builtin):**

- `delete` desabilitado/oculto.
- `edit` permitido (pode renomear, trocar ícone/cor).
- `drag handle` permitido (pode reordenar).
- Pode ser movido pra `order: 0` se o user quiser ver primeiro.

### 4.2 Header das seções na home (rename inline)

Hoje: `<div class="group-head"><span class="group-dot"></span><span class="group-label">[emoji] [label]</span></div>`.

Novo: ícone (SVG inline via `iconSVG()`) + label clicável. Clique no label entra em modo edição (input substitui o span), Enter salva, Escape cancela, blur salva. Tooltip "clique para renomear" no hover.

### 4.3 Drag-and-drop entre seções

**Marcação no card:**

```html
<div class="dial-wrap" draggable="true" data-bm-id="123" data-href="...">
```

Clones do carrossel recebem `draggable="false"` para não serem arrastáveis.

**Drop zones:**

- `.group-head` (sempre visível, mesmo em seção vazia) — drop zone primária.
- `.carousel-viewport` — drop zone secundária.

**Eventos:**

```js
card.addEventListener('dragstart', (e) => {
  e.dataTransfer.setData('text/plain', card.dataset.bmId);
  e.dataTransfer.effectAllowed = 'move';
  document.body.classList.add('bd-dragging');
});

card.addEventListener('dragend', () => {
  document.body.classList.remove('bd-dragging');
  document.querySelectorAll('.bd-drop-target').forEach(el => el.classList.remove('bd-drop-target'));
});

zone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  zone.classList.add('bd-drop-target');
});

zone.addEventListener('dragleave', () => zone.classList.remove('bd-drop-target'));

zone.addEventListener('drop', (e) => {
  e.preventDefault();
  const bmId = e.dataTransfer.getData('text/plain');
  const destSectionId = zone.closest('.group').dataset.sectionId;
  moveBookmark(bmId, destSectionId);
});
```

**CSS:**

- `body.bd-dragging .group-head`: outline tracejado (indica drop zone disponível).
- `.bd-drop-target`: outline sólido + background highlight discreto.
- Card sendo arrastado: `opacity: 0.4; cursor: grabbing`.

**moveBookmark(bmId, destSectionId):**

1. Se `membership[bmId] === destSectionId`, retorna sem fazer nada (drop na mesma seção = no-op).
2. Atualiza `bd:membership[bmId] = destSectionId`.
3. Salva via `chrome.storage.local.set`.
4. Re-render da home (`renderAll()`).

### 4.4 Ícones (Lucide SVG embutidos)

Arquivo novo `icons.js` (carregado antes de `dial.js` em `newtab.html`):

```js
const LUCIDE_ICONS = {
  'book-open':   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  'video':       '...',
  'music':       '...',
  // ... ~40 ícones
};

function iconSVG(name, size = 20) {
  const raw = LUCIDE_ICONS[name] || LUCIDE_ICONS['bookmark'];
  return raw.replace('<svg ', `<svg width="${size}" height="${size}" `);
}
```

**Lista curada inicial (40 ícones):**

book-open, video, music, wrench, code, bot, briefcase, globe, gamepad-2, shopping-cart, dollar-sign, palette, server, search, bookmark, folder, star, heart, inbox, settings, hash, tag, camera, headphones, image, map, newspaper, pen-tool, rocket, sparkles, target, terminal, trending-up, tv, users, zap, calendar, clock, flame, layers.

SVGs vêm de [lucide.dev](https://lucide.dev) (ISC license). Cada um pesa ~200-400 bytes. Total esperado: ~10kb.

**Uso:**

- No header da seção: `<span class="group-icon">${iconSVG(sec.icon, 18)}</span>`.
- No modal (grid do icon picker): renderiza um botão por ícone disponível.
- Cor herda do CSS via `stroke="currentColor"` — combina com `sec.color` aplicado via inline style ou variável CSS.

## 5. Arquivos afetados

### Novos

- `icons.js` (~10kb) — `LUCIDE_ICONS` + `iconSVG()`.
- `storage.js` (~4kb) — wrapper sobre `chrome.storage.local` com helpers tipados: `loadConfig()`, `saveSections()`, `setMembership()`, `getMembership()`, `exportBackup()`, etc.
- `sections.js` (~6kb) — lógica de CRUD de seções, semeadura, reconciliação, listeners do Chrome.
- `dnd.js` (~3kb) — setup dos handlers de drag-and-drop.
- `modal-sections.js` (~6kb) — UI do modal "Gerenciar seções".

### Modificados

- `manifest.json` — versão bump para `3.0.0`; adicionar permission `storage`.
- `newtab.html` — adicionar `<script>` tags na ordem (`icons.js`, `storage.js`, `sections.js`, `dnd.js`, `modal-sections.js`, `dial.js`), botão `settings` no header.
- `dial.js` — `SECTIONS` constante removida (lê de storage); `categorize()` substituída por `seedCategorize()`; `renderAll()` lê membership; remove emojis dos defaults; rename inline; integra `dnd.js`.
- `style.css` — estilos de drag-and-drop, modal de seções, icon picker, header editável, color picker, drop zones.

### Inalterados

- `icons/icon128.png`.

## 6. Migração

Usuário existente (v2.0.0 já instalado, sem storage):

1. Carrega a extensão atualizada (v3.0.0).
2. Abre new tab → `init()` detecta `bd:meta` ausente.
3. Roda fluxo de primeira instalação: backup + semente (com SEED_RULES, que herda a categorização atual).
4. Resultado: mesmas 8 seções aparecem nas mesmas posições, com os mesmos bookmarks (mais o Inbox no final, possivelmente vazio se as regras cobrem tudo).

Não há perda de dados. Backup garante reversibilidade.

## 7. Princípios de segurança

1. **Bookmarks do browser são read-only por padrão.** As únicas operações que tocam `chrome.bookmarks` continuam sendo:
   - `chrome.bookmarks.update(id, {title})` — botão `edit` no card (existente).
   - `chrome.bookmarks.remove(id)` — botão `delete` no card (existente).
   - Nenhuma nova operação adiciona escrita.
2. **Backup automático** em `bd:initial-backup` antes da primeira modificação de qualquer storage.
3. **Backup manual exportável** a qualquer momento via modal.
4. **Movimentação entre seções no Dial** modifica apenas `bd:membership` — zero impacto na estrutura de pastas do Brave.

## 8. Não-objetivos (YAGNI)

- Sincronização entre dispositivos (não usa `chrome.storage.sync`).
- Importação de backup (export sim, import fica para outra iteração).
- Regras customizáveis pelo user (`SEED_RULES` em código — Approach B).
- Busca dentro do icon picker (lista de 40 cabe sem busca).
- Drag-and-drop para reordenar **cards dentro** da mesma seção (só entre seções).
- Atalhos de teclado para mover entre seções.
- Múltiplas seções por bookmark (continua 1:1).

## 9. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Carrossel infinito com clones quebra drag | Clones recebem `draggable="false"`; após drop, re-render limpa todos os clones |
| `chrome.storage.local` lento na primeira leitura | `init()` mostra placeholder existente "Carregando favoritos..." durante load |
| User exclui seção com muitos bookmarks → todos vão pro Inbox de uma vez | Confirmação no modal exibe contagem ("Mover 47 bookmarks para Não categorizado?") |
| User cria seção nova mas sem bookmarks | UI mostra seção vazia com hint "Arraste um card aqui" no espaço do carrossel |
| Bug no schema/migração corrompe storage | `bd:initial-backup` permite restauração manual via importação futura ou via DevTools (`chrome.storage.local.set(...)`) |

## 10. Critérios de sucesso

Após implementação, as seguintes operações funcionam:

1. YouTube de música em pasta "Music" no Brave aparece em "Praticar música", não em "Watch".
2. Arrastar qualquer card de qualquer seção para o header (ou viewport) de outra seção move o bookmark, persiste, e sobrevive a reload.
3. Modal "Gerenciar seções" permite criar, renomear, excluir, reordenar e trocar ícone/cor de seções.
4. Adicionar um bookmark via Brave faz ele aparecer no Inbox automaticamente, sem reload.
5. Remover um bookmark via Brave faz ele sumir da Dial automaticamente.
6. Exportar backup baixa um JSON válido com a árvore + storage atual.
7. Reinstalar do zero (storage limpo) reproduz o estado original com as 8 seções padrão + Inbox.
8. Nenhum bookmark do Brave é perdido, modificado ou movido de pasta como resultado de uso normal do Dial.
