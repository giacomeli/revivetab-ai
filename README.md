<p align="center">
  <img src="icons/icon128.png" alt="ReviveTab AI" width="96" height="96"/>
</p>

<h1 align="center">ReviveTab AI</h1>

<p align="center"><strong>Não deixe seus favoritos morrerem na desorganização.</strong></p>

<p align="center">Título de loja: <em>ReviveTab AI: Bookmarks & Speed Dial</em></p>

---

Você também acumula centenas de favoritos que caem no esquecimento e nunca mais são abertos? O
ReviveTab AI substitui a página de Nova Guia por um Speed Dial dinâmico e inteligente: a IA organiza
seus links automaticamente em seções, e cada nova aba vira um ponto de contato com o que você salvou
ao longo dos anos. Diga adeus ao "cemitério de links".

## Recursos

- **Organização inteligente com IA** — conecte sua API key (DeepSeek ou OpenRouter, com seleção de
  modelo) e recategorize centenas de favoritos em seções lógicas, com prévia antes de aplicar e
  botão de desfazer.
- **Speed Dial com carrosséis infinitos** — nova guia visual, fluida e customizável.
- **Modo Shuffle** — favoritos esquecidos aparecem aleatoriamente nas seções; a melhor forma de
  revisitar o que você salvou.
- **Player de YouTube em modal** — vídeos favoritados tocam na própria nova guia.
- **Produtividade** — drag-and-drop entre seções, seções customizáveis (nome, ícone, cor, ordem),
  busca instantânea e backup/export do layout.
- **Seguro por padrão** — a estrutura de pastas do browser nunca é alterada; as únicas escritas em
  `chrome.bookmarks` são renomear e excluir, sempre por ação explícita sua.

## Instalação

**Chrome Web Store:** em breve.

**Modo desenvolvedor (qualquer browser Chromium):**

1. `npm install && npm run build`
2. Abra `chrome://extensions` (ou `brave://extensions`), ligue o Developer Mode
3. "Load unpacked" apontando para a pasta `dist/`
4. Abra uma nova guia

## Desenvolvimento

Stack: TypeScript estrito, Vite + @crxjs/vite-plugin, TailwindCSS + daisyUI, Vitest. Arquitetura em
camadas (`ui/` -> `services/` -> `data/`), documentada em `CLAUDE.md`; histórico de decisões em
`specs/plans/`.

```bash
npm run dev              # dev server com HMR (escreve em dist/)
npm run build            # build de produção
npm run typecheck        # tsc --noEmit (strict)
npm test                 # suite Vitest
```

## Privacidade

Seus dados ficam no seu browser. A API key de IA é armazenada localmente e os títulos/URLs de
favoritos só são enviados ao provider que você configurou quando você aciona a organização por IA.
Sem analytics, sem servidores próprios. Política completa em [PRIVACY.md](PRIVACY.md).

## Licença

[MIT](LICENSE)
