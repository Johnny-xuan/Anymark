/**
 * 设置面板组件
 */

import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, Download, Upload, Trash2, AlertCircle, Cloud, CloudOff, RotateCw, FolderSync } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showToast } from '../../../components/Toast/ToastContainer';
import { getExportService } from '../../../services/exportService';
import { DEFAULT_USER_SETTINGS_V2, type UserSettingsV2 } from '../../../types/chromeBookmark';

import '../../../i18n/config';
import './Settings.css';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AIConfig {
  provider: string;
  apiKeys: string[];           // 向后兼容：当前 provider 的 key 放 [0]
  providerKeys: Record<string, string>; // 每个 provider 独立保存 key
  apiUrl?: string;
  modelId?: string;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<UserSettingsV2>(DEFAULT_USER_SETTINGS_V2);

  const updateSettings = (updates: Partial<UserSettingsV2>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      chrome.storage.local.set({ userSettings: next }).catch(() => {
        // ignore
      });
      return next;
    });
  };

  // 本地状态
  const [activeTab, setActiveTab] = useState<'ai' | 'ui' | 'data'>('ai');
  const [aiConfig, setAIConfig] = useState<AIConfig>({
    provider: 'custom',
    apiKeys: [],
    providerKeys: {},
    apiUrl: '',
    modelId: 'gpt-3.5-turbo',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);



  // Chrome 导入状态
  const [isImportingFromChrome, setIsImportingFromChrome] = useState(false);

  // 环境检查：检查是否在可用的浏览器环境中
  const isBrowserEnvironment = () => {
    return typeof document !== 'undefined' && typeof window !== 'undefined';
  };

  // 安全的确认对话框
  const safeConfirm = (message: string): boolean => {
    if (!isBrowserEnvironment()) {
      console.warn('[Settings] Browser environment not available, auto-confirming:', message);
      return true;
    }
    return window.confirm(message);
  };

  // 安全的文件选择
  const safeSelectFile = (accept: string, callback: (file: File | null) => void) => {
    if (!isBrowserEnvironment()) {
      showToast(t('sidebar.settings.messages.fileSelectUnavailable'), 'error');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0] || null;
      callback(file);
    };
    input.click();
  };

  // 安全的文件下载
  const safeDownload = (blob: Blob, filename: string): void => {
    if (!isBrowserEnvironment()) {
      console.warn('[Settings] Browser environment not available, cannot download:', filename);
      showToast(t('sidebar.settings.messages.downloadUnavailable'), 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 安全的页面刷新
  const safeReload = (delayMs: number = 0): void => {
    if (!isBrowserEnvironment()) {
      console.warn('[Settings] Browser environment not available, cannot reload page');
      showToast(t('sidebar.settings.messages.reloadUnavailable'), 'error');
      return;
    }
    if (delayMs > 0) {
      setTimeout(() => window.location.reload(), delayMs);
    } else {
      window.location.reload();
    }
  };

  type PixelBuddyTheme = 'classic' | 'cyber' | 'grow' | 'flare' | 'noir';

  const PIXEL_THEMES: Array<{
    id: PixelBuddyTheme;
    name: string;
    desc: string;
    persona: string;
    slogan: string;
    colors: [string, string, string];
  }> = [
      {
        id: 'classic',
        name: t('sidebar.settings.pixelThemes.classic.name'),
        desc: t('sidebar.settings.pixelThemes.classic.desc'),
        persona: t('sidebar.settings.pixelThemes.classic.persona'),
        slogan: t('sidebar.settings.pixelThemes.classic.slogan'),
        colors: ['#3b82f6', '#f56565', '#fbd38d'],
      },
      {
        id: 'cyber',
        name: t('sidebar.settings.pixelThemes.cyber.name'),
        desc: t('sidebar.settings.pixelThemes.cyber.desc'),
        persona: t('sidebar.settings.pixelThemes.cyber.persona'),
        slogan: t('sidebar.settings.pixelThemes.cyber.slogan'),
        colors: ['#8b5cf6', '#ec4899', '#c4b5fd'],
      },
      {
        id: 'grow',
        name: t('sidebar.settings.pixelThemes.grow.name'),
        desc: t('sidebar.settings.pixelThemes.grow.desc'),
        persona: t('sidebar.settings.pixelThemes.grow.persona'),
        slogan: t('sidebar.settings.pixelThemes.grow.slogan'),
        colors: ['#10b981', '#34d399', '#6ee7b7'],
      },
      {
        id: 'flare',
        name: t('sidebar.settings.pixelThemes.flare.name'),
        desc: t('sidebar.settings.pixelThemes.flare.desc'),
        persona: t('sidebar.settings.pixelThemes.flare.persona'),
        slogan: t('sidebar.settings.pixelThemes.flare.slogan'),
        colors: ['#f59e0b', '#f97316', '#fde68a'],
      },
      {
        id: 'noir',
        name: t('sidebar.settings.pixelThemes.noir.name'),
        desc: t('sidebar.settings.pixelThemes.noir.desc'),
        persona: t('sidebar.settings.pixelThemes.noir.persona'),
        slogan: t('sidebar.settings.pixelThemes.noir.slogan'),
        colors: ['#1a1a1a', '#00ff41', '#00ff41'],
      },
    ];

  // 预设配置 - 支持主流兼容 OpenAI API 格式的厂商
  // 模型名称来源于各厂商官方文档 (2026年2月)
  const AI_PROVIDERS = [
    // 国际大厂
    { id: 'openai', name: t('sidebar.settings.providers.openai'), url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-5.2' },
    { id: 'azure', name: 'Azure OpenAI', url: '', model: 'gpt-4o' },
    { id: 'anthropic', name: 'Anthropic Claude', url: 'https://api.anthropic.com/v1/messages', model: 'claude-opus-4-6' },
    { id: 'google', name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent', model: 'gemini-3-pro-preview' },
    { id: 'groq', name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
    { id: 'xai', name: 'xAI (Grok)', url: 'https://api.x.ai/v1/chat/completions', model: 'grok-4' },

    // 国内主流
    { id: 'doubao', name: t('sidebar.settings.providers.doubao'), url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-seed-1.8' },
    { id: 'moonshot', name: t('sidebar.settings.providers.moonshot'), url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
    { id: 'aliyun', name: t('sidebar.settings.providers.aliyun'), url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen3-max' },
    { id: 'yi', name: t('sidebar.settings.providers.yi'), url: 'https://api.yi.01.ai/v1/chat/completions', model: 'Yi-34B-Chat' },
    { id: 'deepseek', name: t('sidebar.settings.providers.deepseek'), url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
    { id: 'siliconflow', name: t('sidebar.settings.providers.siliconflow'), url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-ai/DeepSeek-V3.2' },
    { id: 'zhipu', name: t('sidebar.settings.providers.zhipu'), url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4.7' },
    { id: 'minimax', name: t('sidebar.settings.providers.minimax'), url: 'https://api.minimaxi.com/v1/chat/completions', model: 'MiniMax-M2.1' },
    { id: 'minimax-intl', name: t('sidebar.settings.providers.minimaxIntl'), url: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M2.1' },
    { id: 'aliyun-intl', name: t('sidebar.settings.providers.aliyunIntl'), url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
    { id: 'zhipu-intl', name: t('sidebar.settings.providers.zhipuIntl'), url: 'https://api.z.ai/api/paas/v4/chat/completions', model: 'glm-4.7' },

    // 聚合平台
    { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-5.2' },

    // 本地/其他
    { id: 'ollama', name: t('sidebar.settings.providers.ollama'), url: 'http://localhost:11434/v1/chat/completions', model: 'llama3.2' },
    { id: 'huggingface', name: 'HuggingFace', url: 'https://api-inference.huggingface.co/models/', model: '' },
    { id: 'custom', name: t('sidebar.settings.providers.custom'), url: '', model: '' },
  ];

  // 加载配置
  useEffect(() => {
    if (isOpen) {
      // 加载用户设置（用于保持界面与实际配置一致）
      chrome.storage.local.get(['userSettings'], (result) => {
        if (result.userSettings) {
          setSettings({
            ...DEFAULT_USER_SETTINGS_V2,
            ...(result.userSettings as Partial<UserSettingsV2>),
          });
        }
      });

      // 加载 AI 配置
      chrome.storage.local.get(['aiConfig'], (result) => {
        const config = result.aiConfig as any;
        if (config) {
          // 迁移：如果有旧的 apiKeys 但没有 providerKeys，把旧 key 迁移到当前 provider
          const existingProviderKeys: Record<string, string> = config.providerKeys || {};
          if (!config.providerKeys && config.apiKeys?.length > 0 && config.provider) {
            existingProviderKeys[config.provider] = config.apiKeys[0];
          }
          setAIConfig({
            provider: config.provider || 'custom',
            apiKeys: config.apiKeys || [],
            providerKeys: existingProviderKeys,
            apiUrl: config.apiUrl || '',
            modelId: config.modelId || 'gpt-3.5-turbo',
          });
        }
      });


    }
  }, [isOpen]);





  // 导出书签为 HTML
  const handleExportBookmarksHtml = async () => {
    try {
      const exportService = getExportService();
      await exportService.exportAndDownloadHTML();
      showToast(t('sidebar.settings.messages.exportedHtml'), 'success');
    } catch (error) {
      console.error('[Settings] 导出 HTML 失败:', error);
      showToast(t('sidebar.settings.messages.exportFailed'), 'error');
    }
  };

  const handlePixelThemeChange = async (themeId: PixelBuddyTheme) => {
    updateSettings({ pixelBuddyTheme: themeId });

    try {
      const stored = await chrome.storage.local.get(['userSettings']);
      const nextSettings = { ...(stored.userSettings || {}), pixelBuddyTheme: themeId };

      // 统一存储到 userSettings 中
      await chrome.storage.local.set({
        userSettings: nextSettings,
        pixelBuddyTheme: themeId,
        pixelBuddyThemeUpdatedAt: Date.now(), // 触发 Pixel Buddy 刷新
      });

      console.log('[Settings] Pixel theme saved and refresh triggered:', themeId);



      showToast(t('sidebar.settings.messages.themeChanged'), 'success');
    } catch (error) {
      console.error('[Settings] Failed to persist pixel theme:', error);
    }
  };

  // 保存角色并强制刷新角色
  const handleApplyTheme = async () => {
    const themeId = settings.pixelBuddyTheme;
    try {
      const stored = await chrome.storage.local.get(['userSettings']);
      const nextSettings = { ...(stored.userSettings || {}), pixelBuddyTheme: themeId };

      await chrome.storage.local.set({
        userSettings: nextSettings,
        pixelBuddyTheme: themeId,
        pixelBuddyThemeUpdatedAt: Date.now(),
      });



      try {
        localStorage.setItem('pixelBuddyTheme', themeId);
      } catch (error) {
        console.warn('[Settings] Failed to persist pixel theme to localStorage:', error);
      }

      showToast(t('sidebar.settings.messages.themeSaved'), 'success');
    } catch (error) {
      console.error('[Settings] Failed to save pixel theme:', error);
      showToast(t('sidebar.settings.messages.themeSaveFailed'), 'error');
    }
  };



  // 处理预设变更：切换 provider 时自动加载对应的 key 和预设 URL/model
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = e.target.value;
    const provider = AI_PROVIDERS.find(p => p.id === providerId);

    if (provider) {
      setAIConfig(prev => {
        // 先把当前 provider 的 key 保存到 providerKeys
        const currentKey = prev.providerKeys[prev.provider] || prev.apiKeys[0] || '';
        const updatedProviderKeys = { ...prev.providerKeys };
        if (currentKey) {
          updatedProviderKeys[prev.provider] = currentKey;
        }

        // 加载目标 provider 的 key
        const targetKey = updatedProviderKeys[providerId] || '';

        return {
          ...prev,
          provider: providerId,
          providerKeys: updatedProviderKeys,
          apiKeys: targetKey ? [targetKey] : [],
          apiUrl: providerId === 'custom' ? prev.apiUrl : provider.url,
          modelId: providerId === 'custom' ? prev.modelId : provider.model,
        };
      });
    }
  };

  if (!isOpen) return null;

  // 保存设置
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 确保当前 provider 的 key 同步到 providerKeys
      const currentKey = aiConfig.providerKeys[aiConfig.provider] || aiConfig.apiKeys[0] || '';
      const finalProviderKeys = { ...aiConfig.providerKeys };
      if (currentKey) {
        finalProviderKeys[aiConfig.provider] = currentKey;
      }

      // 当前激活的 key（向后兼容）
      const activeKey = finalProviderKeys[aiConfig.provider] || '';

      // 保存 AI 配置
      await chrome.storage.local.set({
        aiConfig: {
          provider: aiConfig.provider,
          apiKey: activeKey,
          apiKeys: activeKey ? [activeKey] : [],
          providerKeys: finalProviderKeys,
          apiUrl: aiConfig.apiUrl,
          modelId: aiConfig.modelId,
          endpoint: aiConfig.apiUrl,
          model: aiConfig.modelId,
        },
        userApiKey: activeKey,
        userApiUrl: aiConfig.apiUrl,
        userModelId: aiConfig.modelId,
      });

      // 保存用户设置
      await chrome.storage.local.set({ userSettings: settings });

      showToast(t('sidebar.settings.messages.saved'), 'success');
      onClose();
    } catch (error) {
      console.error('[Settings] Failed to save:', error);
      showToast(t('sidebar.settings.messages.saveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 测试 API 连接（支持云端 API 和本地 Ollama）
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);

    // 添加超时机制（30秒）
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 30000)
    );

    try {
      // Ollama 本地模型不需要 API Key
      if (aiConfig.provider === 'ollama') {
        const apiUrl = aiConfig.apiUrl || 'http://localhost:11434/v1/chat/completions';
        const modelId = aiConfig.modelId || 'deepseek-r1:7b';

        console.log('[Settings] Testing Ollama connection:', { apiUrl, modelId });
        showToast(t('sidebar.settings.messages.connecting'), 'info');

        const fetchPromise = fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              {
                role: 'user',
                content: 'Hi',
              },
            ],
            max_tokens: 5,
          }),
        });

        const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

        if (response.ok) {
          setConnectionTestResult({
            success: true,
            message: t('sidebar.settings.messages.connectionSuccess', { model: modelId })
          });
          showToast(t('sidebar.settings.messages.testSuccess'), 'success');
        } else {
          const errorText = await response.text();
          setConnectionTestResult({
            success: false,
            message: t('sidebar.settings.messages.connectionFailed', {
              status: response.status,
              error: errorText.substring(0, 100)
            })
          });
          showToast(t('sidebar.settings.messages.testFailed'), 'error');
        }
      } else {
        // 云端 API 需要 API Key
        const providerKey = aiConfig.providerKeys[aiConfig.provider] || '';
        if (!providerKey) {
          setConnectionTestResult({
            success: false,
            message: t('sidebar.settings.messages.noKeys')
          });
          setIsTestingConnection(false);
          return;
        }

        const apiUrl = aiConfig.apiUrl || 'https://api.openai.com/v1/chat/completions';
        const modelId = aiConfig.modelId || 'gpt-3.5-turbo';
        const apiKey = providerKey;

        console.log('[Settings] Testing API connection:', { apiUrl, modelId });

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              {
                role: 'user',
                content: 'Hello',
              },
            ],
            max_tokens: 5,
          }),
        });

        if (response.ok) {
          setConnectionTestResult({
            success: true,
            message: t('sidebar.settings.messages.connectionSuccess', { model: modelId })
          });
          showToast(t('sidebar.settings.messages.testSuccess'), 'success');
        } else {
          const errorText = await response.text();
          setConnectionTestResult({
            success: false,
            message: t('sidebar.settings.messages.connectionFailed', {
              status: response.status,
              error: errorText.substring(0, 100)
            })
          });
          showToast(t('sidebar.settings.messages.testFailed'), 'error');
        }
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('[Settings] Connection test failed:', error);

      // 超时错误处理（特别是 Ollama 首次加载模型）
      let displayError = errorMessage;
      if (errorMessage === 'timeout') {
        displayError = 'Request timeout. Ollama may still be loading the model. Try again after 10-20 seconds.';
      }

      setConnectionTestResult({
        success: false,
        message: t('sidebar.settings.messages.connectionError', { error: displayError })
      });
      showToast(t('sidebar.settings.messages.testError'), 'error');
    } finally {
      setIsTestingConnection(false);
    }
  };











  // 从 Chrome Native 重新导入书签到 AnyMark 文件夹（会清空现有内容）
  const handleImportFromChrome = async () => {
    // 确认操作（警告用户会清空现有 AnyMark 内容）
    const confirmed = safeConfirm(t('sidebar.settings.messages.reimportChromeConfirm'));
    if (!confirmed) return;

    setIsImportingFromChrome(true);
    showToast(t('sidebar.settings.messages.reimportChromeStarting'), 'info', 5000);

    try {
      // 检查 Chrome API 是否可用
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        throw new Error('Chrome API not available');
      }

      // 发送消息到 background 触发重新导入
      const response = await chrome.runtime.sendMessage({
        type: 'REIMPORT_FROM_CHROME'
      });

      console.log('[Settings] Reimport from Chrome response:', response);

      if (response.success) {
        const result = response.data;
        showToast(
          t('sidebar.settings.messages.reimportChromeSuccess', {
            bookmarks: result.importedBookmarks,
            folders: result.importedFolders
          }),
          'success',
          5000
        );

        // 等待一段时间后刷新页面
        safeReload(2000);
      } else {
        throw new Error(response.error || 'Import from Chrome failed');
      }
    } catch (error) {
      console.error('[Settings] Import from Chrome failed:', error);
      showToast(
        t('sidebar.settings.messages.reimportChromeFailed', { error: (error as Error).message }),
        'error',
        5000
      );
    } finally {
      setIsImportingFromChrome(false);
    }
  };



  // 重置设置
  const handleResetSettings = async () => {
    if (!safeConfirm(t('sidebar.settings.messages.confirmReset'))) {
      return;
    }

    try {
      await chrome.storage.local.remove(['userSettings', 'aiConfig']);
      showToast(t('sidebar.settings.messages.settingsReset'), 'success');
      safeReload();
    } catch (error) {
      console.error('[Settings] Reset failed:', error);
      showToast(t('sidebar.settings.messages.resetFailed'), 'error');
    }
  };

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-dialog">
        <div className="settings-header">
          <h2>{t('sidebar.settings.title')}</h2>
          <button className="settings-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-body">
          {/* 左侧导航 */}
          <div className="settings-sidebar">
            <button
              className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              {t('sidebar.settings.tabs.ai')}
            </button>

            <button
              className={`settings-tab ${activeTab === 'ui' ? 'active' : ''}`}
              onClick={() => setActiveTab('ui')}
            >
              {t('sidebar.settings.tabs.ui')}
            </button>
            <button
              className={`settings-tab ${activeTab === 'data' ? 'active' : ''}`}
              onClick={() => setActiveTab('data')}
            >
              {t('sidebar.settings.tabs.data')}
            </button>
          </div>

          {/* 右侧内容 */}
          <div className="settings-content">
            {/* AI 设置 */}
            {activeTab === 'ai' && (
              <div className="settings-section">
                <h3>{t('sidebar.settings.ai.title')}</h3>
                <p className="setting-desc">
                  {t('sidebar.settings.ai.description')}
                </p>

                <div className="setting-item">
                  <label>{t('sidebar.settings.ai.provider')}</label>
                  <select
                    value={aiConfig.provider}
                    onChange={handleProviderChange}
                    className="setting-select"
                  >
                    {AI_PROVIDERS.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="setting-item">
                  <label>{t('sidebar.settings.ai.apiUrl')}</label>
                  <input
                    type="text"
                    value={aiConfig.apiUrl || ''}
                    onChange={(e) => setAIConfig({ ...aiConfig, apiUrl: e.target.value, provider: 'custom' })}
                    placeholder={t('sidebar.settings.ai.apiUrlPlaceholder')}
                    className="text-input"
                    id="api-url"
                    name="apiUrl"
                  />
                  <p className="setting-desc">
                    {t('sidebar.settings.ai.apiUrlDesc')}
                  </p>
                </div>

                <div className="setting-item">
                  <label>{t('sidebar.settings.ai.modelId')}</label>
                  <input
                    type="text"
                    value={aiConfig.modelId || ''}
                    onChange={(e) => setAIConfig({ ...aiConfig, modelId: e.target.value, provider: 'custom' })}
                    placeholder={t('sidebar.settings.ai.modelIdPlaceholder')}
                    className="text-input"
                    id="model-id"
                    name="modelId"
                  />
                  <p className="setting-desc">
                    {t('sidebar.settings.ai.modelIdDesc')}
                  </p>
                </div>

                <div className="setting-item">
                  <label>{t('sidebar.settings.ai.currentConfig')}</label>
                  <div className="setting-value">
                    <div className="current-config">
                      <div><strong>{t('sidebar.settings.ai.currentConfigUrl')}</strong> {aiConfig.apiUrl || t('sidebar.settings.ai.defaultAddress')}</div>
                      <div><strong>{t('sidebar.settings.ai.currentConfigModel')}</strong> {aiConfig.modelId || t('sidebar.settings.ai.defaultModel')}</div>
                    </div>
                  </div>
                </div>

                <h3>{t('sidebar.settings.ai.keyManagement')}</h3>
                <div className="setting-item">
                  <label>API Key ({AI_PROVIDERS.find(p => p.id === aiConfig.provider)?.name || aiConfig.provider})</label>
                  <div className="api-key-input-group">
                    <input
                      type="password"
                      value={aiConfig.providerKeys[aiConfig.provider] || ''}
                      onChange={(e) => {
                        const newKey = e.target.value;
                        setAIConfig(prev => ({
                          ...prev,
                          providerKeys: { ...prev.providerKeys, [prev.provider]: newKey },
                          apiKeys: newKey ? [newKey] : [],
                        }));
                      }}
                      placeholder={aiConfig.provider === 'ollama' ? t('sidebar.settings.ai.ollamaNoKey', 'Ollama 本地模型无需 API Key') : t('sidebar.settings.ai.addKeyPlaceholder')}
                      className="api-key-input"
                      autoComplete="off"
                      id="provider-api-key"
                      name="providerApiKey"
                      disabled={aiConfig.provider === 'ollama'}
                    />
                  </div>
                  {aiConfig.provider !== 'ollama' && !aiConfig.providerKeys[aiConfig.provider] && (
                    <div className="setting-alert" style={{ marginTop: '8px' }}>
                      <AlertCircle size={16} />
                      <span>{t('sidebar.settings.ai.noKeysAlert')}</span>
                    </div>
                  )}
                  <p className="setting-desc">
                    {t('sidebar.settings.ai.keySecurityNote')}
                  </p>
                  {/* 显示已配置 key 的 provider 列表 */}
                  {Object.keys(aiConfig.providerKeys).filter(k => aiConfig.providerKeys[k]).length > 0 && (
                    <div className="configured-providers" style={{ marginTop: '12px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                        {t('sidebar.settings.ai.configuredProviders', '已配置 Key 的服务商')}:
                      </label>
                      <div className="api-keys-list">
                        {Object.entries(aiConfig.providerKeys)
                          .filter(([, key]) => key)
                          .map(([providerId]) => {
                            const providerName = AI_PROVIDERS.find(p => p.id === providerId)?.name || providerId;
                            const isActive = providerId === aiConfig.provider;
                            return (
                              <div key={providerId} className={`api-key-item ${isActive ? 'active' : ''}`}>
                                <span className="api-key-text">
                                  {isActive ? '✅ ' : '🔑 '}{providerName}
                                </span>
                                <button
                                  className="api-key-remove"
                                  onClick={() => {
                                    setAIConfig(prev => {
                                      const updated = { ...prev.providerKeys };
                                      delete updated[providerId];
                                      return {
                                        ...prev,
                                        providerKeys: updated,
                                        apiKeys: providerId === prev.provider ? [] : prev.apiKeys,
                                      };
                                    });
                                  }}
                                  title={t('common.buttons.delete', 'Delete')}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="setting-item">
                  <label>{t('sidebar.settings.ai.connectionTest')}</label>
                  <div className="connection-test">
                    <button
                      className="btn-secondary"
                      onClick={handleTestConnection}
                      disabled={isTestingConnection || (aiConfig.provider !== 'ollama' && !aiConfig.providerKeys[aiConfig.provider])}
                    >
                      {isTestingConnection ? (
                        <>
                          <RefreshCw size={16} className="spinning" />
                          {t('sidebar.settings.ai.testing')}
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          {t('sidebar.settings.ai.testButton')}
                        </>
                      )}
                    </button>
                    {connectionTestResult && (
                      <div className={`test-result ${connectionTestResult.success ? 'success' : 'error'}`}>
                        {connectionTestResult.success ? t('sidebar.settings.ai.testSuccess') : t('sidebar.settings.ai.testFailed')} {connectionTestResult.message}
                      </div>
                    )}
                  </div>
                  <p className="setting-desc">
                    {t('sidebar.settings.ai.testDesc')}
                  </p>
                </div>

                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.autoAnalyze}
                      onChange={(e) =>
                        updateSettings({ autoAnalyze: e.target.checked })
                      }
                    />
                    <span>{t('sidebar.settings.ai.autoAnalyze')}</span>
                  </label>
                  <p className="setting-desc">{t('sidebar.settings.ai.autoAnalyzeDesc')}</p>
                </div>

              </div>
            )}



            {/* 界面设置 */}
            {activeTab === 'ui' && (
              <div className="settings-section">
                <h3>{t('sidebar.settings.ui.language')}</h3>
                <div className="setting-item">
                  <label>{t('sidebar.settings.ui.languageLabel')}</label>
                  <select
                    value={i18n.language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      i18n.changeLanguage(newLang);
                      updateSettings({ language: newLang });
                      showToast(t('sidebar.settings.messages.languageChanged'), 'success');
                    }}
                    className="setting-select"
                    id="language"
                    name="language"
                  >
                    <option value="en">English</option>
                    <option value="zh-CN">简体中文</option>
                    <option value="ja">日本語</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                  </select>
                  <p className="setting-desc">
                    {t('sidebar.settings.ui.languageDesc')}
                  </p>
                </div>

                <h3>{t('sidebar.settings.ui.openMode')}</h3>
                <div className="setting-item">
                  <label>{t('sidebar.settings.ui.openModeLabel')}</label>
                  <select
                    value={settings.openMode || 'sidebar'}
                    onChange={(e) =>
                      updateSettings({
                        openMode: e.target.value as 'sidebar' | 'tab',
                      })
                    }
                    className="setting-select"
                    id="open-mode"
                    name="openMode"
                  >
                    <option value="sidebar">{t('sidebar.settings.ui.openModeSidebar')}</option>
                    <option value="tab">{t('sidebar.settings.ui.openModeTab')}</option>
                  </select>
                  <p className="setting-desc" dangerouslySetInnerHTML={{ __html: t('sidebar.settings.ui.openModeDesc') }} />
                </div>

                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.previewPanelVisible}
                      onChange={(e) =>
                        updateSettings({ previewPanelVisible: e.target.checked })
                      }
                      id="preview-panel-visible"
                      name="previewPanelVisible"
                    />
                    <span>{t('sidebar.settings.ui.previewPanel')}</span>
                  </label>
                </div>

                <div className="setting-item">
                  <label>{t('sidebar.settings.ui.previewPanelWidth', { width: settings.previewPanelWidth })}</label>
                  <input
                    type="range"
                    min="20"
                    max="50"
                    value={settings.previewPanelWidth}
                    onChange={(e) =>
                      updateSettings({ previewPanelWidth: Number(e.target.value) })
                    }
                    className="setting-slider"
                  />
                </div>

                <h3>{t('sidebar.settings.ui.pixelBuddy')}</h3>
                <div className="setting-item">
                  <label>{t('sidebar.settings.ui.pixelTheme')}</label>
                  <div className="pixel-theme-grid">
                    {PIXEL_THEMES.map((theme) => {
                      const isActive = settings.pixelBuddyTheme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          className={`pixel-theme-card ${isActive ? 'active' : ''}`}
                          onClick={() => handlePixelThemeChange(theme.id)}
                          aria-pressed={isActive}
                          title={t('sidebar.settings.pixelThemes.switchTo', { name: theme.name })}
                        >
                          <div
                            className="pixel-theme-preview"
                            style={{
                              ['--preview-body' as any]: theme.colors[0],
                              ['--preview-ribbon' as any]: theme.colors[1],
                              ['--preview-accent' as any]: theme.colors[2],
                            }}
                          >
                            <div className="pixel-preview-book">
                              <div className="pixel-preview-cover" />
                              <div className="pixel-preview-highlight" />
                              <div className="pixel-preview-ribbon" />
                            </div>
                          </div>
                          <div className="pixel-theme-info">
                            <div className="pixel-theme-title">
                              {theme.name}
                              {isActive && <span className="pixel-theme-selected">{t('sidebar.settings.ui.themeSelected')}</span>}
                            </div>
                            <div className="pixel-theme-desc">{theme.desc}</div>
                            <div className="pixel-theme-persona">{theme.persona}</div>
                            <div className="pixel-theme-slogan">{theme.slogan}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="setting-desc">
                    {t('sidebar.settings.ui.pixelThemeDesc')}
                  </p>
                  <button
                    className="btn-primary"
                    onClick={handleApplyTheme}
                    style={{ marginTop: '12px' }}
                  >
                    <Save size={16} />
                    {t('sidebar.settings.ui.saveTheme')}
                  </button>
                </div>
              </div>
            )}

            {/* 数据管理 */}
            {activeTab === 'data' && (
              <div className="settings-section">
                


                {/* Card 2: Re-import (Danger Zone) */}
                <div className="settings-card danger-zone">
                  <h3>
                    <RefreshCw size={18} />
                    {t('sidebar.settings.data.chromeReimport')}
                  </h3>
                  <p className="settings-card-desc">
                    {t('sidebar.settings.data.chromeReimportDesc')}
                  </p>
                  <div className="settings-card-content">
                    <button
                      className="btn-primary"
                      onClick={handleImportFromChrome}
                      disabled={isImportingFromChrome}
                      style={{ width: '100%' }}
                    >
                      <RefreshCw size={16} />
                      {isImportingFromChrome
                        ? t('sidebar.settings.data.reimporting')
                        : t('sidebar.settings.data.reimportFromChrome')
                      }
                    </button>
                  </div>
                </div>

                {/* Card 3: Backup & Restore */}
                <div className="settings-card">
                  <h3>
                    <Download size={18} />
                    {t('sidebar.settings.data.backupRestore')}
                  </h3>
                  <div className="settings-card-content">
                    <button 
                      className="btn-secondary" 
                      onClick={handleExportBookmarksHtml} 
                      title={t('sidebar.settings.data.exportAsHtmlDesc')}
                      style={{ width: '100%' }}
                    >
                      <Download size={16} />
                      {t('sidebar.settings.data.exportAsHtml')}
                    </button>
                    <p className="setting-desc" style={{ marginTop: '8px', fontSize: '12px' }}>
                      {t('sidebar.settings.data.importHint')}
                    </p>
                  </div>
                </div>

                {/* Card 4: Maintenance */}
                <div className="settings-card">
                  <h3>
                    <Trash2 size={18} />
                    {t('sidebar.settings.data.cleanup')}
                  </h3>
                  <div className="settings-card-content">
                    <button className="btn-danger" onClick={handleResetSettings} style={{ width: '100%' }} title={t('sidebar.settings.data.resetDesc')}>
                      <RefreshCw size={16} />
                      {t('sidebar.settings.data.resetSettings')}
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* 高级设置 */}
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t('common.buttons.cancel', 'Cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={16} />
            {isSaving ? t('sidebar.settings.messages.saving') : t('sidebar.settings.messages.saveSettings')}
          </button>
        </div>
      </div>
    </>
  );
};

export default Settings;
