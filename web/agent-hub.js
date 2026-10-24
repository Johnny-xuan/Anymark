import { getLang, t, onLangChange } from '../extension/i18n.js';

const HUB_KEY = 'anymark.agentHub';

export class AgentHubController {
  constructor({ getState, readablePath, title, notify }) {
    this.getState = getState;
    this.readablePath = readablePath;
    this.title = title;
    this.notify = notify;
    this.open = (() => {
      try { return localStorage.getItem(HUB_KEY) !== '0'; } catch { return true; }
    })();

    document.getElementById('toggle-agent-hub')?.addEventListener('click', () => this.setOpen(!this.open));
    document.getElementById('copy-profile-cmd')?.addEventListener('click', () => {
      const pid = this.getState().agentStatus?.profileId;
      const cmd = pid ? `anymark use ${pid} && anymark status` : 'anymark profiles';
      void this.copyText(cmd, t('agent.cmdCopied', { cmd }));
    });
    document.getElementById('skill-cards')?.addEventListener('click', event => {
      const card = event.target.closest('.skill-card');
      if (!card?.dataset.skill) return;
      const prompt = this.buildSkillPrompt(card.dataset.skill);
      const titleText = card.querySelector('strong')?.textContent || 'Agent';
      card.classList.add('copied');
      setTimeout(() => card.classList.remove('copied'), 1200);
      void this.copyText(prompt, t('agent.copied', { title: titleText }));
    });

    onLangChange(() => this.sync());
  }

  isOpen() {
    return this.open;
  }

  setOpen(open) {
    this.open = Boolean(open);
    try { localStorage.setItem(HUB_KEY, this.open ? '1' : '0'); } catch {}
    this.sync();
  }

  async copyText(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      this.notify(successMsg);
    } catch {
      this.notify('Clipboard access failed.', 'error');
    }
  }

  sync() {
    const hub = document.getElementById('agent-hub');
    const toggle = document.getElementById('toggle-agent-hub');
    if (!hub || !toggle) return;
    const state = this.getState();
    const graphMode = state.scope === 'graph';
    toggle.hidden = graphMode;
    hub.hidden = graphMode || !this.open;
    toggle.setAttribute('aria-expanded', String(!hub.hidden));
    toggle.classList.toggle('active', !hub.hidden);

    const scopeLabel = state.scope === 'inbox'
      ? t('nav.inbox')
      : state.scope === 'all'
        ? t('nav.all')
        : (state.folder ? this.title(state.folder) : t('nav.all'));
    for (const badge of document.querySelectorAll('[data-scope-badge]')) badge.textContent = scopeLabel;

    const status = state.agentStatus;
    const dot = document.getElementById('agent-dot');
    if (dot) dot.dataset.online = status?.enabled ? 'true' : 'false';
    const pid = status?.profileId;
    const codeEl = document.getElementById('agent-profile-code');
    if (codeEl) codeEl.textContent = pid ? `anymark use ${pid}` : 'anymark profiles';
    const titleEl = document.getElementById('agent-status-title');
    if (titleEl) {
      titleEl.textContent = status?.enabled
        ? t('agent.hubReady', { profile: pid || 'default' })
        : t('agent.hubTitle');
    }
  }

  buildSkillPrompt(skill) {
    const state = this.getState();
    const lang = getLang();
    const pid = state.agentStatus?.profileId;
    const profileFlag = pid ? ` --profile ${pid}` : '';
    const useLine = pid ? `anymark use ${pid}` : 'anymark profiles';
    const currentTarget = state.scope === 'inbox' ? 'inbox' : (state.folder && state.scope !== 'all' ? `id:${state.folder.id}` : '/');
    const currentName = state.scope === 'inbox'
      ? 'AnyMark Inbox'
      : (state.folder && state.scope !== 'all' ? `${this.title(state.folder)} (${this.readablePath(state.folder.path)})` : '/');

    if (lang === 'en') {
      if (skill === 'inbox-triage') {
        return [
          'Please use the AnyMark CLI to triage my Chrome bookmarks Inbox (see `skills/anymark/SKILL.md`):',
          `1. Bind the active profile: \`${useLine}\``,
          `2. Run \`anymark inbox${profileFlag}\` and \`anymark tree / --depth 2${profileFlag}\` to inspect pending links and folder structure.`,
          '3. For each Inbox bookmark:',
          '   - Pick the best matching folder (or create one via `anymark mkdir` if needed);',
          '   - If `note` is empty, add concise search keywords via `anymark edit id:<ID> --note "..."`;',
          '   - Move it into the target folder with `anymark mv id:<ID> id:<FOLDER_ID>`.',
        ].join('\n');
      }
      if (skill === 'dedupe-audit') {
        return [
          `Please use the AnyMark CLI to audit and deduplicate bookmarks in "${currentName}" (see \`skills/anymark/SKILL.md\`):`,
          `1. First export a safety backup: \`anymark export "/tmp/anymark-backup-$(date +%Y%m%d-%H%M%S).html"${profileFlag}\`.`,
          `2. Inspect the current scope: \`${currentTarget === 'inbox' ? `anymark inbox${profileFlag}` : `anymark tree '${currentTarget}' --depth 4${profileFlag}`}\`.`,
          '3. Identify duplicate URLs (merge notes onto the kept bookmark before running `anymark rm`) and empty/fragmented folders.',
        ].join('\n');
      }
      if (skill === 'enrich-notes') {
        return [
          `Please use the AnyMark CLI to enrich local search notes for bookmarks in "${currentName}":`,
          `1. Run \`${currentTarget === 'inbox' ? `anymark inbox${profileFlag}` : `anymark ls '${currentTarget}'${profileFlag}`}\`.`,
          '2. For bookmarks with an empty `note`, generate concise topic keywords and usage context from the title, domain, and folder.',
          `3. Save via \`anymark edit id:<ID> --note "..."${profileFlag}\` without altering the original title or URL.`,
        ].join('\n');
      }
      return [
        'You can operate my Chrome bookmarks as a local filesystem via the AnyMark CLI (see `skills/anymark/SKILL.md`):',
        `- Bind profile: \`${useLine}\``,
        '- Read commands: `anymark status`, `anymark inbox`, `anymark ls /`, `anymark tree / --depth 3`, `anymark find / "query"`, `anymark cat id:<ID>`',
        '- Write commands: `anymark capture <URL> --title "..." --note "..."`, `anymark mkdir <PATH>`, `anymark edit id:<ID> --note "..."`, `anymark mv id:<ID> id:<FOLDER_ID>`, `anymark rm id:<ID>`',
        '- Always export a backup before bulk deletions: `anymark export /tmp/anymark-backup.html`',
      ].join('\n');
    }

    if (skill === 'inbox-triage') {
      return [
        '请使用 AnyMark CLI 帮我整理 Chrome 书签的 Inbox 待办条目（参考仓库 `skills/anymark/SKILL.md`）：',
        `1. 先绑定当前 Profile：\`${useLine}\``,
        `2. 运行 \`anymark inbox${profileFlag}\` 查看待整理的书签，并运行 \`anymark tree / --depth 2${profileFlag}\` 了解现有目录结构。`,
        '3. 对 Inbox 中的每条书签：',
        '   - 判断最匹配的现有分类目录（若属于全新主题，可先用 `anymark mkdir` 创建目录）；',
        '   - 若缺少备注，用 `anymark edit id:<ID> --note "核心关键词与用途"` 补充简明备注；',
        '   - 用 `anymark mv id:<ID> id:<目标目录ID>` 归档到对应目录。',
        '4. 完成后向我汇报归档清单。',
      ].join('\n');
    }
    if (skill === 'dedupe-audit') {
      return [
        `请使用 AnyMark CLI 对「${currentName}」进行重复链接清理与目录体检（参考 \`skills/anymark/SKILL.md\`）：`,
        `1. 安全第一：先导出完整 HTML 备份 \`anymark export "/tmp/anymark-backup-$(date +%Y%m%d-%H%M%S).html"${profileFlag}\`。`,
        `2. 读取当前范围：运行 \`${currentTarget === 'inbox' ? `anymark inbox${profileFlag}` : `anymark tree '${currentTarget}' --depth 4${profileFlag}`}\`。`,
        '3. 检查以下问题并给出整理方案：',
        '   - 规范化 URL 后完全重复的书签（合并备注到保留项后，用 `anymark rm id:<重复ID>` 清理冗余项）；',
        '   - 空文件夹或命名混乱、层级过深的碎片目录。',
      ].join('\n');
    }
    if (skill === 'enrich-notes') {
      return [
        `请使用 AnyMark CLI 为「${currentName}」中缺少备注的书签批量补充本地检索备注（参考 \`skills/anymark/SKILL.md\`）：`,
        `1. 运行 \`${currentTarget === 'inbox' ? `anymark inbox${profileFlag}` : `anymark ls '${currentTarget}'${profileFlag}`}\` 获取条目列表。`,
        '2. 找出 `note` 为空的书签，结合其 `title`、URL 域名路径与所在目录语境，生成简明扼要的中英文检索关键词与用途说明。',
        `3. 依次执行 \`anymark edit id:<ID> --note "..."${profileFlag}\` 写入本地备注（不修改原书签标题和 URL）。`,
      ].join('\n');
    }
    return [
      '你可以使用本机的 AnyMark CLI 操作我的 Chrome 书签文件系统（详细规范见项目内 `skills/anymark/SKILL.md`）：',
      `- 绑定当前 Chrome Profile：\`${useLine}\``,
      '- 常用只读命令：`anymark status`、`anymark inbox`、`anymark ls /`、`anymark tree / --depth 3`、`anymark find / "关键词"`、`anymark cat id:<ID>`',
      '- 常用写入命令：`anymark capture <URL> --title "..." --note "..."`、`anymark mkdir <PATH>`、`anymark edit id:<ID> --note "..."`、`anymark mv id:<ID> id:<FOLDER_ID>`、`anymark rm id:<ID>`',
      '- 批量删除或大改前请务必先执行：`anymark export /tmp/anymark-backup.html`',
    ].join('\n');
  }
}
