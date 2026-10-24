import { call, getStatus } from '../extension/ui-api.js';
import { icon, hydrateIcons, initTheme } from '../extension/icons.js';
import { faviconElement } from '../extension/favicons.js';
import { applyI18n, t, onLangChange } from '../extension/i18n.js';
import { BookmarkTransferPanel } from './transfer-panel.js';
import { AgentHubController } from './agent-hub.js';
import { SettingsPanel, getStartupScope } from './settings-panel.js';

hydrateIcons();
applyI18n();
initTheme(document.getElementById('theme-toggle'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let detailAnimation;
let graph = null;
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) detailAnimation?.cancel(); });

const $ = id => document.getElementById(id);
const state = {
  scope: 'inbox', folder: null, inbox: null, roots: [], ancestors: [], entries: [], visibleEntries: [], selected: null,
  query: '', filter: 'all', truncated: false, loading: false, writing: false, loadVersion: 0, selectVersion: 0,
  create: null, chooser: null, acceptedHash: '#inbox', notice: null, inspectorOpen: false,
  checked: new Set(), lastCheckedId: null, kbId: null, agentStatus: null,
};
const narrow = matchMedia('(max-width: 899px)');
const address = entry => `id:${entry.id}`;
const title = entry => entry?.title || entry?.name || t('list.unnamed');
const note = entry => entry?.note || '';
const isFolder = entry => entry?.type === 'directory';
const scopeHash = scope => ['inbox', 'all', 'graph'].includes(scope) ? `#${scope}` : `#folder/${encodeURIComponent(scope)}`;
const parseHash = () => {
  if (location.hash === '#inbox') return 'inbox';
  if (location.hash === '#all') return 'all';
  if (location.hash === '#graph') return 'graph';
  if (location.hash.startsWith('#folder/')) {
    try { return decodeURIComponent(location.hash.slice(8)) || getStartupScope(); } catch { return getStartupScope(); }
  }
  return getStartupScope();
};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, className, handler, iconName) {
  const node = element('button', className);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  node.append(element('span', '', label));
  if (handler) node.addEventListener('click', handler);
  return node;
}
function safeURL(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
function domain(value) {
  try { return new URL(value).hostname || value; } catch { return value; }
}
function readablePath(rawPath, { parentOnly = false } = {}) {
  if (!rawPath || rawPath === '/') return '/';
  const parts = String(rawPath).split('/').filter(Boolean).map(seg => {
    const raw = seg.replace(/~[^~]+$/, '');
    try { return decodeURIComponent(raw) || '未命名'; } catch { return raw || '未命名'; }
  });
  const list = parentOnly ? parts.slice(0, -1) : parts;
  return list.length ? list.join(' / ') : '根目录';
}
function errorMessage(error) {
  let message = `${error?.code ? `${error.code} · ` : ''}${error?.message || '操作失败，请重试。'}`;
  if (error?.code === 'EPARTIAL') message += ' 部分修改已经发生，不会自动回滚。请刷新检查实际结果后再操作。';
  if (Array.isArray(error?.details?.created)) message += ` 已创建 ${error.details.created.length} 个条目。`;
  if (error?.details?.cause?.message) message += ` 原因：${error.details.cause.message}`;
  return message;
}
function showError(id, error) {
  $(id).textContent = errorMessage(error);
  $(id).hidden = false;
}
let noticeTimer;
function notify(message, kind = 'success') {
  clearTimeout(noticeTimer);
  state.notice = { message, kind };
  $('notice').textContent = message;
  $('notice').dataset.kind = kind;
  $('notice').hidden = false;
  if (kind === 'success') noticeTimer = setTimeout(clearNotice, 3400);
}
function clearNotice() { clearTimeout(noticeTimer); state.notice = null; $('notice').hidden = true; }
function dirty() {
  const entry = state.selected;
  return !!entry && ($('edit-title').value !== (entry.title ?? entry.name ?? '') ||
    (!isFolder(entry) && $('edit-url').value !== (entry.url || '')) || $('edit-note').value !== note(entry));
}
function updateDirty() {
  const changed = dirty();
  $('save-state').textContent = state.writing ? t('inspector.saving') : changed ? t('inspector.unsaved') : t('inspector.saved');
  $('save-state').dataset.dirty = String(changed);
  $('save-detail').disabled = !changed || state.writing;
  const toggle = $('toggle-inspector');
  toggle.dataset.dirty = String(changed);
  const label = state.inspectorOpen ? t('header.inspectorClose') : changed ? t('header.inspectorDirty') : t('header.inspector');
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
}
function renderInspector() {
  $('app-shell').classList.toggle('has-selection', !!state.selected);
  $('app-shell').classList.toggle('inspector-open', state.inspectorOpen);
  $('toggle-inspector').setAttribute('aria-expanded', String(state.inspectorOpen));
  const close = $('close-detail');
  close.replaceChildren(icon(narrow.matches ? 'back' : 'close'));
  if (narrow.matches) close.append(element('span', '', '返回列表'));
  close.setAttribute('aria-label', narrow.matches ? '返回列表，保留未保存修改' : '收起详情面板');
  close.title = narrow.matches ? '返回列表' : '收起详情面板';
  $('inspector').inert = !state.inspectorOpen || (narrow.matches && $('app-shell').classList.contains('nav-open'));
  updateDirty();
}
function setInspectorOpen(open, { focus = false } = {}) {
  state.inspectorOpen = open;
  if (!open) state.selectVersion++;
  renderInspector();
  if (!focus) return;
  if (open) (state.selected ? $('close-detail') : $('inspector-empty')).focus({ preventScroll: true });
  else if (!narrow.matches) $('toggle-inspector').focus({ preventScroll: true });
  else if (state.scope === 'graph') graph?.focusCanvas();
  else {
    const row = state.selected && $('bookmark-list').querySelector(`[data-entry-id="${CSS.escape(state.selected.id)}"] .row-select`);
    (row || $('search')).focus({ preventScroll: true });
  }
}
$('toggle-inspector').addEventListener('click', () => {
  if (!state.inspectorOpen && !state.selected) {
    const fallback = currentKbEntry() || (state.folder && !['inbox', 'all', 'graph'].includes(state.scope) ? state.folder : null);
    if (fallback) { void selectEntry(fallback); return; }
  }
  setInspectorOpen(!state.inspectorOpen, { focus: true });
});
let confirmation = null;
function confirmAction({ heading, description, accept = '确认', danger = false, action }) {
  return new Promise(resolve => {
    confirmation = { resolve, action, busy: false };
    $('confirm-heading').textContent = heading;
    $('confirm-description').textContent = description;
    $('confirm-accept').textContent = accept;
    $('confirm-accept').className = danger ? 'danger-solid' : 'primary';
    $('confirm-error').hidden = true;
    $('confirm-accept').disabled = false;
    $('confirm-cancel').disabled = false;
    $('confirm-dialog').showModal();
    $('confirm-cancel').focus();
  });
}
function cancelConfirmation() {
  if (!confirmation || confirmation.busy) return;
  const { resolve } = confirmation;
  confirmation = null;
  $('confirm-dialog').close();
  resolve(false);
}
$('confirm-cancel').addEventListener('click', cancelConfirmation);
$('confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelConfirmation(); });
$('confirm-accept').addEventListener('click', async () => {
  if (!confirmation || confirmation.busy) return;
  const current = confirmation;
  current.busy = true;
  $('confirm-accept').disabled = true;
  $('confirm-cancel').disabled = true;
  try {
    if (current.action) await current.action();
    confirmation = null;
    $('confirm-dialog').close();
    current.resolve(true);
  } catch (error) {
    showError('confirm-error', error);
    current.busy = false;
    $('confirm-accept').disabled = false;
    $('confirm-cancel').disabled = false;
  }
});
async function canLeave() {
  if (state.writing) return false;
  if (!dirty()) return true;
  return confirmAction({ heading: '放弃未保存的修改？', description: '这些标题、网址或备注修改尚未保存。离开后将丢失。', accept: '放弃修改', danger: true });
}
function setWriting(value) {
  state.writing = value;
  for (const id of ['edit-title', 'edit-url']) $(id).disabled = value || !!state.selected?.readonly;
  $('edit-note').disabled = value;
  for (const id of ['move-entry', 'delete-entry']) $(id).disabled = value || !!state.selected?.readonly;
  $('copy-entry').disabled = value;
  $('browse-folder').disabled = value;
  $('toggle-inspector').disabled = value;
  $('close-detail').disabled = value;
  $('refresh').disabled = value;
  $('add-link').disabled = value || state.loading;
  $('add-folder').disabled = value || state.loading;
  $('open-transfer').disabled = value || state.loading;
  updateDirty();
}
function setNavigation(open) {
  $('app-shell').classList.toggle('nav-open', open);
  $('open-nav').setAttribute('aria-expanded', String(open));
  $('nav-scrim').hidden = !open;
  $('sidebar').inert = narrow.matches && !open;
  $('workspace').inert = narrow.matches && open;
  renderInspector();
  if (open) $('close-nav').focus();
}
$('open-nav').addEventListener('click', () => setNavigation(true));
for (const id of ['close-nav', 'nav-scrim']) $(id).addEventListener('click', () => { setNavigation(false); $('open-nav').focus(); });
narrow.addEventListener('change', () => setNavigation(false));
setNavigation(false);
function updateKbFocus({ scroll = false } = {}) {
  for (const row of $('bookmark-list').querySelectorAll('[data-entry-id]')) {
    const focused = row.dataset.entryId === state.kbId;
    row.classList.toggle('kb-focus', focused);
    if (focused && scroll) row.scrollIntoView({ block: 'nearest' });
  }
}
function moveKbFocus(delta) {
  if (state.scope === 'graph' || !state.visibleEntries.length) return false;
  const idx = state.visibleEntries.findIndex(e => e.id === state.kbId);
  const nextIdx = idx < 0 ? (delta > 0 ? 0 : state.visibleEntries.length - 1) : Math.max(0, Math.min(state.visibleEntries.length - 1, idx + delta));
  state.kbId = state.visibleEntries[nextIdx].id;
  updateKbFocus({ scroll: true });
  return true;
}
function currentKbEntry() {
  return state.visibleEntries.find(e => e.id === state.kbId) || null;
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('app-shell').classList.contains('nav-open')) { setNavigation(false); $('open-nav').focus(); return; }
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape' && state.inspectorOpen && !state.writing) {
    event.preventDefault();
    setInspectorOpen(false, { focus: true });
    return;
  }
  if (event.key === 'Escape' && state.checked.size > 0 && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
    event.preventDefault();
    clearChecked();
    return;
  }
  const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
  const inSearch = event.target === $('search');
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !inInput) {
    event.preventDefault();
    if (narrow.matches && state.inspectorOpen) setInspectorOpen(false);
    $('search').focus();
    return;
  }
  if (state.scope !== 'graph' && !event.ctrlKey && !event.metaKey) {
    if ((event.key === 'ArrowLeft') && !inInput) {
      if (!['inbox', 'all', 'graph'].includes(state.scope)) {
        event.preventDefault();
        navigateUp();
      }
      return;
    }
    if (!event.altKey) {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (!inInput || inSearch)) {
        if (inSearch && searchTimer) runSearch();
        if (moveKbFocus(event.key === 'ArrowDown' ? 1 : -1)) {
          event.preventDefault();
          if (inSearch) $('workspace').focus({ preventScroll: true });
        }
        return;
      }
      if (event.key === 'ArrowRight' && !inInput) {
        const target = currentKbEntry();
        if (!target) {
          if (moveKbFocus(1)) event.preventDefault();
          return;
        }
        event.preventDefault();
        if (isFolder(target)) void navigate(target.id, { highlightFirst: true });
        else if (safeURL(target.url)) window.open(safeURL(target.url), '_blank', 'noopener,noreferrer');
        else void selectEntry(target);
        return;
      }
      const interactiveTag = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(event.target.tagName);
      if (event.key === 'Enter' && !interactiveTag) {
        const target = currentKbEntry();
        if (target) {
          event.preventDefault();
          if (isFolder(target)) void navigate(target.id, { highlightFirst: true });
          else if (safeURL(target.url)) window.open(safeURL(target.url), '_blank', 'noopener,noreferrer');
          else void selectEntry(target);
        }
        return;
      }
      if (event.key === ' ' && !interactiveTag) {
        const target = currentKbEntry();
        if (target) {
          event.preventDefault();
          if (state.selected?.id === target.id && state.inspectorOpen) setInspectorOpen(false);
          else void selectEntry(target);
        }
      }
    }
  }
});
window.addEventListener('beforeunload', event => {
  if (dirty() || createDirty() || state.writing) { event.preventDefault(); event.returnValue = ''; }
});
function navigateUp() {
  if (['inbox', 'all', 'graph'].includes(state.scope)) return;
  const exitedId = state.scope;
  const parent = state.ancestors.length > 1 ? state.ancestors[state.ancestors.length - 2].id : 'all';
  void navigate(parent, { highlightId: exitedId });
}
$('nav-back')?.addEventListener('click', navigateUp);
function syncSearchControls() {
  const hasValue = !!$('search').value;
  if ($('clear-search')) $('clear-search').hidden = !hasValue;
  if ($('search-kbd')) $('search-kbd').hidden = hasValue;
}
function setFilter(nextFilter) {
  state.filter = nextFilter;
  for (const chip of document.querySelectorAll('#type-filter .filter-chip')) {
    const active = chip.dataset.filter === nextFilter;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  }
  if (state.scope === 'graph') graph?.setFilter?.(nextFilter);
  else renderList(state.entries, { truncated: state.truncated });
}
$('type-filter')?.addEventListener('click', event => {
  const chip = event.target.closest('.filter-chip');
  if (chip?.dataset.filter) setFilter(chip.dataset.filter);
});
const agentHub = new AgentHubController({ getState: () => state, readablePath, title, notify });
const syncAgentHub = () => agentHub.sync();

function clearChecked() {
  state.checked.clear();
  state.lastCheckedId = null;
  updateRowSelection();
  updateBatchBar();
}
function toggleCheck(entry, shiftKey = false) {
  const list = state.visibleEntries;
  const targetChecked = !state.checked.has(entry.id);
  if (shiftKey && state.lastCheckedId && state.lastCheckedId !== entry.id) {
    const a = list.findIndex(e => e.id === state.lastCheckedId);
    const b = list.findIndex(e => e.id === entry.id);
    if (a !== -1 && b !== -1) {
      const [start, end] = a < b ? [a, b] : [b, a];
      for (let i = start; i <= end; i++) {
        if (targetChecked) state.checked.add(list[i].id);
        else state.checked.delete(list[i].id);
      }
      state.lastCheckedId = entry.id;
      updateRowSelection();
      updateBatchBar();
      return;
    }
  }
  if (targetChecked) state.checked.add(entry.id);
  else state.checked.delete(entry.id);
  state.lastCheckedId = entry.id;
  updateRowSelection();
  updateBatchBar();
}
function checkedEntries() {
  return state.entries.filter(e => state.checked.has(e.id));
}
function updateBatchBar() {
  const bar = $('batch-bar');
  const selectAllBtn = $('select-all-rows');
  const visible = state.visibleEntries;
  if (selectAllBtn) {
    selectAllBtn.hidden = state.scope === 'graph' || !visible.length;
    const allChecked = visible.length > 0 && visible.every(e => state.checked.has(e.id));
    selectAllBtn.textContent = allChecked ? t('list.deselectAll') : t('list.selectAll');
  }
  if (!bar) return;
  const items = checkedEntries();
  if (!items.length || state.scope === 'graph') {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const writableCount = items.filter(e => !e.readonly).length;
  $('batch-count').textContent = t('batch.selected', { count: items.length });
  $('batch-move').disabled = state.writing || writableCount === 0;
  $('batch-delete').disabled = state.writing || writableCount === 0;
}
$('select-all-rows')?.addEventListener('click', () => {
  const visible = state.visibleEntries;
  if (!visible.length) return;
  const allChecked = visible.every(e => state.checked.has(e.id));
  for (const item of visible) {
    if (allChecked) state.checked.delete(item.id);
    else state.checked.add(item.id);
  }
  updateRowSelection();
  updateBatchBar();
});
$('batch-clear')?.addEventListener('click', clearChecked);
$('batch-copy-ai')?.addEventListener('click', () => {
  const items = checkedEntries();
  if (!items.length) return;
  const pid = state.agentStatus?.profileId;
  const lines = items.map(e => `- \`id:${e.id}\` [${isFolder(e) ? '目录' : '书签'}] ${title(e)}${e.url ? ` (${e.url})` : ''}${note(e) ? ` — 备注: ${note(e)}` : ''}`);
  const prompt = [
    `请使用 AnyMark CLI 处理以下我选中的 ${items.length} 个 Chrome 书签条目${pid ? `（Profile: \`${pid}\`）` : ''}：`,
    ...lines,
    '',
    '请帮我：（在此补充你的指令，例如：归类移动到合适目录 / 批量补充备注 / 检查重复项）',
  ].join('\n');
  void agentHub.copyText(prompt, `已复制 ${items.length} 个选中条目的 ID 清单，可粘贴给 AI 处理。`);
});
function renderNavigation() {
  const collections = [['inbox', t('nav.inbox'), 'inbox'], ['all', t('nav.all'), 'grid'], ['graph', t('nav.graph'), 'network']];
  $('collections').replaceChildren(...collections.map(([scope, label, glyph]) => navItem(scope, label, glyph)));
  $('roots').replaceChildren(...state.roots.filter(isFolder).map(entry => navItem(entry.id, title(entry), 'folder')));
}
function navItem(scope, label, glyph) {
  const item = button(label, 'nav-item', () => navigate(scope), glyph);
  const isActive = state.scope === scope || (!['inbox', 'all', 'graph'].includes(state.scope) && state.ancestors[0]?.id === scope);
  if (isActive) { item.classList.add('active'); item.setAttribute('aria-current', 'page'); }
  item.title = label;
  return item;
}
async function navigate(scope, { fromHistory = false, highlightId = null, highlightFirst = false } = {}) {
  if (!await canLeave()) {
    if (fromHistory) history.replaceState(null, '', state.acceptedHash);
    return;
  }
  clearTimeout(searchTimer);
  state.query = '';
  $('search').value = '';
  syncSearchControls();
  state.scope = scope;
  state.acceptedHash = scopeHash(scope);
  if (!fromHistory) history.pushState(null, '', state.acceptedHash);
  else history.replaceState(null, '', state.acceptedHash);
  state.checked.clear();
  state.lastCheckedId = null;
  state.kbId = null;
  clearSelection();
  clearNotice();
  setNavigation(false);
  await loadScope();
  if (highlightId && state.visibleEntries.some(e => e.id === highlightId)) {
    state.kbId = highlightId;
    updateKbFocus({ scroll: true });
  } else if (highlightFirst && state.visibleEntries.length) {
    state.kbId = state.visibleEntries[0].id;
    updateKbFocus({ scroll: true });
  }
  $('scope-title').focus({ preventScroll: true });
}
window.addEventListener('popstate', () => { void navigate(parseHash(), { fromHistory: true }); });
function clearSelection({ keepInspector = false } = {}) {
  state.selectVersion++;
  state.selected = null;
  $('detail').hidden = true;
  $('inspector-empty').hidden = false;
  if (!keepInspector) state.inspectorOpen = false;
  renderInspector();
  graph?.select(null);
  updateRowSelection();
}
function updateRowSelection() {
  for (const row of $('bookmark-list').querySelectorAll('[data-entry-id]')) {
    const id = row.dataset.entryId;
    const active = id === state.selected?.id;
    const isChecked = state.checked.has(id);
    row.classList.toggle('selected', active);
    row.classList.toggle('checked', isChecked);
    row.classList.toggle('kb-focus', id === state.kbId);
    row.querySelector('.row-select')?.setAttribute('aria-pressed', String(active));
    const checkBtn = row.querySelector('.row-check');
    if (checkBtn) checkBtn.setAttribute('aria-checked', String(isChecked));
  }
}
function renderList(entries, { truncated = false } = {}) {
  state.truncated = truncated;
  const list = $('bookmark-list');
  list.setAttribute('aria-busy', 'false');
  const filtered = state.filter === 'all' ? entries : entries.filter(entry => entry.type === state.filter);
  state.visibleEntries = filtered;
  const validIds = new Set(entries.map(e => e.id));
  for (const id of [...state.checked]) { if (!validIds.has(id)) state.checked.delete(id); }
  if (state.kbId && !filtered.some(e => e.id === state.kbId)) state.kbId = null;
  const filterName = t(`list.type.${state.filter}`);
  $('list-count').textContent = state.query
    ? t('list.matchCount', { count: filtered.length, type: filterName, truncated: truncated ? t('list.truncatedSuffix') : '' })
    : t('list.count', { count: filtered.length, type: filterName });
  $('list-context').textContent = state.query ? t('list.includeSubfolders') : state.filter !== 'all' ? t('list.totalItems', { total: entries.length }) : '';
  $('list-context').hidden = !state.query && state.filter === 'all';
  list.replaceChildren();
  updateBatchBar();
  if (truncated) {
    const warning = element('p', 'truncated-note', t('empty.truncated'));
    list.append(warning);
  }
  if (!filtered.length) {
    const empty = element('div', 'empty-state');
    const isFilterEmpty = entries.length > 0 && state.filter !== 'all';
    empty.append(icon(state.query || isFilterEmpty ? 'search' : state.scope === 'inbox' ? 'inbox' : 'folder'));
    empty.append(element('h2', '', isFilterEmpty ? t('empty.noFilter', { type: filterName }) : state.query ? t('empty.noMatch') : state.scope === 'inbox' ? t('empty.inboxEmpty') : t('empty.folderEmpty')));
    empty.append(element('p', '', isFilterEmpty ? t('empty.filterDesc', { count: entries.length }) : state.query ? t('empty.searchDesc') : state.scope === 'inbox' && !state.inbox ? t('empty.inboxLazyDesc') : t('empty.folderDesc')));
    empty.append(button(isFilterEmpty ? t('empty.showAll') : state.query ? t('empty.clearSearch') : t('action.addLink'), (state.query || isFilterEmpty) ? '' : 'primary', () => {
      if (isFilterEmpty) setFilter('all');
      else if (state.query) { $('search').value = ''; syncSearchControls(); runSearch(); }
      else openCreate('file');
    }, (state.query || isFilterEmpty) ? null : 'plus'));
    list.append(empty);
    return;
  }
  for (const entry of filtered) {
    const folderItem = isFolder(entry);
    const row = element('article', `bookmark-row ${folderItem ? 'folder-row' : 'link-row'}`);
    row.dataset.entryId = entry.id;
    const check = element('button', 'row-check');
    check.type = 'button';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(state.checked.has(entry.id)));
    check.setAttribute('aria-label', `选择 ${title(entry)}`);
    check.title = '选择（按住 Shift 可连选）';
    check.append(icon('check'));
    check.addEventListener('click', event => {
      event.stopPropagation();
      toggleCheck(entry, event.shiftKey);
    });
    row.append(check);
    const select = button('', 'row-select', () => {
      state.kbId = entry.id;
      if (folderItem) void navigate(entry.id);
      else void selectEntry(entry);
    });
    select.setAttribute('aria-label', folderItem ? `进入文件夹：${title(entry)}` : `查看链接详情：${title(entry)}`);
    if (!folderItem) select.setAttribute('aria-pressed', 'false');
    const emblem = element('span', `row-emblem ${folderItem ? 'folder-emblem' : ''}`);
    emblem.append(folderItem ? icon('folder') : faviconElement(entry.url));
    const text = element('span', 'row-copy');
    text.append(element('span', 'row-title', title(entry)));
    const subtitleText = folderItem
      ? (state.query ? readablePath(entry.path, { parentOnly: true }) : t('list.folderTag'))
      : (state.query ? `${readablePath(entry.path, { parentOnly: true })} · ${domain(entry.url || '')}` : domain(entry.url || ''));
    text.append(element('span', 'row-subtitle', subtitleText));
    if (note(entry)) text.append(element('span', 'row-note', note(entry)));
    select.replaceChildren(emblem, text);
    row.append(select);
    if (folderItem) {
      const inspect = button('', 'icon-button row-inspect', () => { state.kbId = entry.id; void selectEntry(entry); }, 'edit');
      inspect.setAttribute('aria-label', `编辑文件夹属性与备注：${title(entry)}`);
      inspect.title = '编辑文件夹 / 备注';
      const browse = button('', 'icon-button row-open', () => navigate(entry.id), 'arrow');
      browse.setAttribute('aria-label', `进入文件夹：${title(entry)}`);
      browse.title = '进入文件夹';
      row.append(inspect, browse);
    } else if (safeURL(entry.url)) {
      const targetUrl = safeURL(entry.url);
      select.addEventListener('dblclick', () => window.open(targetUrl, '_blank', 'noopener,noreferrer'));
      const link = element('a', 'icon-button row-open');
      link.href = targetUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `在新标签页打开：${title(entry)}`);
      link.title = '在新标签页打开';
      link.append(icon('external'));
      row.append(link);
    }
    list.append(row);
  }
  updateRowSelection();
}
async function buildBreadcrumbs(entry) {
  const ancestors = [];
  let current = entry;
  const seen = new Set();
  while (current && current.path !== '/' && !seen.has(current.id)) {
    ancestors.unshift(current);
    seen.add(current.id);
    if (!current.parentId) break;
    current = (await call('stat', { path: `id:${current.parentId}` })).entry;
  }
  return ancestors;
}
function renderBreadcrumbs(ancestors) {
  state.ancestors = ancestors;
  const visible = !['inbox', 'all', 'graph'].includes(state.scope);
  if ($('nav-back')) {
    $('nav-back').hidden = !visible;
    if (visible) {
      const parentLabel = ancestors.length > 1 ? title(ancestors[ancestors.length - 2]) : t('nav.all');
      $('nav-back').title = `${t('header.back')} (${parentLabel})`;
      $('nav-back').setAttribute('aria-label', `${t('header.back')}: ${parentLabel}`);
    }
  }
  $('breadcrumbs').hidden = !visible;
  if (!visible) { $('breadcrumbs').replaceChildren(); return; }
  const crumbs = [button(t('nav.all'), 'breadcrumb', () => navigate('all'))];
  for (const entry of ancestors.slice(0, -1)) {
    crumbs.push(icon('arrow'), button(title(entry), 'breadcrumb', () => navigate(entry.id)));
  }
  if (ancestors.length) {
    crumbs.push(icon('arrow'), element('span', 'breadcrumb-current', title(ancestors[ancestors.length - 1])));
  }
  $('breadcrumbs').replaceChildren(...crumbs);
}
function renderScopeNote(entry) {
  const details = $('scope-note');
  const id = entry?.id || '';
  if (details.dataset.entryId !== id) details.open = false;
  details.dataset.entryId = id;
  $('scope-description').textContent = note(entry);
  details.hidden = !note(entry);
}
async function loadScope({ selectId = null, keepNotice = false, revealSelection = true } = {}) {
  const version = ++state.loadVersion;
  state.loading = true;
  const graphMode = state.scope === 'graph';
  $('app-shell').classList.toggle('graph-mode', graphMode);
  $('graph-view').hidden = !graphMode;
  $('bookmark-list').hidden = graphMode;
  document.querySelector('.list-heading').hidden = graphMode;
  $('search').placeholder = graphMode ? t('search.graphPlaceholder') : t('search.placeholder');
  $('search').setAttribute('aria-label', graphMode ? t('search.graphPlaceholder') : t('search.placeholder'));
  if (!graphMode && graph) { graph.dispose(); graph = null; }
  if (graphMode && !graph) $('graph-view').replaceChildren(element('p', 'loading-state', t('list.loading')));
  $('bookmark-list').setAttribute('aria-busy', 'true');
  $('bookmark-list').replaceChildren(element('p', 'loading-state', t('list.loading')));
  $('list-count').textContent = t('list.loading');
  $('add-link').disabled = true;
  $('add-folder').disabled = true;
  $('open-transfer').disabled = true;
  if (!keepNotice) clearNotice();
  try {
    const [roots, inbox] = await Promise.all([call('ls', { path: '/' }), call('inbox')]);
    if (version !== state.loadVersion) return;
    state.roots = roots.entries;
    state.inbox = inbox.entry;
    if (graphMode) {
      state.folder = roots.entry;
      state.entries = [];
      state.visibleEntries = [];
      renderNavigation();
      renderBreadcrumbs([]);
      $('scope-title').textContent = t('nav.graph');
      $('scope-title').tabIndex = -1;
      renderScopeNote(null);
      syncAgentHub();
      updateBatchBar();
      if (!graph) {
        const { BookmarkGraph } = await import('./graph.js');
        if (version !== state.loadVersion) return;
        $('graph-view').replaceChildren();
        graph = new BookmarkGraph($('graph-view'), {
          onSelect: id => { if (!state.loading) return selectEntry({ id }); },
          onOpenFolder: id => navigate(id === roots.entry.id ? 'all' : id),
          onError: error => { if (graph?.root.dataset.state !== 'unavailable') notify(errorMessage(error), 'error'); },
        });
      }
      await graph.refresh();
      if (version !== state.loadVersion) return;
      graph.setFilter?.(state.filter);
      graph.search(state.query);
      if (selectId) await selectEntry({ id: selectId }, { bypassGuard: true, focus: false, reveal: revealSelection });
      return;
    }
    let listing;
    if (state.scope === 'inbox') listing = inbox;
    else if (state.scope === 'all') listing = roots;
    else listing = await call('ls', { path: `id:${state.scope}` });
    const folder = listing.entry;
    const ancestors = state.scope !== 'inbox' && state.scope !== 'all' ? await buildBreadcrumbs(folder) : [];
    const result = state.query && folder ? await call('find', { path: address(folder), query: state.query, limit: 1000 }) : listing;
    if (version !== state.loadVersion) return;
    state.folder = folder;
    state.ancestors = ancestors;
    state.entries = state.query && !folder ? [] : result.entries;
    renderNavigation();
    $('scope-title').textContent = state.scope === 'inbox' ? t('nav.inbox') : state.scope === 'all' ? t('nav.all') : title(folder);
    $('scope-title').tabIndex = -1;
    renderScopeNote(folder);
    renderBreadcrumbs(ancestors);
    syncAgentHub();
    renderList(state.entries, { truncated: result.truncated });
    if (selectId) await selectEntry({ id: selectId }, { bypassGuard: true, focus: false, reveal: revealSelection });
  } catch (error) {
    if (version !== state.loadVersion) return;
    state.folder = null;
    state.entries = [];
    if (graphMode) {
      graph?.dispose();
      graph = null;
      const failure = element('div', 'empty-state');
      failure.append(icon('network'), element('h2', '', t('empty.graphFailed')), element('p', 'error-copy', errorMessage(error)), button(t('empty.retry'), '', () => loadScope(), 'refresh'), button(t('empty.backAll'), 'text-button', () => navigate('all')));
      $('graph-view').replaceChildren(failure);
      return;
    }
    $('list-count').textContent = t('empty.loadFailed');
    $('bookmark-list').setAttribute('aria-busy', 'false');
    const failure = element('div', 'empty-state');
    failure.append(icon('refresh'), element('h2', '', t('empty.listFailed')), element('p', 'error-copy', errorMessage(error)), button(t('empty.retry'), '', () => loadScope(), 'refresh'));
    if (state.scope !== 'inbox' && state.scope !== 'all') failure.append(button(t('empty.backAll'), 'text-button', () => navigate('all')));
    $('bookmark-list').replaceChildren(failure);
  } finally {
    if (version === state.loadVersion) {
      state.loading = false;
      $('add-link').disabled = state.writing;
      $('add-folder').disabled = state.writing;
      $('open-transfer').disabled = state.writing;
    }
  }
}
async function selectEntry(entry, { bypassGuard = false, focus = true, reveal = true } = {}) {
  if (!bypassGuard && state.selected?.id === entry.id) {
    if (reveal) setInspectorOpen(true);
    return;
  }
  if (!bypassGuard && !await canLeave()) return;
  const version = ++state.selectVersion;
  try {
    const { entry: current } = await call('stat', { path: address(entry) });
    if (version !== state.selectVersion) return;
    const changedSelection = state.selected?.id !== current.id;
    state.selected = current;
    $('edit-title').value = current.title ?? current.name ?? '';
    $('edit-url').value = current.url || '';
    $('edit-note').value = note(current);
    $('detail-heading').textContent = title(current);
    $('detail-kind').textContent = isFolder(current) ? t('inspector.folderKind') : t('inspector.linkKind');
    $('detail-emblem').replaceChildren(isFolder(current) ? icon('folder') : faviconElement(current.url, { size: 28 }));
    $('protection-note').hidden = !current.readonly;
    $('protection-note').textContent = t('inspector.protectionNote');
    $('edit-url-field').hidden = isFolder(current);
    const url = safeURL(current.url);
    $('open-link').hidden = !url;
    if (url) $('open-link').href = url; else $('open-link').removeAttribute('href');
    $('unsafe-link').hidden = !!url;
    $('browse-folder').hidden = !isFolder(current);
    $('entry-path').textContent = current.path;
    $('entry-id').textContent = current.id;
    $('edit-error').hidden = true;
    $('detail').hidden = false;
    $('inspector-empty').hidden = true;
    if (reveal) state.inspectorOpen = true;
    renderInspector();
    setWriting(false);
    updateRowSelection();
    graph?.select(current.id);
    if (changedSelection && !reducedMotion.matches) {
      detailAnimation?.cancel();
      detailAnimation = $('detail').animate([{ transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 160, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
    if (focus && narrow.matches && state.inspectorOpen) { $('close-detail').focus(); $('inspector').scrollTop = 0; }
  } catch (error) { notify(errorMessage(error), 'error'); }
}
$('edit-form').addEventListener('input', updateDirty);
$('edit-form').addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !state.writing && dirty()) {
    event.preventDefault();
    $('edit-form').requestSubmit();
  }
});
$('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.selected || state.writing || !dirty()) return;
  const entry = state.selected;
  const changes = {};
  if (!entry.readonly && $('edit-title').value !== (entry.title ?? entry.name ?? '')) changes.title = $('edit-title').value;
  if (!entry.readonly && !isFolder(entry) && $('edit-url').value !== entry.url) changes.url = $('edit-url').value;
  if ($('edit-note').value !== note(entry)) changes.note = $('edit-note').value;
  if (!Object.keys(changes).length) return;
  $('edit-error').hidden = true;
  setWriting(true);
  try {
    await call('edit', { path: address(entry), changes });
    clearSelection({ keepInspector: true });
    notify(t('inspector.savedNotice'));
    await loadScope({ selectId: entry.id, keepNotice: true });
  } catch (error) { showError('edit-error', error); }
  finally { setWriting(false); }
});
$('close-detail').addEventListener('click', () => setInspectorOpen(false, { focus: true }));
$('browse-folder').addEventListener('click', () => { if (state.selected) navigate(state.selected.id); });
$('refresh').addEventListener('click', async () => {
  if (!await canLeave()) return;
  const id = state.selected?.id, revealSelection = state.inspectorOpen;
  clearSelection({ keepInspector: true });
  await loadScope({ selectId: id, revealSelection });
});
let searchTimer;
function runSearch() {
  clearTimeout(searchTimer);
  syncSearchControls();
  state.query = $('search').value.trim();
  if (state.scope === 'graph') graph?.search(state.query);
  else void loadScope();
}
$('search').addEventListener('input', () => { syncSearchControls(); clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); });
$('search').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); runSearch(); }
  else if (event.key === 'Escape' && $('search').value) {
    event.preventDefault();
    event.stopPropagation();
    $('search').value = '';
    runSearch();
  }
});
$('clear-search')?.addEventListener('click', () => {
  $('search').value = '';
  $('search').focus();
  runSearch();
});

// Creation never writes until the form is submitted. Missing Inbox is only a virtual destination.
function createDirty() {
  return !!state.create && ($('create-title').value !== '' || $('create-url').value !== '' || $('create-note').value !== '');
}
function renderCreateDestination() {
  const creation = state.create;
  const parent = creation?.destination;
  $('create-destination-name').textContent = parent?.kind === 'inbox' ? 'Inbox' : parent ? title(parent) : t('create.pickWritable');
  $('create-hint').textContent = parent?.kind === 'inbox' ? (state.inbox ? t('create.hintInboxExists') : t('create.hintInboxLazy')) : parent ? t('create.hintFolder', { path: parent.path }) : t('create.hintRoot');
  $('submit-create').disabled = !parent || !!creation?.busy;
}
async function openCreate(type) {
  if (state.loading || !await canLeave()) return;
  if (dirty()) clearSelection();
  const destination = state.scope === 'inbox' && type === 'file' ? { kind: 'inbox' } : state.folder?.childrenWritable ? state.folder : null;
  state.create = { type, destination, busy: false };
  $('create-heading').textContent = type === 'file' ? t('create.addLink') : t('create.addFolder');
  $('submit-create').textContent = type === 'file' ? t('create.saveLink') : t('create.saveFolder');
  for (const id of ['create-title', 'create-url', 'create-note']) $(id).value = '';
  $('create-url-field').hidden = type !== 'file';
  $('create-url').required = type === 'file';
  $('create-error').hidden = true;
  renderCreateDestination();
  $('create-dialog').showModal();
  $('create-title').focus();
}
async function closeCreate() {
  if (state.create?.busy) return;
  if (createDirty() && !await confirmAction({ heading: '放弃这次新增？', description: '尚未保存的链接、文件夹或备注内容将丢失。', accept: '放弃新增', danger: true })) return;
  state.create = null;
  $('create-dialog').close();
}
$('add-link').addEventListener('click', () => openCreate('file'));
$('add-folder').addEventListener('click', () => openCreate('directory'));
for (const id of ['close-create', 'cancel-create']) $(id).addEventListener('click', closeCreate);
$('create-dialog').addEventListener('cancel', event => { event.preventDefault(); void closeCreate(); });
$('create-destination').addEventListener('click', () => {
  if (!state.create || state.create.busy) return;
  openChooser({ mode: 'create', start: state.create.destination?.id || '/' });
});
$('create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const creation = state.create;
  if (!creation || creation.busy || !creation.destination) return;
  const name = $('create-title').value;
  const url = $('create-url').value;
  if (creation.type === 'file' && !safeURL(url)) {
    showError('create-error', { message: '请输入完整的 HTTP 或 HTTPS 网址。' }); $('create-url').focus(); return;
  }
  if (!name.trim()) { showError('create-error', { message: '请输入标题。' }); $('create-title').focus(); return; }
  creation.busy = true;
  setWriting(true);
  for (const control of $('create-form').querySelectorAll('input, textarea, button')) control.disabled = true;
  $('create-error').hidden = true;
  try {
    const parent = creation.destination;
    const localNote = $('create-note').value;
    let result;
    let destinationScope;
    if (creation.type === 'file' && (parent.kind === 'inbox' || parent.id === state.inbox?.id)) {
      const args = { url, title: name };
      if (localNote !== '') args.note = localNote;
      result = await call('capture', args);
      destinationScope = 'inbox';
    } else {
      let encodedName = encodeURIComponent(name).replace(/~/g, '%7E');
      if (name === '.' || name === '..') encodedName = encodedName.replace(/\./g, '%2E');
      const path = `${parent.path.replace(/\/$/, '')}/${encodedName}`;
      result = creation.type === 'file' ? await call('write', { path, content: { title: name, url, note: localNote }, exclusive: true }) : await call('mkdir', { path, note: localNote });
      destinationScope = parent.id;
    }
    state.create = null;
    $('create-dialog').close();
    state.scope = destinationScope;
    state.acceptedHash = scopeHash(destinationScope);
    history.pushState(null, '', state.acceptedHash);
    state.query = '';
    $('search').value = '';
    clearSelection();
    notify(result.created === false ? `此网址已在 Inbox 中；未创建重复书签。${localNote !== '' ? '填写的备注已保存。' : ''}` : creation.type === 'file' ? '链接已保存到 Chrome。' : '文件夹已创建。');
    await loadScope({ selectId: result.entry.id, keepNotice: true });
  } catch (error) { showError('create-error', error); }
  finally {
    creation.busy = false;
    for (const control of $('create-form').querySelectorAll('input, textarea, button')) control.disabled = false;
    if (state.create) renderCreateDestination();
    setWriting(false);
  }
});

// Every folder level is fetched on demand; no depth-limited destination tree.
function openChooser({ mode, start = '/', source = null, onChoose = null }) {
  state.chooser = { mode, source, onChoose, current: null, busy: false, version: 0 };
  $('chooser-heading').textContent = (mode === 'move' || mode === 'batch-move') ? t('chooser.moveTitle') : mode === 'copy' ? t('chooser.copyTitle') : t('chooser.selectTitle');
  $('chooser-intro').textContent = mode === 'batch-move'
    ? t('chooser.introBatchMove', { count: Array.isArray(source) ? source.length : 0 })
    : source ? (mode === 'copy' && isFolder(source) ? t('chooser.introCopyFolder', { title: title(source) }) : t('chooser.introSingle', { title: title(source) })) : t('chooser.introDefault');
  $('choose-folder').textContent = (mode === 'move' || mode === 'batch-move') ? t('chooser.moveHere') : mode === 'copy' ? t('chooser.copyHere') : t('chooser.chooseBtn');
  $('chooser-dialog').showModal();
  void loadChooser(start);
}
async function loadChooser(path) {
  const chooser = state.chooser;
  if (!chooser || chooser.busy) return;
  const version = ++chooser.version;
  chooser.current = null;
  $('choose-folder').disabled = true;
  $('chooser-up').disabled = true;
  $('chooser-error').hidden = true;
  $('chooser-hint').textContent = '';
  $('chooser-location').textContent = t('list.loading');
  $('chooser-list').setAttribute('aria-busy', 'true');
  $('chooser-list').replaceChildren(element('p', 'loading-state', t('list.loading')));
  try {
    const result = await call('ls', { path: path === '/' || path.startsWith('id:') ? path : `id:${path}` });
    if (state.chooser !== chooser || version !== chooser.version) return;
    chooser.current = result.entry;
    $('chooser-location').textContent = result.entry.path === '/' ? t('nav.all') : title(result.entry);
    $('chooser-location').title = result.entry.path;
    $('chooser-up').disabled = !result.entry.parentId;
    $('choose-folder').disabled = !result.entry.childrenWritable;
    $('chooser-hint').textContent = result.entry.childrenWritable ? t('chooser.targetHint', { path: result.entry.path }) : t('chooser.readonlyHint');
    const folders = result.entries.filter(isFolder);
    $('chooser-list').replaceChildren(...folders.map(entry => {
      const node = button(title(entry), 'chooser-folder', () => loadChooser(address(entry)), 'folder');
      node.append(icon('arrow'));
      return node;
    }));
    if (!folders.length) $('chooser-list').append(element('p', 'chooser-empty', t('chooser.noSubfolders')));
  } catch (error) {
    if (state.chooser !== chooser || version !== chooser.version) return;
    $('chooser-list').replaceChildren(button(t('empty.retry'), '', () => loadChooser(path), 'refresh'));
    if (path !== '/') $('chooser-list').append(button(t('empty.backAll'), 'text-button', () => loadChooser('/'), 'grid'));
    showError('chooser-error', error);
  } finally {
    if (state.chooser === chooser && version === chooser.version) $('chooser-list').setAttribute('aria-busy', 'false');
  }
}
function closeChooser() {
  if (state.chooser?.busy) return;
  const hadPartialMove = (state.chooser?.movedCount || 0) > 0;
  state.chooser = null;
  $('chooser-dialog').close();
  if (hadPartialMove) {
    clearSelection();
    void loadScope({ keepNotice: true });
  }
}
for (const id of ['close-chooser', 'cancel-chooser']) $(id).addEventListener('click', closeChooser);
$('chooser-dialog').addEventListener('cancel', event => { event.preventDefault(); closeChooser(); });
$('chooser-up').addEventListener('click', () => { if (state.chooser?.current?.parentId) loadChooser(`id:${state.chooser.current.parentId}`); });
$('choose-folder').addEventListener('click', async () => {
  const chooser = state.chooser;
  if (!chooser?.current?.childrenWritable || chooser.busy) return;
  if (chooser.mode === 'import') {
    const destination = chooser.current;
    closeChooser();
    chooser.onChoose?.(destination);
    return;
  }
  if (chooser.mode === 'create') {
    if (state.create) { state.create.destination = chooser.current; renderCreateDestination(); }
    closeChooser();
    return;
  }
  chooser.busy = true;
  setWriting(true);
  for (const control of $('chooser-dialog').querySelectorAll('button')) control.disabled = true;
  $('chooser-error').hidden = true;
  try {
    if (chooser.mode === 'batch-move') {
      const queue = Array.isArray(chooser.source) ? chooser.source : [];
      while (queue.length) {
        const item = queue[0];
        if (!item.readonly && item.id !== chooser.current.id) {
          await call('mv', { path: address(item), to: address(chooser.current) });
          chooser.movedCount = (chooser.movedCount || 0) + 1;
        }
        queue.shift();
        state.checked.delete(item.id);
      }
      const totalMoved = chooser.movedCount || 0;
      chooser.movedCount = 0;
      chooser.busy = false;
      closeChooser();
      clearChecked();
      clearSelection();
      notify(`已将 ${totalMoved} 个条目移动到“${title(chooser.current)}”。`);
      await loadScope({ keepNotice: true });
      return;
    }
    const args = { path: address(chooser.source), to: address(chooser.current) };
    if (chooser.mode === 'copy' && isFolder(chooser.source)) args.recursive = true;
    await call(chooser.mode === 'move' ? 'mv' : 'cp', args);
    chooser.busy = false;
    closeChooser();
    clearSelection();
    notify(chooser.mode === 'move' ? `已移动到“${title(chooser.current)}”。` : `已复制到“${title(chooser.current)}”。`);
    await loadScope({ keepNotice: true });
  } catch (error) {
    if (chooser.mode === 'batch-move' && Array.isArray(chooser.source)) {
      $('chooser-intro').textContent = t('chooser.introBatchMove', { count: chooser.source.length });
    }
    showError('chooser-error', error);
    chooser.busy = false;
  } finally {
    for (const control of $('chooser-dialog').querySelectorAll('button')) control.disabled = false;
    $('chooser-up').disabled = !state.chooser?.current?.parentId;
    $('choose-folder').disabled = !state.chooser?.current?.childrenWritable;
    setWriting(false);
  }
});
$('batch-move')?.addEventListener('click', async () => {
  const items = checkedEntries().filter(e => !e.readonly);
  if (!items.length || !await canLeave()) return;
  openChooser({ mode: 'batch-move', source: [...items], start: items[0].parentId ? `id:${items[0].parentId}` : '/' });
});
$('batch-delete')?.addEventListener('click', async () => {
  const items = checkedEntries().filter(e => !e.readonly);
  if (!items.length || !await canLeave()) return;
  const remaining = [...items];
  let deletedCount = 0;
  const hasFolders = remaining.some(isFolder);
  const deleted = await confirmAction({
    heading: `永久删除已选的 ${remaining.length} 个条目？`,
    description: `${hasFolders ? '包含文件夹及其内部所有子书签与备注，' : '选中链接及其本地备注'}将从此 Chrome Profile 永久删除。此操作不可撤销。`,
    accept: `永久删除 (${remaining.length})`,
    danger: true,
    action: async () => {
      setWriting(true);
      try {
        while (remaining.length) {
          const item = remaining[0];
          await call('rm', { path: address(item), ...(isFolder(item) ? { recursive: true } : {}) });
          remaining.shift();
          deletedCount++;
          state.checked.delete(item.id);
        }
      } finally {
        if (remaining.length > 0 && deletedCount > 0) {
          $('confirm-heading').textContent = `继续删除剩余的 ${remaining.length} 个条目？`;
          $('confirm-accept').textContent = `永久删除 (${remaining.length})`;
        }
        setWriting(false);
      }
    },
  });
  if (deleted) {
    clearChecked();
    clearSelection();
    notify(`已永久删除 ${deletedCount} 个条目。`);
    await loadScope({ keepNotice: true });
  } else if (deletedCount > 0) {
    clearSelection();
    notify(`已删除 ${deletedCount} 个条目，剩余 ${remaining.length} 个未删除。`, 'error');
    await loadScope({ keepNotice: true });
  }
});
for (const [id, mode] of [['move-entry', 'move'], ['copy-entry', 'copy']]) {
  $(id).addEventListener('click', async () => {
    if (!state.selected || !await canLeave()) return;
    const source = state.selected;
    if (dirty()) await selectEntry(source, { bypassGuard: true, focus: false });
    openChooser({ mode, source, start: source.parentId ? `id:${source.parentId}` : '/' });
  });
}
$('delete-entry').addEventListener('click', async () => {
  if (!state.selected || state.selected.readonly || !await canLeave()) return;
  const source = state.selected;
  const deleted = await confirmAction({
    heading: isFolder(source) ? '永久删除此文件夹？' : '永久删除此链接？',
    description: `“${title(source)}”${isFolder(source) ? '及其中所有文件夹、链接和本地备注' : '及其本地备注'}将从此 Chrome Profile 永久删除。此操作不可撤销。`,
    accept: '永久删除', danger: true,
    action: async () => {
      setWriting(true);
      try { await call('rm', { path: address(source), ...(isFolder(source) ? { recursive: true } : {}) }); }
      finally { setWriting(false); }
    },
  });
  if (deleted) {
    clearSelection();
    notify('已从 Chrome 永久删除。');
    await loadScope({ keepNotice: true });
  }
});

const transferPanel = new BookmarkTransferPanel({
  beforeOpen: async () => {
    if (state.loading || !await canLeave()) return false;
    if (dirty()) clearSelection();
    setNavigation(false);
    return true;
  },
  getDestination: () => state.folder?.childrenWritable ? state.folder : null,
  chooseDestination: (destination, onChoose) => openChooser({ mode: 'import', start: destination?.id || '/', onChoose }),
  setWriting,
  onImported: async result => {
    await navigate(result.entry.id);
    notify(result.partial ? '已打开部分导入的文件夹。请先核对结果，不要重复导入。' : `导入完成：${result.summary.bookmarks} 个书签、${result.summary.folders} 个文件夹、${result.summary.notes} 条备注。原有书签未被替换。`, result.partial ? 'error' : 'success');
  },
  notify,
});
$('open-transfer').addEventListener('click', () => { void transferPanel.open(); });

const settingsPanel = new SettingsPanel({
  agentHub,
  onStatusChange: status => {
    state.agentStatus = status;
    syncAgentHub();
  },
  onOpenTransfer: () => { void transferPanel.open(); },
  notify,
});
$('open-settings')?.addEventListener('click', () => {
  setNavigation(false);
  void settingsPanel.open();
});

onLangChange(() => {
  renderNavigation();
  renderBreadcrumbs(state.ancestors);
  if (state.scope === 'graph') $('scope-title').textContent = t('nav.graph');
  else $('scope-title').textContent = state.scope === 'inbox' ? t('nav.inbox') : state.scope === 'all' ? t('nav.all') : (state.folder ? title(state.folder) : '');
  $('search').placeholder = state.scope === 'graph' ? t('search.graphPlaceholder') : t('search.placeholder');
  if (state.scope !== 'graph' && !state.loading) renderList(state.entries, { truncated: state.truncated });
  if (state.selected) $('detail-kind').textContent = isFolder(state.selected) ? t('inspector.folderKind') : t('inspector.linkKind');
  updateDirty();
});

state.scope = parseHash();
state.acceptedHash = scopeHash(state.scope);
history.replaceState(null, '', state.acceptedHash);
syncAgentHub();
void loadScope();
getStatus().then(status => {
  state.agentStatus = status;
  syncAgentHub();
  const footer = document.querySelector('.sidebar-footer');
  footer.title = `Profile: ${status.profileId || '未提供'}\n本地 Agent 访问${status.enabled ? '已开启' : '已关闭'}；不影响本工作台使用。`;
}).catch(() => { /* Bookmark operation failures are shown in the workspace, independent of Agent status. */ });
