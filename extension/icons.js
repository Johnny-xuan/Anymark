export const BRAND_MARK_PATH = 'M6 3h8l4 4v14l-6-4-6 4V3ZM14 3v5h4';
export const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${BRAND_MARK_PATH}" fill="#0284c7" fill-opacity=".14"/></svg>`;

const namespace = 'http://www.w3.org/2000/svg';
const paths = {
  mark: BRAND_MARK_PATH,
  bookmark: 'M6 4h12v17l-6-4-6 4z',
  inbox: 'm4 4-2 11v5h20v-5L20 4zM2 15h6l2 3h4l2-3h6',
  folder: 'M3 6h7l2 3h9v11H3z',
  globe: 'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0M3 12h18M12 3c4 5 4 13 0 18M12 3c-4 5-4 13 0 18',
  'folder-plus': 'M3 6h7l2 3h9v11H3zM12 12v6M9 15h6',
  workspace: 'M3 4h18v16H3zM9 4v16',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  plus: 'M12 5v14M5 12h14',
  search: 'm21 21-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0a6.5 6.5 0 0 1 13 0',
  arrow: 'm10 6 6 6-6 6',
  back: 'm12 5-7 7 7 7M5 12h15',
  close: 'm6 6 12 12M6 18 18 6',
  refresh: 'M20 9a8 8 0 1 0 0 7M20 3v6h-6',
  external: 'M14 3h7v7M21 3 11 13M10 5H4v15h15v-6',
  note: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  check: 'm5 12 4 4L19 6',
  loading: 'M20 12a8 8 0 1 1-5.53-7.61',
  network: 'M10 3h4v4h-4zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 17v-5h12v5',
  'zoom-in': 'M17 10a7 7 0 1 1-14 0a7 7 0 0 1 14 0M15 15l6 6M10 7v6M7 10h6',
  'zoom-out': 'M17 10a7 7 0 1 1-14 0a7 7 0 0 1 14 0M15 15l6 6M7 10h6',
  focus: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M9 12h6M12 9v6',
  upload: 'M12 16V3M7 8l5-5 5 5M4 15v6h16v-6',
  download: 'M12 3v13M7 11l5 5 5-5M4 17v4h16v-4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  copy: 'M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3M5 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  maximize: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  minimize: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  terminal: 'M3 4h18v16H3zM7.5 9.5 10.5 12l-3 2.5M12.5 14.5h4',
  settings: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M10 16v4',
};

export function icon(name, className = 'icon') {
  if (!Object.hasOwn(paths, name)) throw new TypeError(`Unknown icon: ${name}`);
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '19');
  svg.setAttribute('height', '19');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.65');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', paths[name]);
  if (name === 'mark') { path.setAttribute('fill', 'currentColor'); path.setAttribute('fill-opacity', '.14'); }
  svg.append(path);
  return svg;
}

export function hydrateIcons(root = document) {
  for (const placeholder of root.querySelectorAll('[data-icon]')) {
    placeholder.replaceWith(icon(placeholder.dataset.icon, placeholder.getAttribute('class') || 'icon'));
  }
}

const THEME_KEY = 'anymark.theme';
const themeListeners = new Set();

export function getThemeMode() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : 'system';
  } catch { return 'system'; }
}

export function setThemeMode(mode) {
  try {
    if (mode === 'dark' || mode === 'light') localStorage.setItem(THEME_KEY, mode);
    else localStorage.removeItem(THEME_KEY);
  } catch {}
  for (const fn of themeListeners) fn();
}

export function onThemeChange(fn) {
  themeListeners.add(fn);
  return () => themeListeners.delete(fn);
}

export function initTheme(toggleButton) {
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const currentEffective = () => {
    const mode = getThemeMode();
    return mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode;
  };
  const apply = () => {
    const active = currentEffective();
    document.documentElement.dataset.theme = active;
    if (toggleButton) {
      const nextLabel = active === 'dark' ? '切换到浅色模式' : '切换到深色模式';
      toggleButton.replaceChildren(icon(active === 'dark' ? 'sun' : 'moon'));
      toggleButton.setAttribute('aria-label', nextLabel);
      toggleButton.title = nextLabel;
    }
  };
  apply();
  themeListeners.add(apply);
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const next = currentEffective() === 'dark' ? 'light' : 'dark';
      setThemeMode(next);
    });
  }
  systemDark.addEventListener('change', () => { if (getThemeMode() === 'system') apply(); });
  window.addEventListener('storage', event => { if (event.key === THEME_KEY) { for (const fn of themeListeners) fn(); } });
}
