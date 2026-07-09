# Listagem no Chrome Web Store — ReviveTab AI

Textos prontos para colar no Developer Dashboard.

A extensão é localizada via `chrome.i18n` (en, es, pt_BR): nome e resumo curto vêm do manifest e a
loja os exibe automaticamente no idioma do usuário. A **descrição longa** é cadastrada por idioma no
dashboard (seletor de idioma no topo do formulário da listagem) — cadastrar pelo menos en e pt-BR; a
versão abaixo é a pt-BR.

## Título (campo name do manifest — já aplicado)

```
ReviveTab AI: Bookmarks & Speed Dial
```

## Resumo curto (campo description do manifest, limite 132 — já aplicado, 127 chars)

```
Transforme favoritos esquecidos em um Speed Dial inteligente com IA. Organize, use o shuffle e revisite links a cada nova guia.
```

Observação: a versão original do resumo (136 chars) excedia o limite de 132; o ajuste removeu
"seus"/"faça" sem perda de sentido.

## Categoria sugerida

Workflow & Planning (alternativa: Tools). Idioma: Português (Brasil).

## Descrição longa (colar no campo "Description" da listagem)

🔥 Diga adeus ao "Cemitério de Links"! O ReviveTab AI substitui a sua página de Nova Guia (New Tab) por um Speed Dial dinâmico e inteligente, projetado para trazer seus favoritos de volta à vida.

Você também acumula centenas de favoritos que caem no esquecimento e nunca mais são abertos? O ReviveTab AI resolve essa dor organizando seus links automaticamente e exibindo-os de forma inteligente sempre que você abre uma nova aba. Rebele-se contra a desorganização digital e redescubra conteúdos incríveis que você já salvou!

🚀 RECURSOS QUE VOCÊ VAI AMAR:

• Organização Inteligente com IA: Conecte sua API (DeepSeek e outros modelos) e recategorize centenas de favoritos acumulados em pastas lógicas com apenas um clique.
• Speed Dial com Carrosséis Infinitos: Uma nova guia visual, fluida e totalmente customizável para você navegar pelos seus links sem esforço.
• Modo Shuffle (Aleatório): Deixe a extensão surpreender você exibindo favoritos esquecidos de forma aleatória nas suas seções. A melhor forma de revisitar o passado!
• Player de YouTube em Modal: Assista aos seus tutoriais e vídeos favoritados diretamente na nova guia, sem precisar abrir uma nova janela.
• Produtividade Avançada: Interface limpa com suporte a Drag-and-Drop (arrastar e soltar) para reordenar seções, busca instantânea e backup fácil do seu layout.

💡 POR QUE USAR O REVIVETAB AI?
Diferente dos gerenciadores de favoritos tradicionais que servem apenas como um arquivo estático, o ReviveTab AI coloca seus links em movimento. Ele garante que você mantenha contato diário com as suas ferramentas, repositórios de código, cursos e inspirações salvos ao longo dos anos.

Construído sob o moderno padrão Manifest V3 da arquitetura Chromium, garantindo máxima performance, leveza e segurança para o seu navegador.

Transforme sua rotina de navegação. Instale o ReviveTab AI agora e dê vida nova aos seus favoritos!

## Palavras-chave para trabalhar organicamente (sem campo próprio na loja)

O algoritmo lê título, resumo e primeiro parágrafo da descrição. Reforçar estes termos em
atualizações de texto, README do repo e site:

- Volume alto: bookmark manager, speed dial chrome, organizador de favoritos, new tab page
  extension, ai productivity tool
- Termos de dor: como organizar favoritos, clean new tab, visual bookmarks, save links for later,
  custom browser dashboard
- Nicho/técnicos: manifest v3 extension, deepseek integration, chromium tab manager, infinite
  carousel bookmarks

## Campos da aba Privacy do dashboard

- Single purpose: "Substituir a página de nova guia por um speed dial de favoritos com organização
  opcional por IA."
- Privacy policy URL: apontar para o PRIVACY.md público do repositório (GitHub Pages ou blob) —
  preencher após criar o repo.
- Justificativas por permissão: ver `store/justificativas-permissoes.md`.
- Formulário de dados: declarar que títulos/URLs de favoritos são enviados ao provider de IA
  escolhido pelo usuário, somente sob ação do usuário; API key armazenada localmente; nenhum dado
  vai ao desenvolvedor; sem venda de dados; sem uso para fins alheios ao single purpose.
