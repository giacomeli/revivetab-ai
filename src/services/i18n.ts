// services/i18n.ts — wrapper fino sobre chrome.i18n.
//
// t() delega a chrome.i18n.getMessage; quando a API não existe (Vitest/Node),
// retorna a própria chave — mantém services e testes livres de mock. Os
// catálogos vivem em _locales/{en,es,pt_BR}/messages.json (paridade de chaves
// obrigatória entre os três; default_locale: en no manifest).

export function t(key: string, substitutions?: string | string[]): string {
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }
  return key;
}

export function uiLanguage(): string {
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    return chrome.i18n.getUILanguage();
  }
  return 'en';
}
