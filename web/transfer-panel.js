import { call } from '../extension/ui-api.js';
import { t } from '../extension/i18n.js';
import { parseBookmarkHTML } from '../src/transfer.js';
import { MAX_RESPONSE_BYTES } from '../src/protocol.js';

const $ = id => document.getElementById(id);
const uncertainCodes = new Set(['EPARTIAL', 'EUNKNOWN', 'ERESULTTOOLARGE', 'ECHANGED']);
const counts = summary => `${summary.bookmarks} ${t('list.type.file')} · ${summary.folders} ${t('list.type.directory')} · ${summary.notes} ${t('inspector.note')}`;
const errorText = error => `${error.code ? `${error.code} · ` : ''}${error.message || 'Error'}`;

/** File previews are inert; only an explicit import submit writes to Chrome. */
export class BookmarkTransferPanel {
  constructor({ beforeOpen, getDestination, chooseDestination, setWriting, onImported, notify }) {
    this.callbacks = { beforeOpen, getDestination, chooseDestination, setWriting, onImported, notify };
    this.dialog = $('transfer-dialog');
    this.mode = 'import';
    this.busy = false;
    this.uncertain = false;
    this.document = null;
    this.destination = null;
    this.partial = null;
    this.readVersion = 0;
    for (const id of ['transfer-close', 'transfer-import-cancel', 'transfer-export-close']) $(id).addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    for (const mode of ['import', 'export']) {
      const tab = $(`transfer-${mode}-tab`);
      tab.addEventListener('click', () => this.switchMode(mode));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || this.busy) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'import' : event.key === 'End' ? 'export' : mode === 'import' ? 'export' : 'import';
        this.switchMode(next);
        $(`transfer-${next}-tab`).focus();
      });
    }
    $('transfer-file').addEventListener('change', () => { void this.readFile(); });
    $('transfer-title').addEventListener('input', () => this.render());
    $('transfer-destination').addEventListener('click', () => {
      if (this.busy || this.uncertain) return;
      this.callbacks.chooseDestination(this.destination, entry => { this.destination = entry; this.render(); });
    });
    $('transfer-import-form').addEventListener('submit', event => { event.preventDefault(); void this.importFile(); });
    $('transfer-export').addEventListener('click', () => { void this.exportFile(); });
    $('transfer-inspect-partial').addEventListener('click', () => { void this.inspectPartial(); });
  }

  async open() {
    if (this.busy || !await this.callbacks.beforeOpen()) return;
    this.document = null;
    this.partial = null;
    this.uncertain = false;
    this.destination = this.callbacks.getDestination();
    $('transfer-file').value = '';
    $('transfer-title').value = t('transfer.defaultFolderName');
    $('transfer-import-error').hidden = true;
    $('transfer-export-error').hidden = true;
    $('transfer-export-status').textContent = '';
    $('transfer-preview').textContent = t('transfer.previewIdle');
    this.switchMode('import');
    this.render();
    this.dialog.showModal();
    $('transfer-import-tab').focus();
  }

  close() {
    if (this.busy) return;
    ++this.readVersion;
    this.document = null;
    $('transfer-file').value = '';
    this.dialog.close();
  }

  switchMode(mode) {
    if (this.busy) return;
    this.mode = mode;
    for (const value of ['import', 'export']) {
      const active = value === mode;
      $(`transfer-${value}-tab`).setAttribute('aria-selected', String(active));
      $(`transfer-${value}-tab`).tabIndex = active ? 0 : -1;
      $(`transfer-${value}-panel`).hidden = !active;
    }
  }

  render() {
    for (const id of ['transfer-close', 'transfer-import-tab', 'transfer-export-tab', 'transfer-file', 'transfer-title', 'transfer-destination', 'transfer-import-cancel', 'transfer-export', 'transfer-export-close']) {
      $(id).disabled = this.busy || this.uncertain && ['transfer-file', 'transfer-title', 'transfer-destination'].includes(id);
    }
    $('transfer-submit').disabled = this.busy || this.uncertain || !this.document || !this.destination || !$('transfer-title').value.trim();
    $('transfer-submit').textContent = this.busy ? t('transfer.importing') : this.uncertain ? t('popup.uncertain') : t('transfer.submitImport');
    $('transfer-destination-name').textContent = this.destination?.title || this.destination?.name || t('transfer.pickDest');
    $('transfer-location').textContent = this.destination ? t('chooser.targetHint', { path: this.destination.path }) : t('create.hintRoot');
    $('transfer-import-hint').textContent = t('transfer.importHint');
    $('transfer-inspect-partial').hidden = !this.partial?.id;
  }

  showError(id, error, extra = '') {
    $(id).textContent = `${errorText(error)}${extra ? ` ${extra}` : ''}`;
    $(id).hidden = false;
  }

  async readFile() {
    const file = $('transfer-file').files[0];
    const version = ++this.readVersion;
    this.document = null;
    $('transfer-import-error').hidden = true;
    if (!file) { $('transfer-preview').textContent = '选择文件后预览内容。此时不会修改书签。'; this.render(); return; }
    this.busy = true;
    this.render();
    $('transfer-preview').textContent = '正在读取并检查文件…';
    try {
      if (file.size >= MAX_RESPONSE_BYTES) throw new Error('文件超过 64 MiB，请先拆分为较小的书签文件。');
      const html = await file.text();
      const parsed = parseBookmarkHTML(html);
      if (version !== this.readVersion) return;
      this.document = { html, summary: parsed.summary, format: parsed.format };
      const filename = file.name.replace(/\.html?$/i, '').trim();
      $('transfer-title').value = filename ? `导入 - ${filename}` : '导入的书签';
      $('transfer-preview').textContent = `${parsed.format === 'anymark' ? 'AnyMark 备份' : 'Chrome 兼容 HTML'}：${counts(parsed.summary)}。尚未导入。`;
    } catch (error) {
      if (version !== this.readVersion) return;
      this.showError('transfer-import-error', error);
      $('transfer-preview').textContent = '文件未通过检查，没有修改书签。';
    } finally {
      if (version === this.readVersion) { this.busy = false; this.render(); }
    }
  }

  async importFile() {
    if ($('transfer-submit').disabled || !this.document || !this.destination) return;
    this.busy = true;
    this.callbacks.setWriting(true);
    $('transfer-import-error').hidden = true;
    this.render();
    let result;
    try {
      result = await call('import', { html: this.document.html, to: `id:${this.destination.id}`, title: $('transfer-title').value });
    } catch (error) {
      this.uncertain = !error.code || uncertainCodes.has(error.code);
      this.partial = error.details?.entry || null;
      this.showError('transfer-import-error', error, this.uncertain ? '可能已新建部分书签。请先核对结果，不要重复导入。' : '没有自动重试；请检查文件和目标位置。');
    } finally {
      this.busy = false;
      this.callbacks.setWriting(false);
      this.render();
    }
    if (result) {
      this.close();
      try { await this.callbacks.onImported(result); }
      catch (error) { this.callbacks.notify(`导入已完成，但无法显示结果。请刷新查看：${errorText(error)}`, 'error'); }
    }
  }

  async inspectPartial() {
    if (!this.partial?.id || this.busy) return;
    const entry = this.partial;
    this.close();
    try { await this.callbacks.onImported({ entry, partial: true }); }
    catch (error) { this.callbacks.notify(`请按 Chrome ID ${entry.id} 检查部分导入：${errorText(error)}`, 'error'); }
  }

  async exportFile() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    $('transfer-export-error').hidden = true;
    $('transfer-export-status').textContent = '正在读取完整书签与备注…';
    try {
      const result = await call('export', { path: '/' });
      const url = URL.createObjectURL(new Blob([result.html], { type: 'text/html;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      const today = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      anchor.download = `AnyMark-bookmarks-${today}.html`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      $('transfer-export-status').textContent = `已生成 ${counts(result.summary)}，并交给浏览器下载。迁移前请确认文件已保存。`;
    } catch (error) {
      $('transfer-export-status').textContent = '';
      this.showError('transfer-export-error', error);
    } finally { this.busy = false; this.render(); }
  }
}
