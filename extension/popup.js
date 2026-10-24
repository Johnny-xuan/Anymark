import { call, getStatus, openWeb, currentPage, setEnabled, reconnect as reconnectBridge } from './ui-api.js';
import { icon, hydrateIcons, initTheme } from './icons.js';
import { faviconElement } from './favicons.js';
import { applyI18n, t, onLangChange } from './i18n.js';

hydrateIcons();
applyI18n();
initTheme(document.querySelector('#theme-toggle'));
onLangChange(() => { applyI18n(); renderCapture(); void refreshConnection(); });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let brandAnimation;
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) brandAnimation?.cancel(); });

const enabled = document.querySelector('#enabled');
const reconnect = document.querySelector('#reconnect');
const error = document.querySelector('#error');
const note = document.querySelector('#note');
const save = document.querySelector('#save-inbox');
const web = document.querySelector('#open-web');
const captureStatus = document.querySelector('#capture-status');
const captureForm = document.querySelector('#capture-form');
const pageState = document.querySelector('#page-state');
const pageStateHeading = document.querySelector('#page-state-heading');
const pageReason = document.querySelector('#page-reason');
let connectionBusy = false;
let actionError = '';
let page = null;
let saved = null;
let loadingPage = true;
let saving = false;
let noteTouched = false;
let uncertainCapture = false;

function renderConnection(state) {
  enabled.checked = state.enabled;
  enabled.disabled = connectionBusy;
  reconnect.hidden = !state.enabled || state.state !== 'disconnected';
  reconnect.disabled = connectionBusy;
  const status = document.querySelector('#status');
  status.dataset.state = state.state;
  status.textContent = t(`popup.state.${state.state}`);
  const profile = document.querySelector('#profile');
  if (profile.value !== state.profileId) profile.value = state.profileId;
  const command = document.querySelector('#command');
  const text = `anymark use ${state.profileId}`;
  if (command.textContent !== text) command.textContent = text;
  document.querySelector('#setup').hidden = state.state === 'connected';
  error.textContent = actionError || state.error || '';
  error.hidden = !error.textContent;
}

async function refreshConnection() {
  if (connectionBusy) return;
  try {
    const state = await getStatus();
    if (!connectionBusy) renderConnection(state);
  } catch (failure) { error.textContent = failure.message; error.hidden = false; }
}

async function connectionAction(action) {
  connectionBusy = true;
  actionError = '';
  enabled.disabled = true;
  reconnect.disabled = true;
  try { renderConnection(await action()); }
  catch (failure) { actionError = failure.message; }
  finally { connectionBusy = false; await refreshConnection(); }
}

function setCaptureStatus(text, state = 'success') {
  captureStatus.textContent = text;
  captureStatus.dataset.state = state;
}

function renderCapture() {
  const supported = page?.supported === true;
  const unchanged = saved?.url === page?.url && saved?.note === note.value;
  captureForm.hidden = !supported;
  pageState.hidden = supported;
  pageState.setAttribute('aria-busy', String(loadingPage && !page));
  pageStateHeading.textContent = loadingPage && !page ? t('popup.loadingHeading') : t('popup.unsupportedHeading');
  pageReason.textContent = loadingPage && !page ? t('popup.loadingReason') : (page?.reasonKey ? t(page.reasonKey) : page?.reason || t('popup.unsupportedReason'));
  note.disabled = !supported || saving;
  save.disabled = loadingPage || !supported || saving || unchanged || uncertainCapture;
  const mode = saving ? 'saving' : uncertainCapture ? 'uncertain' : unchanged ? 'saved' : saved ? 'update' : 'create';
  if (save.dataset.mode !== mode || save.dataset.lang !== document.documentElement.lang) {
    save.dataset.mode = mode;
    save.dataset.lang = document.documentElement.lang;
    const label = saving ? t('popup.saving') : uncertainCapture ? t('popup.uncertain') : unchanged ? t('popup.savedInbox') : saved ? t('popup.updateNote') : t('popup.saveInbox');
    const glyph = saving ? 'loading' : unchanged ? 'check' : saved ? 'note' : 'plus';
    save.replaceChildren(icon(glyph, saving ? 'icon is-spinning' : 'icon'), document.createTextNode(label));
  }
}

async function loadPage() {
  try {
    page = await currentPage();
    document.querySelector('#page-title').textContent = page.title || t('popup.currentWebpage');
    document.querySelector('#page-title').title = page.title;
    document.querySelector('#page-url').value = page.url;
    document.querySelector('#page-url').title = page.url || '';
    if (page.supported) document.querySelector('#page-emblem').replaceChildren(faviconElement(page.url, { size: 24 }));
    renderCapture();
    if (page.supported) {
      const inbox = await call('inbox');
      const existing = inbox.entries.find(entry => entry.type === 'file' && entry.url === page.url);
      if (existing) {
        saved = { url: existing.url, note: existing.note };
        if (!noteTouched) note.value = existing.note;
      }
    }
  } catch (failure) { setCaptureStatus(failure.message, 'error'); }
  finally { loadingPage = false; renderCapture(); }
}

document.querySelector('#capture-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (save.disabled) return;
  saving = true;
  renderCapture();
  try {
    const content = { url: page.url, title: page.title || page.url };
    if (note.value !== '' || saved && saved.note !== note.value) content.note = note.value;
    const result = await call('capture', content);
    saved = { url: result.entry.url, note: result.entry.note };
    note.value = result.entry.note;
    setCaptureStatus(result.created ? t('popup.addedNotice') : t('popup.updatedNotice'));
    brandAnimation?.cancel();
    if (!reducedMotion.matches) brandAnimation = document.querySelector('.brand-mark').animate([
      { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' },
    ], { duration: 220, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  } catch (failure) {
    uncertainCapture = ['EPARTIAL', 'EUNKNOWN', 'ERESULTTOOLARGE', 'ECHANGED'].includes(failure.code);
    setCaptureStatus(uncertainCapture ? `${t('popup.uncertain')} · ${failure.message}` : failure.message, 'error');
  } finally { saving = false; renderCapture(); }
});

note.addEventListener('input', () => { noteTouched = true; renderCapture(); });
note.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !save.disabled) document.querySelector('#capture-form').requestSubmit();
});
enabled.addEventListener('change', () => { void connectionAction(() => setEnabled(enabled.checked)); });
reconnect.addEventListener('click', () => { void connectionAction(reconnectBridge); });
web.addEventListener('click', async () => {
  web.disabled = true;
  try { await openWeb(); }
  catch (failure) { setCaptureStatus(failure.message, 'error'); }
  finally { web.disabled = false; }
});

const copyCommandBtn = document.querySelector('#copy-command');
const copyCommandText = document.querySelector('#copy-command-text');
let copyTimer;
copyCommandBtn?.addEventListener('click', async () => {
  const text = document.querySelector('#command')?.textContent || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (copyCommandText) copyCommandText.textContent = t('popup.copied');
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { if (copyCommandText) copyCommandText.textContent = t('popup.copy'); }, 1800);
  } catch {}
});

await Promise.all([refreshConnection(), loadPage()]);
setInterval(() => { void refreshConnection(); }, 1000);
