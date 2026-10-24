import { icon } from './icons.js';

// Failed local lookups stay failed for this page, including after list rerenders.
const failedURLs = new Set();

export function faviconURL(url, size = 32) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.id || typeof runtime.getURL !== 'function') return null;
  try {
    new URL(url);
    const endpoint = new URL(runtime.getURL('/_favicon/'));
    if (endpoint.protocol !== 'chrome-extension:' || endpoint.hostname !== runtime.id) return null;
    endpoint.search = new URLSearchParams({ pageUrl: url, size: String(size) }).toString();
    return endpoint.href;
  } catch {
    return null;
  }
}

export function faviconElement(url, { size = 18, className = '' } = {}) {
  const wrapper = document.createElement('span');
  wrapper.className = `bookmark-favicon${className ? ` ${className}` : ''}`;
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;
  wrapper.style.flex = `0 0 ${size}px`;
  const fallback = icon('globe');
  wrapper.append(fallback);
  wrapper.dataset.state = 'unavailable';
  if (failedURLs.has(url)) return wrapper;
  const source = faviconURL(url, Math.ceil(size * 2));
  if (!source) return wrapper;

  const image = document.createElement('img');
  image.width = size;
  image.height = size;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  const fail = () => {
    failedURLs.add(url);
    image.onload = image.onerror = null;
    image.remove();
    wrapper.dataset.state = 'unavailable';
  };
  image.onload = () => {
    if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
    image.onload = image.onerror = null;
    fallback.hidden = true;
    wrapper.dataset.state = 'loaded';
  };
  image.onerror = fail;
  wrapper.dataset.state = 'loading';
  wrapper.append(image);
  image.src = source;
  return wrapper;
}

export class FaviconCache {
  constructor(onChange) {
    this.onChange = onChange;
    this.entries = new Map();
    this.disposed = false;
  }

  get(url) {
    if (this.disposed) return null;
    const cached = this.entries.get(url);
    if (cached) return cached.state === 'loaded' ? cached.image : null;
    const entry = { state: 'unavailable', image: null };
    this.entries.set(url, entry);
    if (failedURLs.has(url)) return null;
    const source = faviconURL(url, 64);
    if (!source) return null;

    const image = new Image(64, 64);
    image.decoding = 'async';
    entry.image = image;
    entry.state = 'loading';
    const settle = loaded => {
      if (this.disposed || this.entries.get(url) !== entry) return;
      image.onload = image.onerror = null;
      entry.state = loaded ? 'loaded' : 'unavailable';
      if (!loaded) {
        failedURLs.add(url);
        entry.image = null;
      }
      this.onChange?.();
    };
    image.onload = () => settle(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => settle(false);
    image.src = source;
    return null;
  }

  retain(urls) {
    const retained = new Set(urls);
    for (const [url, entry] of this.entries) {
      if (retained.has(url)) continue;
      this.release(entry);
      this.entries.delete(url);
    }
  }

  release(entry) {
    if (!entry.image) return;
    entry.image.onload = entry.image.onerror = null;
    entry.image.removeAttribute('src');
    entry.image = null;
  }

  dispose() {
    this.disposed = true;
    this.onChange = null;
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
  }
}
