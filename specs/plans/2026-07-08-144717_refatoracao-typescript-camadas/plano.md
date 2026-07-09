# Plano: Refatoração completa para TypeScript com arquitetura em camadas

- **Data:** 08-07-2026
- **Branch:** `main`
- **Status:** Executado

## Contexto

Executa a spec desta pasta com autonomia total autorizada pelo usuário. Migração incremental por
camada, de baixo para cima (types -> data/assets/services -> ui -> entry), para que o typecheck final
feche sem estados intermediários longos. Comportamento idêntico; cada etapa termina com verificação.

## Etapa 1 — Toolchain TypeScript

**Arquivos:** `package.json`, `tsconfig.json` (novo), `index.html`

**Ações:**
- `npm i -D typescript @types/chrome`.
- `tsconfig.json`: strict, noEmit, target ES2022, moduleResolution bundler, libs ES2022 + DOM,
  types chrome, include `src` e `test`.
- Script `"typecheck": "tsc --noEmit"`.
- `index.html`: entry `/src/main.ts`.

**Verificação:** `npx tsc --version` e instalação sem erros.

## Etapa 2 — Núcleo: `types.ts` e `state.ts`

**Ações:**
- `src/types.ts`: `Bookmark`, `Section`, `Membership`, `Meta`, `SeedRule(s)`, `TreeNode`,
  `AiProviderId`, `AiConfig`, `OrganizeResult`, `OrganizeProgress`, `PreviewSummary`.
- `src/state.js` -> `src/state.ts` tipado (`AppState`, `timed<T>`, `timedAsync<T>`).

**Verificação:** typecheck parcial dos arquivos novos.

## Etapa 3 — Camadas assets e data

**Ações:**
- `src/icons.js` -> `src/assets/icons.ts` (`Record<string, string>`, `iconSVG(name, size?)`).
- `src/styles.css` -> `src/assets/styles.css` (movido sem alteração).
- `src/storage.js` -> `src/data/storage.ts` tipado (generics nos wrappers `_get`/`_set`).
- `src/data/bookmarks.ts` (novo): `getTree()`, `updateTitle()`, `removeBookmark()`,
  `onBookmarkRemoved/Created/Changed()` — move os wrappers de `chrome.bookmarks` da UI.

**Verificação:** typecheck parcial.

## Etapa 4 — Camada services

**Ações:**
- `sections.js` -> `services/sections.ts`; `tree.js` -> `services/tree.ts`; `yt.js` ->
  `services/yt.ts`; `ai-client.js` -> `services/ai-client.ts`; `ai-organize.js` ->
  `services/ai-organize.ts`. Assinaturas tipadas com `types.ts`; imports extensionless.

**Verificação:** typecheck parcial.

## Etapa 5 — Camada ui e entry

**Ações:**
- `modal.js`, `video-modal.js`, `bookmark-ops.js`, `dnd.js`, `modal-ai.js`, `modal-sections.js`,
  `dial.js` -> `src/ui/*.ts` tipados; `chrome.bookmarks` via `data/bookmarks.ts`; imports de assets
  atualizados (`./assets/styles.css` no entry).
- `main.js` -> `src/main.ts`.
- Remover todos os `.js` antigos de `src/`.

**Verificação:** `npm run typecheck` completo sem erros.

## Etapa 6 — Testes em TS

**Ações:**
- `test/*.test.js` -> `test/*.test.ts` com imports dos novos caminhos
  (`../src/services/sections` etc.), mesmos 54 casos.

**Verificação:** `npm test` verde (54 testes).

## Etapa 7 — Versão, docs e verificação final

**Ações:**
- Versão `3.4.0` em `manifest.json` e `package.json`.
- `CLAUDE.md`: stack, comando typecheck, tabela de módulos por camada, regra de dependência.
- Rodar a Verificação Final.

**Verificação:** Critérios de Sucesso da spec marcados.

## Verificação Final

1. `npm run typecheck` — zero erros.
2. `npm test` — 54 testes verdes.
3. `npm run build` — `dist/` ok, manifest 3.4.0.
4. `find src -name "*.js"` — vazio.
5. `grep -rn "from '\.\./ui\|from './ui" src/services src/data` — vazio (camadas respeitadas).
6. `grep -rn ": any" src/` — vazio.
7. Manual (usuário): extensão sem regressão (dial, busca, DnD, modais, player, IA).
