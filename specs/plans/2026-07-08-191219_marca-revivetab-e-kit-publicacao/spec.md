# Spec: Marca ReviveTab AI e kit de publicação no Chrome Web Store

- **Data:** 08-07-2026
- **Branch:** `main`
- **Status:** Executado

Nota de processo: a identidade de marca foi definida pelo usuário (com apoio do Gemini) e entregue
pronta — nome, título de loja, resumo, descrição longa, conceito de ícone e plano de screenshots.
Esta spec aplica a marca ao projeto e produz o kit de publicação. Execução autônoma autorizada.

## Decisões de marca (do usuário)

| Item | Valor |
| --- | --- |
| Marca / nome principal | ReviveTab AI |
| Título de loja (manifest name) | ReviveTab AI: Bookmarks & Speed Dial (36 chars, limite 75) |
| short_name | ReviveTab AI (12 chars, limite 12) |
| Resumo (manifest description) | Versão ajustada em 127 chars (original do usuário tinha 136; limite 132) |
| Repositório GitHub sugerido | `revivetab-ai` (usuário criará) |
| Ícone | Aba inclinada + sparkle de 4 pontas cortando a borda; degradê roxo elétrico -> ciano; fundo escuro |
| Pitch | "Cemitério de links" — favoritos esquecidos ganham vida na new tab com IA |

## Requisitos

1. Aplicar a marca ao código: `manifest.json` (name, short_name, description, versão 3.5.0),
   `package.json` (name, description, versão), strings de atribuição do OpenRouter em
   `services/ai-client.ts`, prefixo do arquivo de backup exportado, `CLAUDE.md`.
2. Gerar o ícone (SVG fonte em `icons/icon.svg` + PNGs 16/32/48/128 renderizados) e declarar os
   quatro tamanhos no manifest.
3. Criar material de repositório: `README.md` (pitch, features, instalação, desenvolvimento),
   `LICENSE` (MIT — trocável pelo usuário antes de publicar o repo) e `PRIVACY.md` (política de
   privacidade bilíngue pt/en, URL pública exigida pelo CWS).
4. Criar `store/` com o kit de listagem: `listing.md` (título, resumo, descrição longa e categoria),
   `justificativas-permissoes.md` (single purpose + uma justificativa por permissão, pt/en) e
   `screenshots-plano.md` (plano de capturas do usuário).
5. Gerar o zip de publicação a partir do build (`revivetab-ai-<versão>.zip`, ignorado pelo git).
6. Chaves de storage (`bd:*`) e classes CSS estruturais (`bd-*`) NÃO mudam — renomeá-las quebraria
   dados existentes e seletores; a marca é externa ao runtime.

## Restrições

- Nenhuma mudança funcional além de strings de marca.
- Textos de loja fornecidos pelo usuário são usados como entregues (incluindo os emojis do material
  de marketing dele); artefatos de minha autoria (README, política, justificativas) seguem a regra
  de zero emojis.
- Telas de onboarding sugeridas pelo Gemini ficam como backlog futuro — fora deste escopo.
- Screenshots reais são capturados pelo usuário (sem acesso ao browser dele).
- Sem commit/push sem pedido explícito.

## Critérios de Sucesso

- [x] `npm run typecheck`, `npm test` (54) e `npm run build` verdes após o rebrand.
- [x] `dist/manifest.json` com name/short_name/description (127 chars)/ícones 16-128 e versão 3.5.0.
- [x] PNGs do ícone gerados nos 4 tamanhos a partir de `icons/icon.svg` (sharp temporário, removido).
- [x] README, LICENSE (MIT), PRIVACY (pt/en) e `store/` criados; `revivetab-ai-3.5.0.zip` gerado.
- [x] Nenhuma ocorrência da marca antiga em `src/`, `manifest.json`, `package.json`, `index.html` e
      `tailwind.config.js` (tema daisyUI renomeado para `revivetab`).
