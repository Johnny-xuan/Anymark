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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDefaultAnalyzer } from '../utils/aiAnalyzer';
import '../i18n/config';
import './Popup.css';

interface QuickSaveData {
  title: string;
  url: string;
  favicon?: string;
  suggestedFolder?: string;
  suggestedTags?: string[];
  aiSummary?: string;
  aiConfidence?: number;
}

const Popup: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [analysisStep, setAnalysisStep] = useState(0); // 0=初始化, 1=提取, 2=AI分析, 3=准备完成
  const [data, setData] = useState<QuickSaveData | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [filteredFolders, setFilteredFolders] = useState<string[]>([]);
  const [highlightedFolderIndex, setHighlightedFolderIndex] = useState(-1);
  const [bookmarksBarName, setBookmarksBarName] = useState('Bookmarks Bar');

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
      document.documentElement.setAttribute('data-theme', savedTheme || 'dark');
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // 先加载文件夹列表（AI 分析需要参考已有文件夹）
    const folders = await loadAvailableFolders();
    // 再获取当前标签页信息（会触发 AI 分析，直接传入 folders 避免 state 延迟）
    await getCurrentTab(folders);
    
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

  const loadAvailableFolders = async (): Promise<string[]> => {
    try {
      // 直接使用 Chrome 原生书签树，获取真实路径
      const chromeTree = await chrome.bookmarks.getTree();
      const root = chromeTree[0]; // 虚拟根 "0"

      const folders: string[] = [];

      // 递归收集文件夹路径
      const collectFolders = (node: chrome.bookmarks.BookmarkTreeNode, parentPath: string) => {
        if (!node.url && node.title) {
          const currentPath = `${parentPath}/${node.title}`;
          folders.push(currentPath);

          if (node.children) {
            node.children.forEach(child => collectFolders(child, currentPath));
          }
        }
      };

      // 只遍历 Bookmarks Bar ("1") 和 Other Bookmarks ("2")
      if (root?.children) {
        for (const topLevel of root.children) {
          if (topLevel.id === '1' || topLevel.id === '2') {
            // 把顶级文件夹本身加入列表
            const topPath = `/${topLevel.title}`;
            folders.push(topPath);

            if (topLevel.children) {
              topLevel.children.forEach(child => collectFolders(child, topPath));
            }
          }
        }
      }

      // 获取 Bookmarks Bar 的名称（可能因语言不同）
      const barName = root?.children?.find(c => c.id === '1')?.title || 'Bookmarks Bar';
      setBookmarksBarName(barName);

      // 默认文件夹（都放在 Bookmarks Bar 下）
      const defaultFolders = [
        `/${barName}/${t('folder.uncategorized')}`,
        `/${barName}/${t('folder.work')}`,
        `/${barName}/${t('folder.learning')}`,
        `/${barName}/${t('folder.development')}`,
      ];

      const allFolders = Array.from(new Set([...folders, ...defaultFolders])).sort();

      setAvailableFolders(allFolders);
      setFilteredFolders(allFolders);
      return allFolders;
    } catch (error) {
      console.error('[Popup] Failed to load folders:', error);
      const fallback = ['/Bookmarks Bar'];
      setAvailableFolders(fallback);
      setFilteredFolders(fallback);
      return fallback;
    }
  };

  const getCurrentTab = async (folders: string[]) => {
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

        // 开始AI分析（直接传入 folders，不依赖 React state）
        await analyzeWithAI(folders);
      }
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  };

  const analyzeWithAI = async (folders: string[]) => {
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
                if (title) parts.push(`[Title] ${title}`);

                const desc = getMetaDescription();
                if (desc) parts.push(`[Description] ${desc}`);

                const firstPara = getFirstParagraph();
                if (firstPara) parts.push(`[Opening] ${firstPara}`);

                const headings = getHeadings();
                if (headings) parts.push(`[Sections] ${headings}`);

                const keywords = getKeywords();
                if (keywords) parts.push(`[Keywords] ${keywords}`);

                const mainContent = getMainContent();
                if (mainContent) parts.push(`[Content] ${mainContent}`);

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

      const analyzer = await getDefaultAnalyzer();
      const analysis = await analyzer.analyzeBookmark({
        ...extractedContent,
        existingFolders: folders,
      });

      console.log('[Popup] AI Analysis result:', analysis);

      // 步骤3: 准备保存
      setAnalysisStep(3);
      console.log('[Popup] Step 3: Ready to save!');

      // 使用 AI 推荐的文件夹，如果没有则降级到 Bookmarks Bar/Uncategorized
      const suggestedFolder = analysis.suggestedFolder || `/${bookmarksBarName}/${t('folder.uncategorized')}`;
      
      setData((prev) => prev ? {
        ...prev,
        suggestedFolder,
        suggestedTags: analysis.tags,
        aiSummary: analysis.summary,
        aiConfidence: Math.round((analysis.confidence || 0.5) * 100),
      } : null);
      
      setSelectedFolder(suggestedFolder);
      setTags(analysis.tags);
      
      // 短暂显示"准备完成"步骤
      await new Promise(resolve => setTimeout(resolve, 400));
      
    } catch (error) {
      console.error('[Popup] AI analysis failed:', error);
      
      // 降级到简单分析
      const fallbackFolder = `/${bookmarksBarName}/${t('folder.uncategorized', '未分类')}`;
      const fallbackTags = ['untagged'];
      
      setData((prev) => prev ? { 
        ...prev, 
        suggestedFolder: fallbackFolder,
        suggestedTags: fallbackTags,
        aiSummary: t('popup.aiUnavailable', 'AI 分析暂不可用'),
      } : null);
      
      setSelectedFolder(fallbackFolder);
      setTags(fallbackTags);
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
        aiConfidence: data.aiConfidence,
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


  if (loading) {
    return (
      <div className="popup">
        {/* 头部 + 进度条 */}
        <div className="popup-header">
          <h2>{t('popup.saveCurrentPage')}</h2>
          <div className="header-actions">
            <button className="close-button" onClick={handleCancel}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="loading-progress-bar">
          <div
            className="loading-progress-fill"
            style={{ width: `${analysisStep === 0 ? 5 : analysisStep === 1 ? 30 : analysisStep === 2 ? 65 : 100}%` }}
          />
        </div>

        {/* 内容区域 */}
        <div className="popup-content loading-content">
          {/* 页面信息：有 data 时显示真实信息，否则显示骨架 */}
          {data ? (
            <div className="page-info loading-page-info">
              {data.favicon && (
                <img src={data.favicon} alt="" className="page-favicon" />
              )}
              <div className="page-details">
                <div className="page-title-display">{data.title}</div>
                <div className="page-url-display">{data.url}</div>
              </div>
            </div>
          ) : (
            <div className="skeleton-page-info">
              <div className="skeleton skeleton-favicon" />
              <div className="skeleton-page-details">
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-url" />
              </div>
            </div>
          )}

          {/* 分析步骤 */}
          <div className="analysis-steps-card">
            <div className="analysis-steps-header">
              <Sparkles size={14} className={analysisStep >= 1 && analysisStep < 3 ? 'spin-slow' : ''} />
              <span>{t('sidebar.header.aiAnalyze')}</span>
            </div>
            <div className="analysis-steps-list">
              <div className={`analysis-step ${analysisStep >= 1 ? 'active' : ''} ${analysisStep > 1 ? 'done' : ''}`}>
                <span className="step-icon">
                  {analysisStep > 1 ? '✓' : analysisStep >= 1 ? <Loader size={12} className="spin" /> : <span className="step-dot" />}
                </span>
                <span className="step-text">{t('popup.analysis.step1', 'Extracting content...')}</span>
              </div>
              <div className={`analysis-step ${analysisStep >= 2 ? 'active' : ''} ${analysisStep > 2 ? 'done' : ''}`}>
                <span className="step-icon">
                  {analysisStep > 2 ? '✓' : analysisStep >= 2 ? <Loader size={12} className="spin" /> : <span className="step-dot" />}
                </span>
                <span className="step-text">{t('popup.analysis.step2', 'AI analyzing...')}</span>
              </div>
              <div className={`analysis-step ${analysisStep >= 3 ? 'active done' : ''}`}>
                <span className="step-icon">
                  {analysisStep >= 3 ? '✓' : <span className="step-dot" />}
                </span>
                <span className="step-text">{t('popup.analysis.step3', 'Ready to save')}</span>
              </div>
            </div>
          </div>

          {/* 表单骨架预示 */}
          <div className="loading-form-preview">
            <div className="skeleton skeleton-input-short" />
            <div className="skeleton skeleton-tags-short" />
          </div>
        </div>

        {/* 底部 - 禁用状态 */}
        <div className="popup-footer">
          <button className="button button-secondary" disabled>
            {t('common.buttons.cancel', 'Cancel')}
          </button>
          <button className="button button-primary" disabled>
            <Loader size={14} className="spin" />
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="popup">
        {/* 头部 - 与表单状态保持一致 */}
        <div className="popup-header">
          <h2>{t('popup.saveCurrentPage')}</h2>
          <div className="header-actions">
            <button className="close-button" onClick={handleCancel}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 内容区域 - Error 状态 */}
        <div className="popup-content">
          <div className="state-center">
            <p style={{ color: 'var(--error)' }}>{t('common.messages.error', 'Error')}</p>
          </div>
        </div>

        {/* 底部 */}
        <div className="popup-footer">
          <button className="button button-secondary" onClick={handleCancel}>
            {t('common.buttons.close', 'Close')}
          </button>
          <button className="button button-primary" disabled>
            {t('common.buttons.save', 'Save')}
          </button>
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
                {/* 新建文件夹提示（自动创建路径中所有缺失的文件夹） */}
                {isNewFolder() && (
                  <div className="folder-item new-folder" onClick={() => setShowFolderDropdown(false)}>
                    <Folder size={14} />
                    <span>{t('popup.folder.createNew', 'Create')}: <strong>{selectedFolder}</strong></span>
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

          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="popup-footer">
        <button 
          className="button button-secondary" 
          onClick={handleCancel}
          title={t('common.buttons.cancel', 'Cancel')}
        >
          {t('common.buttons.cancel', 'Cancel')}
        </button>
        <button
          className="button button-primary"
          onClick={handleSave}
          disabled={!selectedFolder}
          title="Enter"
        >
          {t('common.buttons.save', 'Save')}
        </button>
      </div>

    </div>
  );
};

export default Popup;
