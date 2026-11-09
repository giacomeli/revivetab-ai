# Política de Privacidade — ReviveTab AI / Privacy Policy — ReviveTab AI

Vigência / Effective date: 09-11-2026
Contato / Contact: giacomeli.dev@gmail.com

Português abaixo; English version at the end.

## Política de Privacidade (pt-BR)

O ReviveTab AI é uma extensão de navegador que substitui a página de nova guia por um speed dial
dos seus favoritos, com organização opcional por IA. Esta política descreve exatamente quais dados
a extensão acessa e o que acontece com eles.

### O que a extensão acessa

- **Favoritos (`bookmarks`)**: a extensão lê seus favoritos para exibi-los na nova guia. As únicas
  escritas são renomear o título e excluir um favorito, sempre por ação explícita sua. A estrutura
  de pastas do seu browser nunca é alterada.
- **Armazenamento local (`storage`)**: seções, categorização, configurações e sua API key de IA são
  gravadas em `chrome.storage.local`, no seu dispositivo. Nada disso é sincronizado ou enviado ao
  desenvolvedor.
- **Favicons (`favicon`)**: usados apenas para renderizar as miniaturas dos cards.

### Organização por IA (opcional e acionada por você)

Quando — e somente quando — você aciona "Organizar com IA", os títulos, URLs e nomes de pastas dos
favoritos no escopo escolhido são enviados ao provider de IA que **você** configurou (DeepSeek ou
OpenRouter), usando a **sua** API key. Esses dados são processados pelo provider sob a política de
privacidade dele ([DeepSeek](https://www.deepseek.com/), [OpenRouter](https://openrouter.ai/)). A
extensão não envia nenhum dado a servidores do desenvolvedor — não existem servidores do
desenvolvedor. Sua API key nunca sai do armazenamento local, exceto no header de autenticação das
chamadas ao próprio provider.

### Player de YouTube

Ao clicar em um favorito de vídeo, o player embutido do YouTube é carregado na nova guia; valem as
políticas do YouTube/Google. Uma regra local de rede (declarativeNetRequest) define o header
`Referer` apenas nessas requisições de embed, exigência técnica do player — nenhum outro tráfego é
observado ou modificado.

### Leitor RSS

Ao adicionar uma fonte, você pode autorizar a extensão a acessar o domínio indicado. A nova guia
consulta as fontes cadastradas diretamente, sem cookies. Cada servidor pode receber seu endereço IP
como parte da conexão. As URLs das fontes e os últimos artigos obtidos ficam no armazenamento local
do navegador. Remover uma fonte apaga seu cache e encerra futuras consultas a ela. Você pode revogar
o acesso ao site nas configurações da extensão no navegador.

### O que a extensão NÃO faz

- Não coleta analytics nem telemetria.
- Não usa cookies ou rastreadores.
- Não vende seus dados. As conexões a serviços de terceiros estão descritas nas seções acima.
- Não acessa seu histórico de navegação.

### Remoção de dados

Desinstalar a extensão remove todos os dados gravados por ela (`chrome.storage.local`). Você também
pode exportar um backup a qualquer momento pelo modal "Gerenciar seções".

### Alterações

Mudanças nesta política serão publicadas neste arquivo com nova data de vigência.

## Privacy Policy (English)

ReviveTab AI is a browser extension that replaces the new tab page with a speed dial of your
bookmarks, with optional AI-powered organization.

- **Bookmarks**: read to render the dial. The only writes are renaming and deleting a bookmark,
  always triggered by you. Your browser's folder structure is never modified.
- **Local storage**: sections, categorization, settings, and your AI API key are stored in
  `chrome.storage.local` on your device only. Nothing is sent to the developer — there are no
  developer servers.
- **AI organization (opt-in, user-triggered)**: when you run "Organize with AI", bookmark titles,
  URLs, and folder names in the selected scope are sent to the AI provider **you** configured
  (DeepSeek or OpenRouter) using **your** API key, under that provider's privacy policy. Your API
  key never leaves local storage except as the authentication header of calls to that provider.
- **YouTube player**: clicking a video bookmark loads YouTube's embedded player (YouTube/Google
  policies apply). A local declarativeNetRequest rule sets the `Referer` header only on those embed
  requests, a technical requirement of the player.
- **RSS reader**: when you add a source, you can grant access to its domain. The new tab fetches
  saved sources directly without cookies. Each source server may receive your IP address as part of
  the connection. Source URLs and recently fetched articles are stored locally. Removing a source
  clears its cache and stops future requests to it. You can revoke site access in your browser's
  extension settings.
- **No analytics, no trackers, no data sales, no browsing-history access.**
- **Data removal**: uninstalling the extension deletes all data it stored.

Questions: giacomeli.dev@gmail.com
