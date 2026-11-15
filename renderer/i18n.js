// Renderer-side i18n. Elements opt in with data-i18n (textContent), data-i18n-html (innerHTML),
// data-i18n-title (title + aria-label) and data-i18n-ph (placeholder).
const I18N = {
  lang: 'en',
  t(key, params) {
    const L = STRINGS[this.lang] || STRINGS.en;
    const s = L[key] ?? L['html_' + key] ?? STRINGS.en[key] ?? STRINGS.en['html_' + key] ?? key;
    return params ? s.replace(/\{(\w+)\}/g, (_m, k) => (params[k] !== undefined ? params[k] : `{${k}}`)) : s;
  },
  setLang(lang) {
    this.lang = STRINGS[lang] ? lang : 'en';
    document.documentElement.lang = this.lang;
    this.apply();
  },
  apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const p = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : undefined;
      el.textContent = this.t(el.dataset.i18n, p);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = this.t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const v = this.t(el.dataset.i18nTitle);
      el.title = v; el.setAttribute('aria-label', v);
    });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = this.t(el.dataset.i18nPh); });
  },
};
const t = (k, p) => I18N.t(k, p);
