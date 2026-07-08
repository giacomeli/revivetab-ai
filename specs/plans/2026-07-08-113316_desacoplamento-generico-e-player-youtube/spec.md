# Spec: Desacoplamento genérico do seed e player de YouTube em modal

- **Data:** 08-07-2026
- **Branch:** `main` (decisão do usuário em 08-07-2026)
- **Status:** Executado

## Contexto

A extensão está acoplada aos dados pessoais do autor em dois pontos:

1. **`SEED_RULES` (src/sections.js)** referencia nomes de pastas pessoais (`DevOps`, `🟠 Ecomm`,
   `🟢 Maestro`, `Senior`, `Unig`, `GB`...) e URLs de nicho (`casadagaitaponto`, `animesonline`,
   `topflix`). O backup em `util/bookmark-dial-backup-2026-07-08T14-20-50.json` mostra que essas regras
   já estão obsoletas até para o próprio autor (as pastas de topo atuais são emojis: `📚`, `💼`, `🧰`...).
2. **`walk()` (src/dial.js)** percorre a árvore a partir da raiz e inclui os títulos dos containers
   especiais do browser (`Bookmarks Bar`, `Other Bookmarks`) no `folderList` de cada favorito. Esses
   títulos são localizados (variam por idioma e por browser Chromium — Chrome, Brave, Edge), poluem o
   breadcrumb dos cards e participam indevidamente do matching de pastas do seed.

Além disso, clicar em um card de YouTube navega para o youtube.com, saindo do dial. O desejo é assistir
o vídeo em um modal na própria new tab.

Decisões do usuário (registradas em 08-07-2026):

- `DEFAULT_SECTIONS` permanece como está — o mesmo conjunto fixo de seções. A categorização
  inteligente por LLM é uma etapa futura, fora do escopo desta spec.
- Favoritos sem match de pasta caem em regras genéricas de URL; sem match algum, Inbox.
- Migração por **re-seed automático**: bump de versão em `bd:meta` força re-semeadura no primeiro load
  após a atualização (a organização manual atual é descartada; backups existem em `bd:initial-backup` e
  em `util/`).

## Requisitos

1. **Leitura genérica da árvore de favoritos.** A leitura deve capturar favoritos e pastas tanto da
   barra de favoritos quanto dos favoritos gerais (e demais raízes especiais, ex.: mobile), de forma
   agnóstica de browser e idioma:
   - Os títulos dos containers-raiz especiais NÃO entram em `folderList` (nem no breadcrumb, nem no
     matching do seed). Detecção posicional (filhos do nó raiz `id 0`), nunca por título.
   - Um favorito direto na barra ou nos favoritos gerais fica com `folderList` vazio — é um favorito
     "solto", elegível apenas às regras de URL.
2. **`SEED_RULES` genérico.** Substituir todo o conteúdo pessoal por regras universais que sirvam a
   qualquer usuário, mantendo a estrutura `{ folders, urls }` e a prioridade pasta > URL:
   - `folders`: apenas palavras-chave genéricas de nome de pasta, em pt e en (ex.: `estudo/study`,
     `videos/filmes/movies`, `music/musica`, `tools/ferramentas`, `work/trabalho`, `code/dev/git`,
     `ai/ia/llm`). Zero nomes de pastas pessoais.
   - `urls`: apenas domínios/padrões universais (ex.: `youtube.com/watch` para watch; `github`,
     `gitlab`, `bitbucket` para code; `spotify`, `soundcloud`, `deezer` para music; `chatgpt`,
     `claude.ai`, `gemini`, `huggingface` para ai).
3. **Matching de pasta por token, não por substring.** O matching atual (`indexOf` case-insensitive)
   torna keywords curtas perigosas com regras genéricas (`ai` daria match em `Email`, `Main`). O match
   por pasta passa a comparar tokens/palavras inteiras, insensível a caixa e acento. As regras de URL
   continuam regex sobre a URL completa.
4. **Re-seed automático na atualização.** `bd:meta.version` sobe de 1 para 2. No load, se
   `meta.seeded === true` e `meta.version < 2`, rodar re-seed com as novas regras e gravar
   `{ version: 2, seeded: true }`. `bd:initial-backup` NÃO é sobrescrito se já existir (continua sendo
   o snapshot da primeira instalação).
5. **Player de YouTube em modal.** Clicar em um card cujo URL tem vídeo do YouTube identificável
   (mesma detecção `ytId()` já usada para thumbnails) abre um modal na própria new tab com o vídeo
   embutido via iframe (`https://www.youtube-nocookie.com/embed/{id}?autoplay=1`), em vez de navegar:
   - Fechamento por Escape e clique no backdrop (comportamento padrão de `modal.js`).
   - Link/botão "Abrir no YouTube" dentro do modal, como saída para vídeos com embed desabilitado
     pelo dono e para quem quiser a página completa.
   - Cards não-YouTube mantêm o comportamento atual (navegação direta).
   - Fechar o modal interrompe a reprodução (remoção do iframe do DOM).
6. **Testes atualizados.** `test/sections.test.js` cobre as novas regras genéricas e o matching por
   token (os casos atuais referenciam dados pessoais como `🟠 Ecomm` e serão substituídos). A função
   de detecção de vídeo (`ytId`) passa a ser testável (exportada de um módulo puro) com casos
   `watch?v=`, `youtu.be/`, URL não-YouTube.

## Restrições

- **Não** alterar `DEFAULT_SECTIONS` (ids, labels, ícones, cores, ordem) — renomear seções já é
  possível pela UI; classificação por LLM é etapa futura.
- **Não** derivar seções da estrutura de pastas do usuário (decisão explícita do usuário).
- ~~**Não** adicionar permissões novas ao `manifest.json`~~ — **REVISADO em 08-07-2026 durante a
  execução**: o player embutido falhava com Error 153 ("Video player configuration error") porque o
  YouTube passou a exigir o header `Referer`, que o Chrome não envia a partir de páginas
  `chrome-extension://` (o atributo `referrerpolicy` no iframe não resolve nesse contexto). A correção
  estabelecida para extensões exige `declarativeNetRequestWithHostAccess` + `host_permissions` para
  `www.youtube.com`/`www.youtube-nocookie.com`, com regra DNR de sessão que injeta o `Referer` apenas
  em `sub_frame` iniciados pela própria extensão (`initiatorDomains: [chrome.runtime.id]`).
- **Não** tocar na estrutura de pastas do browser — o princípio `chrome.bookmarks` read-only permanece
  (escritas continuam restritas a update de título e remove).
- **Não** commitar nem fazer push sem pedido explícito.
- Manter o cap `MAX_PER_SECTION`, o carousel, o lazy-load e a instrumentação de performance intactos.

## Arquivos Envolvidos

| Arquivo | Ação |
| --- | --- |
| `src/sections.js` | Modificar — `SEED_RULES` genérico; matching de pasta por token |
| `src/dial.js` | Modificar — `walk`/`init` para pular containers-raiz; handler de clique desviando YouTube para o modal; migração de versão no load |
| `src/video-modal.js` | Criar — modal do player YouTube (usa `showModal`/`closeModal` de `modal.js`) |
| `src/yt.js` | Criar — `ytId()` extraído de `dial.js` para módulo puro testável (importado por `dial.js` e `video-modal.js`) |
| `test/sections.test.js` | Modificar — casos das regras genéricas e matching por token |
| `test/yt.test.js` | Criar — casos de `ytId()` |
| `manifest.json` + `package.json` | Modificar — versão 3.1.0 -> 3.2.0 |
| `CLAUDE.md` | Modificar — refletir novo modelo de seed, migração e player |

## Critérios de Sucesso

- [x] `npm test` verde com os novos casos (regras genéricas, matching por token, `ytId`) — 35 testes.
- [x] `grep -riE 'ecomm|maestro|senior|unig|nfe|glofi|casadagaita|animesonline|topflix|devops' src/`
      não retorna nada — zero referências a dados pessoais no código.
- [x] Breadcrumb dos cards não exibe mais `Bookmarks Bar`/`Other Bookmarks` (verificado manualmente
      pelo usuário em 08-07-2026).
- [x] No primeiro load após a atualização, o dial re-semeia automaticamente com as regras novas
      (`bd:meta.version === 2`) e `bd:initial-backup` permanece o original.
- [x] Clique em card de YouTube abre o modal com o vídeo tocando; Escape/backdrop fecham e param o
      áudio; "Abrir no YouTube" navega para o vídeo; cards não-YouTube navegam normalmente
      (confirmado pelo usuário após as duas correções de Referer registradas no plano).
- [x] `npm run build` gera `dist/` sem erros (manifest 3.2.0 no output).
