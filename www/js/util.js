const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape user text for HTML (names, notes, emoji). */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c]);

const svg = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;

const filled = (inner) => `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  now: filled(
    '<ellipse cx="12" cy="16.6" rx="4.7" ry="3.9"/><circle cx="5.4" cy="11.4" r="2.1"/><circle cx="9.4" cy="6.9" r="2.1"/><circle cx="14.6" cy="6.9" r="2.1"/><circle cx="18.6" cy="11.4" r="2.1"/>'
  ),
  plan: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10.2h17M8 3v4M16 3v4"/>'),
  stats: svg('<path d="M5.5 20V11M12 20V4M18.5 20v-6"/>'),
  log: svg('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r=".6"/><circle cx="4.6" cy="12" r=".6"/><circle cx="4.6" cy="17.5" r=".6"/>'),
  sliders: svg('<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  pause: filled('<rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/>'),
  play: filled('<path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z"/>'),
  stop: filled('<rect x="6" y="6" width="12" height="12" rx="3"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
};

export const icon = (name) => ICONS[name] || '';

export const toast = (() => {
  let timer = null;
  return (html, ms = 5000) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.innerHTML = `<div class="t">${html}</div>`;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), ms);
  };
})();

export const hideToast = () => document.getElementById('toast')?.classList.remove('show');
