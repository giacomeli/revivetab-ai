# Justificativas de permissões — ReviveTab AI

Textos para os campos de justificativa da aba Privacy do Developer Dashboard (um por permissão).
Versão em inglês logo abaixo de cada uma (o time de revisão trabalha em inglês; recomendo enviar em
inglês).

## bookmarks

pt: Ler os favoritos do usuário para exibi-los como speed dial na nova guia. As únicas escritas são
renomear título e excluir favorito, sempre por ação explícita do usuário; a estrutura de pastas
nunca é alterada.

en: Reads the user's bookmarks to render them as a speed dial on the new tab page. The only writes
are renaming a title and deleting a bookmark, both explicitly triggered by the user; the folder
structure is never modified.

## storage

pt: Persistir localmente as seções, a categorização dos favoritos, as configurações e a API key de
IA informada pelo usuário (`chrome.storage.local`). Nenhum dado é enviado ao desenvolvedor.

en: Locally persists sections, bookmark categorization, settings, and the user-provided AI API key
(`chrome.storage.local`). No data is sent to the developer.

## favicon

pt: Renderizar as miniaturas (favicons) dos sites nos cards do speed dial.

en: Renders site favicons as thumbnails on the speed dial cards.

## declarativeNetRequestWithHostAccess

pt: O player embutido do YouTube exige o header HTTP Referer, que o Chrome não envia a partir de
páginas de extensão (erro 153 do player). Uma única regra de sessão define o Referer somente em
requisições sub_frame de embed do YouTube iniciadas pela própria extensão. Nenhum outro tráfego é
observado ou modificado.

en: YouTube's embedded player requires the HTTP Referer header, which Chrome does not send from
extension pages (player error 153). A single session rule sets the Referer only on YouTube embed
sub_frame requests initiated by this extension. No other traffic is observed or modified.

## Host permission: https://www.youtube.com/* e https://www.youtube-nocookie.com/*

pt: Necessária para a regra de Referer acima e para o iframe do player embutido, que toca vídeos
favoritados dentro da própria nova guia.

en: Required by the Referer rule above and by the embedded player iframe that plays bookmarked
videos inside the new tab page.

## Host permission: https://api.deepseek.com/* e https://openrouter.ai/*

pt: Chamadas de API do recurso opcional de organização por IA, feitas apenas quando o usuário aciona
"Organizar com IA", usando a API key do próprio usuário. Enviam títulos/URLs/pastas dos favoritos no
escopo escolhido para classificação; nada é enviado a servidores do desenvolvedor.

en: API calls for the optional AI organization feature, made only when the user triggers "Organize
with AI", using the user's own API key. Bookmark titles/URLs/folders in the chosen scope are sent
for classification; nothing is sent to developer servers.

## Uso de código remoto

pt/en: Nenhum. Todo o código é empacotado na extensão (Manifest V3). O iframe do YouTube e as
chamadas REST às APIs de IA transferem dados, não código executável da extensão.

None. All code ships in the package (Manifest V3). The YouTube iframe and REST calls to AI APIs
transfer data, not extension code.
