import { getStatus, setEnabled, reconnect } from '../extension/ui-api.js';
import { getLang, setLang, t, onLangChange } from '../extension/i18n.js';
import { getThemeMode, setThemeMode, onThemeChange } from '../extension/icons.js';

const STARTUP_KEY = 'anymark.startupScope';

export function getStartupScope() {
  try {
    const val = localStorage.getItem(STARTUP_KEY);
    return ['inbox', 'all', 'graph'].includes(val) ? val : 'inbox';
  } catch { return 'inbox'; }
}

export function setStartupScope(scope) {
  try {
    if (['inbox', 'all', 'graph'].includes(scope)) localStorage.setItem(STARTUP_KEY, scope);
  } catch {}
}

export class SettingsPanel {
  constructor({ agentHub, onStatusChange, onOpenTransfer, notify }) {
    this.agentHub = agentHub;
    this.onStatusChange = onStatusChange;
    this.onOpenTransfer = onOpenTransfer;
    this.notify = notify;
    this.dialog = document.getElementById('settings-dialog');
    this.busy = false;
    this.status = null;

    this.bindEvents();
    onLangChange(() => this.render());
    onThemeChange(() => this.renderThemeButtons());
  }

  bindEvents() {
    if (!this.dialog) return;
    for (const id of ['settings-close', 'settings-done']) {
      document.getElementById(id)?.addEventListener('click', () => this.close());
    }
    this.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.close();
    });

    // Tabs
    for (const tabBtn of this.dialog.querySelectorAll('[data-settings-tab]')) {
      tabBtn.addEventListener('click', () => this.switchTab(tabBtn.dataset.settingsTab));
    }

    // Language buttons
    document.getElementById('settings-lang-group')?.addEventListener('click', event => {
      const btn = event.target.closest('[data-lang]');
      if (btn?.dataset.lang) {
        setLang(btn.dataset.lang);
        this.render();
      }
    });

    // Theme buttons
    document.getElementById('settings-theme-group')?.addEventListener('click', event => {
      const btn = event.target.closest('[data-theme-mode]');
      if (btn?.dataset.themeMode) {
        setThemeMode(btn.dataset.themeMode);
        this.renderThemeButtons();
      }
    });

    // Startup view buttons
    document.getElementById('settings-startup-group')?.addEventListener('click', event => {
      const btn = event.target.closest('[data-startup]');
      if (btn?.dataset.startup) {
        setStartupScope(btn.dataset.startup);
        this.renderStartupButtons();
      }
    });

    // Show Relay Hub toggle
    document.getElementById('settings-show-hub')?.addEventListener('change', event => {
      this.agentHub?.setOpen(event.target.checked);
    });

    // Agent enable toggle
    document.getElementById('settings-agent-enabled')?.addEventListener('change', event => {
      void this.runAgentAction(() => setEnabled(event.target.checked));
    });

    // Reconnect button
    document.getElementById('settings-agent-reconnect')?.addEventListener('click', () => {
      void this.runAgentAction(() => reconnect());
    });

    // Copy CLI command
    document.getElementById('settings-copy-cli')?.addEventListener('click', () => {
      const cmd = document.getElementById('settings-cli-code')?.textContent || '';
      if (cmd) void this.copyText(cmd, t('agent.cmdCopied', { cmd }));
    });

    // Copy MCP JSON
    document.getElementById('settings-copy-mcp')?.addEventListener('click', () => {
      const json = document.getElementById('settings-mcp-code')?.textContent || '';
      if (json) void this.copyText(json, t('settings.agent.mcpCopied'));
    });

    // Open Transfer from Settings
    document.getElementById('settings-open-transfer')?.addEventListener('click', () => {
      this.close();
      this.onOpenTransfer?.();
    });
  }

  switchTab(tabName) {
    for (const btn of this.dialog.querySelectorAll('[data-settings-tab]')) {
      const active = btn.dataset.settingsTab === tabName;
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
    }
    for (const panel of this.dialog.querySelectorAll('[data-settings-panel]')) {
      panel.hidden = panel.dataset.settingsPanel !== tabName;
    }
  }

  async open(initialTab = 'general') {
    if (!this.dialog) return;
    this.switchTab(initialTab);
    this.render();
    this.dialog.showModal();
    await this.refreshStatus();
  }

  close() {
    if (this.busy) return;
    this.dialog?.close();
  }

  async refreshStatus() {
    try {
      this.status = await getStatus();
      this.onStatusChange?.(this.status);
      this.renderAgentSection();
    } catch {}
  }

  async runAgentAction(action) {
    if (this.busy) return;
    this.busy = true;
    const toggle = document.getElementById('settings-agent-enabled');
    const reconn = document.getElementById('settings-agent-reconnect');
    if (toggle) toggle.disabled = true;
    if (reconn) reconn.disabled = true;
    try {
      this.status = await action();
      this.onStatusChange?.(this.status);
    } catch (error) {
      this.notify(error.message || 'Operation failed', 'error');
    } finally {
      this.busy = false;
      this.renderAgentSection();
    }
  }

  async copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      this.notify(message);
    } catch {}
  }

  render() {
    this.renderLangButtons();
    this.renderThemeButtons();
    this.renderStartupButtons();
    const hubCheckbox = document.getElementById('settings-show-hub');
    if (hubCheckbox && this.agentHub) hubCheckbox.checked = this.agentHub.isOpen();
    this.renderAgentSection();
  }

  renderLangButtons() {
    const active = getLang();
    for (const btn of document.querySelectorAll('#settings-lang-group [data-lang]')) {
      const isCurrent = btn.dataset.lang === active;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-pressed', String(isCurrent));
    }
  }

  renderThemeButtons() {
    const active = getThemeMode();
    for (const btn of document.querySelectorAll('#settings-theme-group [data-theme-mode]')) {
      const isCurrent = btn.dataset.themeMode === active;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-pressed', String(isCurrent));
    }
  }

  renderStartupButtons() {
    const active = getStartupScope();
    for (const btn of document.querySelectorAll('#settings-startup-group [data-startup]')) {
      const isCurrent = btn.dataset.startup === active;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-pressed', String(isCurrent));
    }
  }

  renderAgentSection() {
    const st = this.status;
    const toggle = document.getElementById('settings-agent-enabled');
    const stateBadge = document.getElementById('settings-agent-state');
    const reconn = document.getElementById('settings-agent-reconnect');
    const profileInput = document.getElementById('settings-profile-id');
    const cliCode = document.getElementById('settings-cli-code');
    const mcpCode = document.getElementById('settings-mcp-code');

    if (toggle) {
      toggle.checked = Boolean(st?.enabled);
      toggle.disabled = this.busy;
    }
    if (stateBadge) {
      const s = st?.state || 'disabled';
      stateBadge.dataset.state = s;
      stateBadge.textContent = t(`popup.state.${s}`);
    }
    if (reconn) {
      reconn.hidden = !st?.enabled || st?.state !== 'disconnected';
      reconn.disabled = this.busy;
    }
    const pid = st?.profileId || 'PROFILE_ID';
    if (profileInput) profileInput.value = pid;
    if (cliCode) cliCode.textContent = `anymark use ${pid}`;
    if (mcpCode) {
      mcpCode.textContent = JSON.stringify({
        mcpServers: {
          anymark: {
            command: 'anymark',
            args: ['mcp', '--profile', pid],
          },
        },
      }, null, 2);
    }
  }
}
