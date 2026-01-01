/**
 * 快速收藏面板（Popup）
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Folder,
  Tag,
  FileText,
  ChevronDown,
  X,
  Loader,
  PanelLeftOpen,
  Sun,
  Moon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDefaultAnalyzer } from '../utils/aiAnalyzer';
import { getBookmarkService } from '../services/bookmarkService';
import '../i18n/config';
import './Popup.css';

interface QuickSaveData {
  title: string;
  url: string;
  favicon?: string;
  suggestedFolder?: string;
  suggestedTags?: string[];
  aiSummary?: string;
  aiCategory?: string;
  aiTechStack?: string[];
  aiConfidence?: number;
  aiDifficulty?: string;
}

const Popup: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(1);
  const [data, setData] = useState<QuickSaveData | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [filteredFolders, setFilteredFolders] = useState<string[]>([]);
  const [highlightedFolderIndex, setHighlightedFolderIndex] = useState(-1);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  // 初始化
  useEffect(() => {
    initializePopup();
  }, []);

  const initializePopup = async () => {
    setLoading(true);
    
    // 初始化主题
    try {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      const initialTheme = savedTheme || 'dark';
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    } catch (e) {
      console.warn('[Popup] Failed to load theme:', e);
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // 获取当前标签页信息
    await getCurrentTab();
    // 加载可用的文件夹列表
    await loadAvailableFolders();
    
    setLoading(false);
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setShowFolderDropdown(false);
      }
    };

    if (showFolderDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFolderDropdown]);

  const loadAvailableFolders = async () => {
    try {
      const bookmarkService = getBookmarkService();
      await bookmarkService.initialize();
      const tree = await bookmarkService.getBookmarkTree();
      
      const folders: string[] = [];
      
      // 递归收集文件夹路径
      const collectFolders = (node: chrome.bookmarks.BookmarkTreeNode, parentPath: string) => {
        // 跳过 AnyMark 根目录本身
        if (node.id === bookmarkService.getAnyMarkRootId()) {
          if (node.children) {
            node.children.forEach(child => collectFolders(child, ''));
          }
          return;
        }

        // 如果是文件夹（没有 URL）
        if (!node.url) {
          const currentPath = parentPath === '' ? `/${node.title}` : `${parentPath}/${node.title}`;
          folders.push(currentPath);
          
          if (node.children) {
            node.children.forEach(child => collectFolders(child, currentPath));
          }
        }
      };

      if (tree) {
        collectFolders(tree, '');
      }

      // 添加一些默认文件夹（使用翻译键）
      const defaultFolders = [
        '/' + t('folder.uncategorized'),
        '/' + t('folder.bookmarks'),
        '/' + t('folder.work'),
        '/' + t('folder.learning'),
        '/' + t('folder.development'),
      ];
      
      const allFolders = Array.from(new Set([...defaultFolders, ...folders])).sort();

      setAvailableFolders(allFolders);
      setFilteredFolders(allFolders);
    } catch (error) {
      console.error('[Popup] Failed to load folders:', error);
      setAvailableFolders(['/' + t('folder.uncategorized')]);
      setFilteredFolders(['/' + t('folder.uncategorized')]);
    }
  };

  const getCurrentTab = async () => {
    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab) {
        const pageData: QuickSaveData = {
          title: tab.title || '',
          url: tab.url || '',
          favicon: tab.favIconUrl,
        };

        setData(pageData);

        // 开始AI分析
        analyzeWithAI();
      }
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  };

  const analyzeWithAI = async () => {
    setAnalyzing(true);
    setAnalysisStep(1);

    try {
      // 步骤1: 提取页面内容
      setAnalysisStep(1);
      console.log('[Popup] Step 1: Extracting page content...');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) throw new Error('No active tab');
      
      // 检查是否是特殊页面（不能注入脚本）
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        throw new Error('Cannot analyze special browser pages');
      }

      // 注入增强的内容提取脚本
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // 增强的内联内容提取器
          class EnhancedContentExtractor {
            static extract() {
              const getMetaDescription = () => {
                const selectors = [
                  'meta[name="description"]',
                  'meta[property="og:description"]',
                  'meta[name="twitter:description"]'
                ];
                for (const sel of selectors) {
                  const meta = document.querySelector(sel);
                  const content = meta?.getAttribute('content');
                  if (content && content.length > 20) return content;
                }
                return '';
              };

              const getKeywords = () => {
                const meta = document.querySelector('meta[name="keywords"]');
                return meta?.getAttribute('content') || '';
              };

              // 智能查找主内容区域
              const findMainElement = () => {
                const selectors = [
                  'article',
                  'main',
                  '[role="main"]',
                  '.post-content',
                  '.article-content',
                  '.entry-content',
                  '#content',
                  '.content',
                  '.main-content'
                ];

                for (const sel of selectors) {
                  const el = document.querySelector(sel);
                  if (el) {
                    const text = el.textContent?.trim() || '';
                    if (text.length > 100) return el;
                  }
                }
                return null;
              };

              // 智能截断（保留完整句子）
              const smartTruncate = (text: string, maxLength: number) => {
                if (text.length <= maxLength) return text;

                const truncated = text.substring(0, maxLength);
                const lastPunctuation = Math.max(
                  truncated.lastIndexOf('。'),
                  truncated.lastIndexOf('！'),
                  truncated.lastIndexOf('？'),
                  truncated.lastIndexOf('. '),
                  truncated.lastIndexOf('! '),
                  truncated.lastIndexOf('? ')
                );

                if (lastPunctuation > maxLength * 0.7) {
                  return truncated.substring(0, lastPunctuation + 1);
                }

                return truncated + '...';
              };

              // 提取主要内容（增加到1500字符）
              const getMainContent = () => {
                const mainEl = findMainElement();
                if (mainEl) {
                  let text = mainEl.textContent || '';
                  text = text.replace(/\s+/g, ' ').trim();
                  return smartTruncate(text, 1500);
                }

                // 降级：提取所有段落
                const paragraphs = Array.from(document.querySelectorAll('p'))
                  .map(p => p.textContent?.trim() || '')
                  .filter(text => text.length > 50 && text.length < 500)
                  .slice(0, 5);

                const combined = paragraphs.join(' ');
                return smartTruncate(combined, 1500);
              };

              // 获取标题结构
              const getHeadings = () => {
                const headings: string[] = [];
                const selectors = ['h1', 'h2', 'h3'];

                selectors.forEach(tag => {
                  document.querySelectorAll(tag).forEach(heading => {
                    const text = heading.textContent?.trim() || '';
                    if (text.length > 3 && text.length < 100) {
                      headings.push(text);
                    }
                  });
                });

                return headings.slice(0, 8).join(' | ');
              };

              // 获取第一段
              const getFirstParagraph = () => {
                const paragraphs = document.querySelectorAll('p');
                for (const p of paragraphs) {
                  const text = p.textContent?.trim() || '';
                  if (text.length > 50 && text.length < 500) {
                    return smartTruncate(text, 200);
                  }
                }
                return '';
              };

              // 构建结构化内容
              const buildStructuredContent = () => {
                const parts: string[] = [];
                
                const title = document.title;
                if (title) parts.push(`【标题】${title}`);

                const desc = getMetaDescription();
                if (desc) parts.push(`【描述】${desc}`);

                const firstPara = getFirstParagraph();
                if (firstPara) parts.push(`【开篇】${firstPara}`);

                const headings = getHeadings();
                if (headings) parts.push(`【章节】${headings}`);

                const keywords = getKeywords();
                if (keywords) parts.push(`【关键词】${keywords}`);

                const mainContent = getMainContent();
                if (mainContent) parts.push(`【正文】${mainContent}`);

                return parts.join('\n\n');
              };

              return {
                url: window.location.href,
                title: document.title,
                description: getMetaDescription(),
                keywords: getKeywords(),
                bodyText: buildStructuredContent(),
              };
            }
          }
          return EnhancedContentExtractor.extract();
        },
      });

      // 安全获取结果
      const extractedContent = results?.[0]?.result || null;
      if (!extractedContent) {
        throw new Error('Failed to extract content');
      }
      console.log('[Popup] Extracted content:', extractedContent);

      // 步骤2: AI 分析
      setAnalysisStep(2);
      console.log('[Popup] Step 2: AI analyzing...');

      // 获取用户现有的文件夹和书签（用于智能推荐）
      const result = await chrome.storage.local.get('bookmarks');
      const bookmarks = (result.bookmarks || []) as any[];

      // 提取所有不重复的文件夹路径
      const existingFolders = Array.from(new Set(
        bookmarks
          .map((b: any) => b.folderPath)
          .filter((path: string) => path && path !== '/')
      )).slice(0, 20) as string[]; // 最多传递 20 个文件夹

      // 提取最近使用的文件夹（最近 10 个书签的文件夹）
      const recentFolders = Array.from(new Set(
        bookmarks
          .sort((a: any, b: any) => (b.createTime || 0) - (a.createTime || 0))
          .slice(0, 10)
          .map((b: any) => b.folderPath)
          .filter((path: string) => path && path !== '/')
      )) as string[];

      console.log('[Popup] Context for AI:', { existingFolders, recentFolders });

      const analyzer = await getDefaultAnalyzer();
      const analysis = await analyzer.analyzeBookmark(extractedContent, {
        recentBookmarks: bookmarks.slice(0, 10) as any[],
      });
      
      console.log('[Popup] AI Analysis result:', analysis);

      // 步骤3: 准备保存
      setAnalysisStep(3);
      console.log('[Popup] Step 3: Ready to save!');

      // 更新状态
      // 注意：IAIAnalysis 不再包含 category/subcategory/suggestedFolder
      // 这些字段已移除，由 Agent 负责分类
      const suggestedFolder = '/' + t('folder.uncategorized');
      
      setData((prev) => prev ? { 
        ...prev, 
        suggestedFolder,
        suggestedTags: analysis.tags,
        aiSummary: analysis.summary,
        // aiCategory 不再由 AI 分析返回，保持 undefined
        aiCategory: undefined,
        aiTechStack: [],
        aiConfidence: Math.round((analysis.confidence || 0.5) * 100),
        aiDifficulty: analysis.difficulty,
      } : null);
      
      setSelectedFolder(suggestedFolder);
      setTags(analysis.tags);
      
      // 完成
      setTimeout(() => {
        setAnalyzing(false);
        setAnalysisStep(3);
      }, 500);
      
    } catch (error) {
      console.error('[Popup] AI analysis failed:', error);
      
      // 降级到简单分析
      const fallbackFolder = '/' + t('folder.uncategorized', '未分类');
      const fallbackTags = ['untagged'];
      
      setData((prev) => prev ? { 
        ...prev, 
        suggestedFolder: fallbackFolder,
        suggestedTags: fallbackTags,
        aiSummary: t('popup.aiUnavailable', 'AI 分析暂不可用'),
      } : null);
      
      setSelectedFolder(fallbackFolder);
      setTags(fallbackTags);
      setAnalyzing(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
      tagInputRef.current?.focus();
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleToggleFolderDropdown = () => {
    setShowFolderDropdown(!showFolderDropdown);
  };

  const handleSelectFolder = (folder: string) => {
    setSelectedFolder(folder);
    setShowFolderDropdown(false);
  };

  const handleFolderInputChange = (value: string) => {
    setSelectedFolder(value);

    // 实时过滤文件夹列表
    if (value.trim()) {
      const filtered = availableFolders.filter(folder =>
        folder.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredFolders(filtered);
      setShowFolderDropdown(true); // 自动展开下拉菜单
      setHighlightedFolderIndex(-1); // 重置高亮索引
    } else {
      setFilteredFolders(availableFolders);
      setHighlightedFolderIndex(-1);
    }
  };

  // 检查是否是新文件夹（不存在于列表中）
  const isNewFolder = () => {
    const trimmedFolder = selectedFolder.trim();
    return trimmedFolder && !availableFolders.includes(trimmedFolder);
  };

  const handleFolderInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 下拉菜单打开时的键盘导航
    if (showFolderDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedFolderIndex(prev =>
          prev < filteredFolders.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedFolderIndex(prev => prev > 0 ? prev - 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // 如果有高亮的项，选择它
        if (highlightedFolderIndex >= 0 && highlightedFolderIndex < filteredFolders.length) {
          handleSelectFolder(filteredFolders[highlightedFolderIndex]);
        } else {
          // 否则只关闭下拉菜单
          setShowFolderDropdown(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowFolderDropdown(false);
        setHighlightedFolderIndex(-1);
      }
    }
    // 如果下拉菜单未打开，回车键会被全局 handleKeyDown 处理，触发保存
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // 检查焦点是否在标签输入框
      if (document.activeElement === tagInputRef.current) {
        handleAddTag();
      }
      // 检查焦点是否在文件夹输入框且菜单已关闭
      else if (document.activeElement === folderInputRef.current && showFolderDropdown) {
        // 文件夹下拉菜单打开时，由 handleFolderInputKeyDown 处理
        return;
      }
      // 其他情况（包括文件夹输入框菜单关闭时）都保存
      else {
        handleSave();
      }
    } else if (e.key === 'Escape') {
      window.close();
    }
  };

  const handleSave = async () => {
    if (!data) return;

    try {
      const bookmarkData = {
        url: data.url,
        title: data.title,
        favicon: data.favicon,
        folderPath: selectedFolder,
        aiTags: tags,
        aiSummary: data.aiSummary,
        aiCategory: data.aiCategory,
        aiConfidence: data.aiConfidence,
        aiDifficulty: data.aiDifficulty,
        aiTechStack: data.aiTechStack,
      };

      console.log('[Popup] Sending SAVE_BOOKMARK to background:', bookmarkData);

      // 发送消息给 background 处理保存（支持 V2 架构）
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_BOOKMARK',
        data: bookmarkData
      });

      if (response && response.success) {
        console.log('[Popup] Bookmark saved successfully');
        setTimeout(() => {
          window.close();
        }, 300);
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('[Popup] Failed to save bookmark:', error);
      alert('Failed to save bookmark: ' + (error as Error).message);
    }
  };

  const handleCancel = () => {
    window.close();
  };

  const handleOpenSidePanel = async () => {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (!currentWindow?.id) {
        throw new Error('No valid window found');
      }
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      // 不关闭 popup，让用户看到侧边栏已打开
    } catch (error) {
      console.error('[Popup] Failed to open side panel:', error);
      alert(t('popup.hints.cannotOpenSidebar'));
    }
  };

  const handleToggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  if (loading) {
    return (
      <div className="popup">
        <div className="popup-loading">
          <Loader size={32} className="spin" />
          <p>{t('common.messages.loading')}</p>
        </div>
      </div>
    );
  }

  if (analyzing) {
    return (
      <div className="popup">
        <div className="popup-analyzing">
          <Loader size={32} className="spin" />
          <h3>{t('sidebar.analysis.analyzing')}</h3>
          <div className="analysis-steps">
            <div className={`step ${analysisStep >= 1 ? 'active' : ''} ${analysisStep > 1 ? 'done' : ''}`}>
              {analysisStep > 1 ? '✓' : '1'} {t('chat.tools.analyzing')}
            </div>
            <div className={`step ${analysisStep >= 2 ? 'active' : ''} ${analysisStep > 2 ? 'done' : ''}`}>
              {analysisStep > 2 ? '✓' : '2'} {t('sidebar.analysis.analyzing')}
            </div>
            <div className={`step ${analysisStep >= 3 ? 'active' : ''}`}>
              {analysisStep >= 3 ? '✓' : '3'} {t('common.buttons.save')}
            </div>
          </div>
          <p className="analysis-hint">{t('common.messages.info')}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="popup">
        <div className="popup-error">
          <p>{t('common.messages.error')}</p>
          <button onClick={handleCancel}>{t('common.buttons.close')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="popup" onKeyDown={handleKeyDown}>
      {/* 头部 */}
      <div className="popup-header">
        <h2>{t('popup.saveCurrentPage')}</h2>
        <div className="header-actions">
          <button
            className="theme-toggle-button"
            onClick={handleToggleTheme}
            title={t('sidebar.header.theme')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="close-button" onClick={handleCancel}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="popup-content">
        {/* 页面信息卡片 */}
        <div className="page-info">
          {data.favicon && (
            <img src={data.favicon} alt="Page icon" className="page-favicon" />
          )}
          <div className="page-details">
            <input
              ref={titleInputRef}
              type="text"
              className="page-title-input"
              value={data.title}
              onChange={(e) => setData({ ...data, title: e.target.value })}
              placeholder={t('popup.placeholders.pageTitle')}
            />
            <input
              type="url"
              className="page-url-input"
              value={data.url}
              onChange={(e) => setData({ ...data, url: e.target.value })}
              placeholder={t('popup.placeholders.pageUrl')}
              readOnly
            />
          </div>
        </div>


        {/* 目录选择 */}
        <div className="form-group">
          <label>
            <Folder size={16} />
            {t('sidebar.bookmarks.moveToFolder')}
          </label>
          <div className="folder-select" ref={folderDropdownRef}>
            <input
              ref={folderInputRef}
              type="text"
              value={selectedFolder}
              onChange={(e) => handleFolderInputChange(e.target.value)}
              onFocus={() => setShowFolderDropdown(true)}
              onKeyDown={handleFolderInputKeyDown}
              placeholder={t('sidebar.search.placeholder')}
            />
            <button
              className="select-button"
              onClick={handleToggleFolderDropdown}
              type="button"
            >
              <ChevronDown size={16} />
            </button>

            {/* 下拉菜单 */}
            {showFolderDropdown && (
              <div className="folder-dropdown">
                {/* 新建文件夹提示 */}
                {isNewFolder() && (
                  <div className="folder-item new-folder" onClick={() => setShowFolderDropdown(false)}>
                    <Folder size={14} />
                    <span>{t('common.buttons.save')}: <strong>{selectedFolder}</strong></span>
                  </div>
                )}

                {/* 匹配的文件夹列表 */}
                {filteredFolders.length > 0 ? (
                  filteredFolders.map((folder, index) => (
                    <div
                      key={folder}
                      className={`folder-item ${
                        selectedFolder === folder ? 'selected' : ''
                      } ${
                        highlightedFolderIndex === index ? 'highlighted' : ''
                      }`}
                      onClick={() => handleSelectFolder(folder)}
                      onMouseEnter={() => setHighlightedFolderIndex(index)}
                    >
                      <Folder size={14} />
                      <span>{folder}</span>
                    </div>
                  ))
                ) : (
                  <div className="folder-item no-results">
                    {t('sidebar.search.noResults')}
                  </div>
                )}
              </div>
            )}
          </div>
          {data.suggestedFolder && selectedFolder !== data.suggestedFolder && (
            <div className="suggestion">
              {t('chat.suggestions.title')}: <button onClick={() => setSelectedFolder(data.suggestedFolder!)}>
                {data.suggestedFolder}
              </button>
            </div>
          )}
        </div>

        {/* 标签 */}
        <div className="form-group">
          <label>
            <Tag size={16} />
            {t('sidebar.preview.tags')}
          </label>
          <div className="tags-container">
            <div className="tags-list">
              {tags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                  <button
                    className="tag-remove"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={t('popup.labels.removeTag')}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="tag-input-row">
              <input
                ref={tagInputRef}
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder={t('popup.placeholders.tagName')}
                className="tag-input-field"
                id="tag-input"
                name="tagInput"
              />
              <button
                className="tag-add-button"
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                aria-label={t('popup.labels.addTag')}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* AI摘要和分析结果 */}
        {data.aiSummary && (
          <div className="ai-results">
            <div className="ai-header">
              <Sparkles size={16} />
              <span>{t('sidebar.header.aiAnalyze')}</span>
              {data.aiConfidence && (
                <span className="confidence">{data.aiConfidence}% {t('sidebar.preview.confidence')}</span>
              )}
            </div>
            
            <div className="form-group">
              <label>
                <FileText size={16} />
                {t('sidebar.preview.summary')}
              </label>
              <textarea
                className="summary-textarea"
                value={data.aiSummary}
                onChange={(e) => setData({ ...data, aiSummary: e.target.value })}
                placeholder={t('sidebar.preview.summary')}
                rows={3}
              />
            </div>

            {data.aiCategory && (
              <div className="ai-meta">
                <div className="meta-item">
                  <span className="meta-label">{t('sidebar.preview.category')}:</span>
                  <span className="meta-value category-badge">{data.aiCategory}</span>
                </div>
                {data.aiDifficulty && (
                  <div className="meta-item">
                    <span className="meta-label">{t('popup.labels.difficulty')}:</span>
                    <span className="meta-value difficulty-badge">{data.aiDifficulty}</span>
                  </div>
                )}
                {data.aiTechStack && data.aiTechStack.length > 0 && (
                  <div className="meta-item tech-stack">
                    <span className="meta-label">{t('popup.labels.techStack')}:</span>
                    <div className="tech-tags">
                      {data.aiTechStack.map(tech => (
                        <span key={tech} className="tech-tag">{tech}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="popup-footer">
        <button 
          className="button button-secondary" 
          onClick={handleCancel}
          title={t('common.buttons.cancel')}
        >
          {t('common.buttons.cancel')}
        </button>
        <button
          className="button button-primary"
          onClick={handleSave}
          disabled={!selectedFolder}
          title="Enter"
        >
          {t('common.buttons.save')}
        </button>
      </div>

      {/* 快捷操作栏 */}
      <div className="popup-actions">
        <button className="action-button" onClick={handleOpenSidePanel}>
          <PanelLeftOpen size={14} />
          <span>{t('popup.openSidebar')}</span>
        </button>
        <div className="keyboard-hints">
          <kbd>↵</kbd>
          <kbd>⎋</kbd>
        </div>
      </div>
    </div>
  );
};

export default Popup;
