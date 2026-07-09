# Plano: Internacionalização (i18n) — inglês, espanhol e português

- **Data:** 08-07-2026
- **Branch:** `main`
- **Status:** Executado

## Contexto

Implementa a spec desta pasta: `chrome.i18n` nativo com `default_locale: "en"`, catálogos en/es/pt_BR,
wrapper `t()` com fallback para testes, manifest localizado e UI inteira consumindo chaves.

## Etapa 1 — Wrapper `t()` e catálogo de referência (en)

**Arquivos:** `src/services/i18n.ts` (criar), `_locales/en/messages.json` (criar)

**Ações:**
- `t(key, subs?)`: delega a `chrome.i18n.getMessage(key, subs)`; sem `chrome.i18n` (Vitest/Node),
  retorna a própria key. `uiLanguage()`: `chrome.i18n.getUILanguage()` com fallback `'en'`.
- Inventariar TODAS as strings de UI (ui/*.ts, index.html, erros do ai-client, labels de seções
  default) e escrever o catálogo inglês completo, com `placeholders` nomeados nas mensagens com
  variáveis (contagens, títulos, status HTTP, nome do provider).

**Verificação:** `npm run typecheck` verde; `node -e` valida o JSON do catálogo.

## Etapa 2 — Catálogos pt_BR e es

**Arquivos:** `_locales/pt_BR/messages.json`, `_locales/es/messages.json` (criar)

**Ações:**
- Tradução 1:1 do catálogo en (pt_BR preserva os textos atuais da UI; es traduzido nesta execução).

**Verificação:**
- Script de paridade: `node -e` compara `Object.keys()` dos três catálogos — conjuntos idênticos.

## Etapa 3 — Manifest localizado

**Arquivos:** `manifest.json`

**Ações:**
- `default_locale: "en"`; `name: "__MSG_appName__"`, `short_name: "__MSG_appShortName__"`,
  `description: "__MSG_appDesc__"`. Chaves `appName`/`appShortName` idênticas nos três catálogos
  (marca); `appDesc` traduzido, cada versão com no máximo 132 chars (validar por script).
- Confirmar que o @crxjs copia `_locales/` para o `dist/`; se não copiar, mover os catálogos para
  `public/_locales/` (Vite copia `public/*` para a raiz do dist) e registrar no plano.

**Verificação:** `npm run build`; `dist/_locales/{en,es,pt_BR}/messages.json` existem e
`dist/manifest.json` contém `__MSG_appName__` + `default_locale`.

## Etapa 4 — Camada services

**Arquivos:** `src/services/sections.ts`, `src/services/tree.ts`, `src/services/ai-client.ts`,
`test/sections.test.ts`, `test/tree.test.ts`, `test/ai.test.ts`

**Ações:**
- `sections.ts`: `DEFAULT_SECTIONS` vira `defaultSections()` — mesma lista, labels via
  `t('sectionStudy')` etc. `ensureSeeded` passa a usar `defaultSections()`. Ids/ícones/cores/ordem
  imutáveis.
- `tree.ts`: `walk` guarda `node.title || ''` (sem o literal `(sem titulo)`); a UI exibe
  `t('untitled')` quando vazio.
- `ai-client.ts`: prompt de sistema em inglês; mensagens de erro via `t()` com chaves
  (`aiErrorInvalidKey`, `aiErrorNoCredits`, `aiErrorRateLimit`, `aiErrorHttp`, `aiErrorNetwork`,
  `aiErrorResponseNotJSON`, `aiErrorMissingAssignments`, `aiErrorEmptyResponse`), com substituições
  (provider, status).
- Testes: ajustar asserts que dependiam de literais pt (mensagens de erro passam a casar com as
  chaves no ambiente de teste; prompt em inglês).

**Verificação:** `npm test` verde.

## Etapa 5 — Camada ui e entry

**Arquivos:** `src/ui/dial.ts`, `src/ui/dnd.ts` (sem strings de UI — conferir), `src/ui/modal.ts`,
`src/ui/modal-sections.ts`, `src/ui/modal-ai.ts`, `src/ui/video-modal.ts`,
`src/ui/bookmark-ops.ts`, `index.html`, `src/main.ts`

**Ações:**
- Substituir todas as strings visíveis por `t()` (labels, botões, tooltips, aria, confirm/alert,
  status, prévia da IA). Strings com HTML embutido (resumo da prévia) são compostas por partes para
  não colocar markup nos catálogos.
- `index.html`: atributos `data-i18n-placeholder`/`data-i18n-title`/`data-i18n-aria` nos elementos
  estáticos; `main.ts` aplica no boot e seta `document.documentElement.lang = uiLanguage()`.

**Verificação:**
- `npm run typecheck` verde.
- Grep de amostra ("Gerenciar seções", "Organizar com IA", "Abrir no YouTube", "Excluir favorito",
  "Carregando favoritos", "Testar conexão") vazio em `src/` e `index.html`.

## Etapa 6 — Versão, docs e fechamento

**Arquivos:** `manifest.json`, `package.json`, `CLAUDE.md`, `store/listing.md`

**Ações:**
- Versão `3.5.0` -> `3.6.0` (manifest + package).
- `CLAUDE.md`: seção "Internacionalização" (mecanismo, regra de paridade de chaves, "toda string
  nova nasce nos três catálogos", seções default resolvidas no seed).
- `store/listing.md`: nota de que name/description localizam via manifest e a descrição longa deve
  ser cadastrada por idioma no dashboard (en/es/pt-BR).
- Regenerar `revivetab-ai-3.6.0.zip` (remover o 3.5.0).

**Verificação:** Verificação Final abaixo; critérios da spec marcados.

## Verificação Final

1. `npm run typecheck` + `npm test` + `npm run build` verdes.
2. Paridade de chaves entre os três catálogos (script node).
3. `dist/_locales/` com en/es/pt_BR; `dist/manifest.json` com `__MSG_*__`, `default_locale: "en"` e
   versão 3.6.0.
4. Grep de amostra de strings pt vazio em `src/` e `index.html`.
5. Manual (usuário): UI acompanha o idioma do browser (pt-BR, en, es), incluindo nome da extensão em
   `chrome://extensions`.
