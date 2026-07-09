# Plano: Marca ReviveTab AI e kit de publicação

- **Data:** 08-07-2026
- **Branch:** `main`
- **Status:** Executado

## Contexto

Aplica a spec desta pasta. Etapas: (1) rebrand de strings no código e docs; (2) ícone SVG + PNGs
via sharp (instalado temporariamente e removido); (3) README/LICENSE/PRIVACY; (4) pasta `store/`
com listagem, justificativas e plano de screenshots; (5) verificação (typecheck, testes, build,
grep de marca antiga) e zip de publicação.

## Verificação Final

1. `npm run typecheck` + `npm test` + `npm run build` verdes.
2. `node -e` confirmando name/short_name/description/icons/versão no `dist/manifest.json`.
3. `grep -ri "bookmark dial" src manifest.json package.json` vazio.
4. Zip gerado com manifest na raiz.
