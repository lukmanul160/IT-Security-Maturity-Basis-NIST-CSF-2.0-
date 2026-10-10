/* Apply the saved theme before first paint; shared by public pages and workspace. */
(function (global) {
  'use strict';
  const key = 'nist-basis-theme';
  const valid = value => value === 'dark' ? 'dark' : 'light';
  let theme = 'light';
  try { theme = valid(global.localStorage.getItem(key)); } catch {}
  function syncButtons() {
    const label = theme === 'dark' ? 'Light mode' : 'Dark mode';
    const title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-label', global.NistI18n?.t(title) || title);
      button.setAttribute('title', global.NistI18n?.t(title) || title);
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      const text = button.querySelector('[data-theme-label]');
      if (text) text.textContent = global.NistI18n?.t(label) || label;
    });
  }
  function apply(value, persist) {
    theme = valid(value);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#101827' : '#f1f5f9';
    if (persist) { try { global.localStorage.setItem(key, theme); } catch {} }
    syncButtons();
    global.dispatchEvent(new CustomEvent('nist:theme-change', { detail: { theme } }));
  }
  apply(theme, false);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-theme-toggle]');
    if (!button || button.disabled) return;
    apply(theme === 'dark' ? 'light' : 'dark', true);
  });
  global.addEventListener('storage', event => { if (event.key === key) apply(event.newValue, false); });
  global.addEventListener('nist:language-change', syncButtons);
  function mount() {
    apply(theme, false);
    // Vue mounts the header after DOMContentLoaded; only inspect newly added controls.
    new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('[data-theme-toggle]') || node.querySelector?.('[data-theme-toggle]'))))) syncButtons();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  global.NistTheme = { set: value => apply(value, true), get theme() { return theme; } };
})(window);
