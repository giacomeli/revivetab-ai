# Plano: Desacoplamento genérico do seed e player de YouTube em modal

- **Data:** 08-07-2026
- **Branch:** `main`
- **Status:** Executado

## Contexto

Implementa a spec desta pasta (`spec.md`): leitura da árvore agnóstica de browser/idioma (containers-raiz
fora do `folderList`), `SEED_RULES` genérico com matching de pasta por token, re-seed automático via bump
de `bd:meta.version` (1 -> 2), e player de YouTube em modal na própria new tab.

Duas adições em relação à lista de arquivos da spec, ambas a serviço de verificação automatizada e reuso:

- `src/tree.js` (novo): `walk()` sai de `dial.js` para um módulo puro (sem dependência de `chrome.*`),
  permitindo testar em Vitest a regra "containers-raiz não entram no folderList".
- `src/modal.js`: ganha suporte a uma classe de box customizada (o player precisa de `max-w` maior que
  os modais atuais).

## Etapa 1 — Extrair `ytId` para módulo puro testável

**Arquivos:**
- `src/yt.js` (criar)
- `src/dial.js`
- `test/yt.test.js` (criar)

**Ações:**
- Criar `src/yt.js` exportando `ytId(url)` (regex atual de `dial.js`, que cobre `watch?v=` e `youtu.be/`).
- Em `dial.js`, remover a função local e importar de `./yt.js`.
- Criar `test/yt.test.js`: casos `youtube.com/watch?v=ID`, `youtu.be/ID`, URL com parâmetros extras,
  URL não-YouTube (retorna `null`), string vazia.

**Verificação:**
- `npm test` verde.

## Etapa 2 — Extrair `walk` para módulo puro e pular containers-raiz

**Arquivos:**
- `src/tree.js` (criar)
- `src/dial.js`
- `test/tree.test.js` (criar)

**Ações:**
- Criar `src/tree.js` com `walk(node, folders)` (movido de `dial.js`, sem alterações de comportamento) e
  `collectBookmarks(tree)`: itera os filhos do nó raiz (containers especiais — barra, gerais, mobile,
  detectados por posição, nunca por título) e chama `walk(child, [])` para cada filho de container.
  Resultado: títulos dos containers fora do `folderList`; favorito direto no container fica com
  `folderList` vazio.
- Em `dial.js`, importar de `./tree.js` e trocar o loop de `init()` por `STATE.all = collectBookmarks(tree)`.
  Manter o `timed('walk(tree)', ...)` em volta.
- Criar `test/tree.test.js` com uma árvore fixture no formato de `chrome.bookmarks.getTree()` (raiz
  `id 0` sem título, containers `Bookmarks Bar`/`Other Bookmarks` com pastas, subpastas e favoritos
  soltos): containers ausentes do `folderList`, favorito solto com `folderList` vazio, subpastas
  preservadas no caminho, favoritos dos dois containers presentes.

**Verificação:**
- `npm test` verde.
- `grep -n "function walk" src/dial.js` não retorna nada.

## Etapa 3 — `SEED_RULES` genérico e matching por token

**Arquivos:**
- `src/sections.js`
- `test/sections.test.js`

**Ações:**
- Reescrever `SEED_RULES` só com conteúdo universal (pt/en), mapeando para os ids existentes de
  `DEFAULT_SECTIONS` (que não muda):
  - `study`: folders `study`, `estudos`, `estudo`, `cursos`, `courses`, `learn`, `docs`, `livros`,
    `books`; urls `udemy`, `coursera`, `alura`, `medium.com`, `dev.to`, `wikipedia`.
  - `watch`: folders `videos`, `video`, `filmes`, `movies`, `series`, `watch`, `assistir`; urls
    `youtube.com/watch`, `youtu.be`, `vimeo`, `netflix`, `twitch`, `primevideo`, `disneyplus`.
  - `music`: folders `music`, `musica`, `musicas`, `songs`; urls `spotify`, `soundcloud`, `deezer`,
    `bandcamp`, `cifraclub`, `ultimate-guitar`.
  - `tools`: folders `tools`, `ferramentas`, `utils`, `util`, `apps`; urls (vazio).
  - `code`: folders `code`, `dev`, `repos`, `git`, `projetos`, `projects`; urls `github.com`,
    `gitlab.com`, `bitbucket.org`, `stackoverflow.com`, `npmjs.com`.
  - `ai`: folders `ai`, `ia`, `llm`, `llms`, `gpt`; urls `chatgpt.com`, `openai.com`, `claude.ai`,
    `anthropic.com`, `gemini.google`, `huggingface.co`, `perplexity.ai`.
  - `work`: folders `work`, `trabalho`, `job`, `empresa`, `company`; urls (vazio).
  - `explore`: folders `explore`, `explorar`, `shopping`, `compras`, `games`, `gaming`, `jogos`,
    `finance`, `financas`, `design`, `hardware`, `news`, `noticias`; urls (vazio).
- Reescrever `_folderMatches` para matching por token: normalizar pasta e keyword (lowercase + NFD sem
  acentos), quebrar o nome da pasta em tokens (separadores: espaço, `-`, `_`, `/`, `.`) e comparar
  igualdade de token — nunca substring. `ai` deixa de casar com `Email`; `musica` casa com `Música`.
- Exportar `SEED_VERSION = 2` (constante usada pela Etapa 4 e por `ensureSeeded`, que passa a gravar
  `{ version: SEED_VERSION, seeded: true }`).
- Atualizar `test/sections.test.js`: remover casos com dados pessoais; adicionar — pasta `Música` ->
  `music` (acento), pasta vence URL (YouTube dentro de pasta `music` -> `music`), `youtube.com/watch`
  solto -> `watch`, `github.com` -> `code`, `Email` NÃO casa com `ai`, sem match -> `null`.

**Verificação:**
- `npm test` verde.
- `grep -riE 'ecomm|maestro|senior|unig|nfe|glofi|casadagaita|animesonline|topflix|devops' src/` vazio.

## Etapa 4 — Migração: re-seed automático por versão

**Arquivos:**
- `src/sections.js`
- `src/dial.js`

**Ações:**
- Em `sections.js`, adicionar `needsReSeed(meta)`: `true` quando `meta?.seeded === true` e
  `(meta.version || 1) < SEED_VERSION`.
- Em `init()` (`dial.js`), após carregar o storage: se `needsReSeed(meta)`, rodar `reSeedAll(STATE.all,
  saveMembership)`, gravar `saveMeta({ version: SEED_VERSION, seeded: true })` e logar via `dbg()`.
  Caminho de primeira instalação continua em `ensureSeeded` (que grava backup + `SEED_VERSION`).
  O caminho de migração NÃO toca em `bd:initial-backup` nem em `bd:sections`.
- `reconcileMembership` continua rodando nos loads normais (sem mudança).

**Verificação:**
- `npm test` verde (adicionar caso para `needsReSeed`: meta v1 -> true, meta v2 -> false,
  meta null/não-seeded -> false).

## Etapa 5 — Player de YouTube em modal

**Arquivos:**
- `src/video-modal.js` (criar)
- `src/modal.js`
- `src/dial.js`

**Ações:**
- Em `modal.js`, aceitar `options.boxClass` (string) que substitui a classe do `modal-box` quando
  presente (mantendo `wide` como está).
- Criar `src/video-modal.js` exportando `openVideoModal(videoId, originalUrl, title)`:
  - `showModal` com box `modal-box max-w-5xl p-0 overflow-hidden bg-black`.
  - Container 16:9 (`aspect-video`) com iframe
    `https://www.youtube-nocookie.com/embed/{videoId}?autoplay=1` e
    `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"`, `allowfullscreen`.
  - Barra inferior com título do vídeo e link `Abrir no YouTube` (`btn btn-sm`, `href` = URL original,
    ícone `external-link` de `icons.js` se disponível; senão texto puro) — cobre vídeos com embed
    desabilitado pelo dono.
  - Fechamento por Escape/backdrop já vem de `showModal`/`closeModal`; a remoção do overlay remove o
    iframe do DOM e interrompe a reprodução.
- Em `wireEvents()` (`dial.js`), no branch do clique em card: se `ytId(href)` retornar id, chamar
  `openVideoModal(id, href, título do card)` em vez de `window.location.href = href`. Cards
  não-YouTube inalterados. Vale também para clones do carousel (handler é delegado).

**Verificação:**
- `npm run build` sem erros.
- Manual (extensão carregada): clique em card de YouTube abre o modal tocando; Escape fecha e o áudio
  para; backdrop fecha; "Abrir no YouTube" navega; card não-YouTube navega direto.

**Correções durante a execução (08-07-2026):**

1. Primeiro teste manual: Error 153 em todos os vídeos. Causa raiz: o YouTube passou a exigir o header
   `Referer` no player embutido e o Chrome não o envia a partir de páginas `chrome-extension://`.
   Correção: permissão `declarativeNetRequestWithHostAccess` + `host_permissions` de YouTube no
   `manifest.json`, e regra DNR de sessão (registrada em `video-modal.js` antes do primeiro embed) que
   injeta o `Referer` só em `sub_frame` de embed iniciados pela extensão. Ver revisão correspondente na
   seção Restrições da spec.
2. Segundo teste: Error 152-4 "video unavailable" em vídeos comprovadamente embeddable (oEmbed 200).
   Causa: valor de Referer `https://www.youtube.com/` rejeitado; a receita confirmada no fórum
   chromium-extensions usa o **id da extensão** (`chrome.runtime.id`) como valor e embed em
   `www.youtube.com` (não nocookie). Ajustado para seguir a referência exatamente. Também removido o
   atributo redundante `allowfullscreen` (o `allow` já inclui `fullscreen`; silencia warning no
   console).

## Etapa 6 — Versão, documentação e verificação de ponta a ponta

**Arquivos:**
- `manifest.json`
- `package.json`
- `CLAUDE.md`

**Ações:**
- Versão `3.1.0` -> `3.2.0` nos dois arquivos.
- Atualizar `CLAUDE.md`: seed genérico por token + `SEED_VERSION`/re-seed automático na seção de
  categorização; `tree.js` e `yt.js`/`video-modal.js` na tabela de módulos; player de YouTube na
  descrição geral; remover a nota sobre emojis em `SEED_RULES` (deixa de existir).
- `npm run build` e verificação manual na extensão carregada (checklist dos Critérios de Sucesso da
  spec, incluindo: breadcrumb sem `Bookmarks Bar`, re-seed automático no primeiro load com
  `bd:meta.version === 2`, `bd:initial-backup` intacto).

**Verificação:**
- Critérios de Sucesso da spec todos marcados.

## Verificação Final

1. `npm test` — suíte completa verde (sections, tree, yt).
2. `npm run build` — `dist/` gerado sem erros.
3. `grep -riE 'ecomm|maestro|senior|unig|nfe|glofi|casadagaita|animesonline|topflix|devops' src/` — vazio.
4. Manual na extensão: re-seed automático ocorreu uma única vez; breadcrumbs limpos; modal de YouTube
   funcional; seções, DnD, busca, carousel e modais existentes sem regressão.
