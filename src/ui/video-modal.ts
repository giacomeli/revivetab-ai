// ui/video-modal.ts — player de YouTube embutido em modal, na própria new tab.

import { showModal } from './modal';
import { iconSVG } from '../assets/icons';
import { t } from '../services/i18n';

function esc(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

// YouTube exige o header Referer para inicializar o player embutido (Error
// 153 sem ele), e o Chrome nao envia Referer a partir de paginas
// chrome-extension://. Regra DNR de sessao injeta o header somente em
// sub_frames de embed iniciados por esta extensao (initiatorDomains =
// chrome.runtime.id). referrerpolicy no iframe nao resolve nesse contexto.
// O VALOR do Referer precisa ser o id da extensao (identificacao do client,
// receita confirmada no forum chromium-extensions): valores como
// https://www.youtube.com/ produzem Error 152 "video unavailable".
const YT_REFERER_RULE_ID = 1001;
let _refererRulePromise: Promise<void> | null = null;

function ensureYtRefererRule(): Promise<void> {
  if (_refererRulePromise) return _refererRulePromise;
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    return Promise.resolve();
  }
  const rule = {
    id: YT_REFERER_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Referer', operation: 'set', value: chrome.runtime.id }],
    },
    condition: {
      requestDomains: ['www.youtube.com', 'www.youtube-nocookie.com'],
      resourceTypes: ['sub_frame'],
      initiatorDomains: [chrome.runtime.id],
    },
  } as unknown as chrome.declarativeNetRequest.Rule;
  _refererRulePromise = chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [YT_REFERER_RULE_ID],
    addRules: [rule],
  }).catch((err: unknown) => {
    console.warn('[BD] regra DNR de Referer falhou:', err instanceof Error ? err.message : err);
    _refererRulePromise = null;
  });
  return _refererRulePromise;
}

// Abre o vídeo em um iframe de embed. Fechar o modal
// (Escape/backdrop, via modal.ts) remove o iframe do DOM e para a reprodução.
// O link "Abrir no YouTube" cobre vídeos com embed desabilitado pelo dono e
// quem preferir a página completa.
export async function openVideoModal(videoId: string, originalUrl: string, title: string): Promise<void> {
  // A regra precisa existir ANTES de o iframe carregar.
  await ensureYtRefererRule();
  const embedUrl = 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1';
  showModal(`
    <div class="aspect-video w-full bg-black">
      <iframe class="block w-full h-full" src="${esc(embedUrl)}"
              title="${esc(title || 'YouTube')}"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>
    </div>
    <div class="flex items-center justify-between gap-3 px-4 py-3 bg-base-200">
      <span class="text-sm font-medium truncate">${esc(title || '')}</span>
      <a class="btn btn-sm btn-ghost gap-1.5 shrink-0" href="${esc(originalUrl)}">
        ${iconSVG('external-link', 14)}<span>${esc(t('openOnYouTube'))}</span>
      </a>
    </div>
  `, { boxClass: 'modal-box max-w-5xl w-11/12 p-0 overflow-hidden bg-black' });
}
