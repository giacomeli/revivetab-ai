// theme-init.js — aplica o tema ANTES do primeiro paint (anti-FOUC).
// Script clássico no <head>: o CSP do MV3 bloqueia script inline.
// Duplica a resolução mínima de src/services/theme.ts — mudou lá, mudou aqui.
(function () {
  var pref = null;
  try { pref = localStorage.getItem('bd:theme'); } catch (e) { /* sem storage */ }
  var valid = ['light', 'dark', 'revivetab'];
  var theme;
  if (pref && valid.indexOf(pref) !== -1) {
    theme = pref;
  } else {
    theme = (window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
