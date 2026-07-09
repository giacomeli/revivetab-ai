// main.ts — entry point carregado pelo index.html
import './assets/styles.css';
import { t, uiLanguage } from './services/i18n';
import { init, wireEvents, setupBraveFooterHiding } from './ui/dial';

// Aplica as traduções dos elementos estáticos do index.html (marcados com
// atributos data-i18n-*) e o idioma real do documento.
function applyStaticI18n(): void {
  document.documentElement.lang = uiLanguage();
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel!));
  });
}

applyStaticI18n();
setupBraveFooterHiding();
wireEvents();
init();
