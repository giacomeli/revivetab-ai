# Spec: Internacionalização (i18n) — inglês, espanhol e português

- **Data:** 08-07-2026
- **Branch:** `main`
- **Status:** Executado

## Contexto

Toda a UI do ReviveTab AI está hardcoded em pt-BR (strings espalhadas por `ui/*.ts`, erros de
`services/ai-client.ts`, `index.html` e o manifest). Para a publicação global no Chrome Web Store, a
extensão precisa de no mínimo inglês, espanhol e pt-BR.

Decisões do usuário (registradas em 08-07-2026):

- **Mecanismo: `chrome.i18n` nativo** — `_locales/{locale}/messages.json` + `getMessage()`. O idioma
  segue o idioma do browser do usuário (sem seletor no app). É o único mecanismo que também localiza
  `name`/`description` do manifest, traduzindo a listagem da loja por região.
- **`default_locale: "en"`** — browsers em idiomas não suportados caem no inglês.

## Requisitos

1. **Catálogos de mensagens.** `_locales/en/messages.json` (catálogo de referência),
   `_locales/es/messages.json` e `_locales/pt_BR/messages.json`, cobrindo TODAS as strings visíveis:
   labels, botões, tooltips, aria-labels, placeholders, mensagens de status/erro, diálogos
   `confirm`/`alert`, textos da prévia de IA e do player. Strings com variáveis usam o sistema de
   placeholders do chrome.i18n (`$COUNT$` etc.). Os três catálogos têm exatamente o mesmo conjunto
   de chaves.
2. **Manifest localizado.** `default_locale: "en"`; `name`, `short_name` e `description` viram
   `__MSG_appName__`/`__MSG_appShortName__`/`__MSG_appDesc__`. O nome/short_name mantêm o mesmo
   valor de marca nos três idiomas; a `description` é traduzida (cada versão dentro de 132 chars).
3. **Wrapper `src/services/i18n.ts`.** `t(key, subs?)` delega a `chrome.i18n.getMessage`; quando a
   API não existe (Vitest/Node), retorna a própria key — mantém os módulos de services puros e
   testáveis sem mock. Também expõe `uiLanguage()` para setar `document.documentElement.lang` no
   boot.
4. **UI consumindo `t()`.** Todas as strings de `ui/*.ts` saem do código e viram chaves. Os textos
   estáticos do `index.html` (placeholder da busca, titles/aria dos botões do header) recebem
   `data-i18n-*` e são aplicados no boot em `main.ts`.
5. **Seções padrão localizadas no seed.** `DEFAULT_SECTIONS` vira `defaultSections()` que resolve os
   labels via `t()` no momento da semeadura: instalações novas ganham labels no idioma do browser.
   Instalações existentes NÃO são tocadas (labels já salvos em `bd:sections` permanecem, renomeáveis
   pela UI). Ids, ícones, cores e ordem não mudam.
6. **IA.** O prompt de sistema do classificador passa a inglês (língua única para o modelo, melhor
   compatibilidade entre providers; os labels de seção enviados continuam sendo os do usuário, em
   qualquer idioma). As mensagens de erro do `ai-client` viram chaves i18n.
7. **`services/tree.ts` puro.** `walk` deixa de embutir o literal `'(sem titulo)'`: título vazio
   permanece vazio e a camada de UI exibe `t('untitled')` no render.
8. **Documentação e versão.** `CLAUDE.md` ganha seção de i18n com a regra "toda string nova nasce
   como chave nos três catálogos"; `store/listing.md` ganha nota sobre descrição longa por idioma no
   dashboard; versão `3.5.0` -> `3.6.0`.

## Restrições

- Nenhum framework/dependência de i18n — só a API nativa.
- Logs de debug (`[BD-*]`, `dbg()`) NÃO são localizados — são instrumentação técnica, não UI.
- Chaves de storage (`bd:*`), classes CSS (`bd-*`, `dial-*`) e ids de seção intactos.
- Dados existentes do usuário (labels de seções salvas, membership) não são migrados nem alterados.
- Traduções en/es produzidas nesta execução; revisão nativa fica a critério do usuário depois.
- Sem commit/push sem pedido explícito.

## Arquivos Envolvidos

| Arquivo | Ação |
| --- | --- |
| `_locales/{en,es,pt_BR}/messages.json` | Criar — catálogos completos (3 idiomas) |
| `manifest.json` | Modificar — default_locale + __MSG_*__ + versão 3.6.0 |
| `src/services/i18n.ts` | Criar — `t()`, `uiLanguage()` com fallback para testes |
| `src/services/sections.ts` | Modificar — `defaultSections()` com labels via `t()` |
| `src/services/ai-client.ts` | Modificar — prompt em inglês; erros via chaves i18n |
| `src/services/tree.ts` | Modificar — remover literal de título vazio |
| `src/ui/*.ts` (7 arquivos) | Modificar — todas as strings via `t()` |
| `index.html` + `src/main.ts` | Modificar — data-i18n aplicado no boot; lang dinâmico |
| `test/sections.test.ts`, `test/ai.test.ts`, `test/tree.test.ts` | Modificar — ajustes aos novos contratos |
| `package.json` | Modificar — versão 3.6.0 |
| `CLAUDE.md`, `store/listing.md` | Modificar — seção i18n e nota de listagem por idioma |

## Critérios de Sucesso

- [x] `npm run typecheck` (zero erros), `npm test` (54) e `npm run build` verdes.
- [x] Paridade: 89 chaves idênticas nos três `messages.json` (verificado também no `dist/`).
- [x] `dist/` contém `_locales/` com os três idiomas e o manifest com `__MSG_*__` +
      `default_locale: "en"` + versão 3.6.0 (o @crxjs copia `_locales/` automaticamente).
- [x] Grep de amostra vazio em strings de UI — as duas únicas ocorrências restantes são comentários
      pt-BR (regra do projeto), não UI.
- [x] Manual (usuário): extensão carregada exibe UI em pt-BR com browser em português; trocando o
      idioma do browser para inglês/espanhol, a UI e o nome da extensão acompanham (validado pelo
      usuário em 08-07-2026).
