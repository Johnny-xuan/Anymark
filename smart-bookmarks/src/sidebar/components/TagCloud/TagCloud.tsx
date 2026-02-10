/**
 * 标签云组件
 * 两区布局：顶部为用户置顶的常用标签，下方为统计标签
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Tag, X, Pin, Plus } from 'lucide-react';
import { useBookmarkStore } from '../../store/bookmarkStore';
import { useTranslation } from 'react-i18next';
import './TagCloud.css';

interface TagInfo {
  name: string;
  count: number;
  isAI: boolean;
}

interface TagCloudProps {
  onTagClick?: (tag: string) => void;
  onClose?: () => void;
}

const TagCloud: React.FC<TagCloudProps> = ({ onTagClick, onClose }) => {
  const { t } = useTranslation();
  const bookmarks = useBookmarkStore((state) => state.bookmarks);
  const searchQuery = useBookmarkStore((state) => state.searchQuery);
  const setSearchQuery = useBookmarkStore((state) => state.setSearchQuery);
  const pinnedTags = useBookmarkStore((state) => state.pinnedTags);
  const addPinnedTag = useBookmarkStore((state) => state.addPinnedTag);
  const removePinnedTag = useBookmarkStore((state) => state.removePinnedTag);

  const [isAdding, setIsAdding] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // 聚合所有标签
  const tagData = useMemo(() => {
    const tagMap = new Map<string, TagInfo>();

    bookmarks
      .filter((b) => b.status !== 'deleted')
      .forEach((bookmark) => {
        bookmark.userTags?.forEach((tag) => {
          const existing = tagMap.get(tag);
          if (existing) {
            existing.count++;
          } else {
            tagMap.set(tag, { name: tag, count: 1, isAI: false });
          }
        });

        bookmark.aiTags?.forEach((tag) => {
          const existing = tagMap.get(tag);
          if (existing) {
            existing.count++;
          } else {
            tagMap.set(tag, { name: tag, count: 1, isAI: true });
          }
        });
      });

    return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  }, [bookmarks]);

  // 统计标签（排除已置顶的）
  const unpinnedTags = useMemo(() => {
    return tagData.filter((tag) => !pinnedTags.includes(tag.name));
  }, [tagData, pinnedTags]);

  // 计算字体大小（基于标签频率）
  const getFontSize = (count: number): number => {
    if (unpinnedTags.length === 0) return 14;
    const maxCount = unpinnedTags[0]?.count || 1;
    const minSize = 12;
    const maxSize = 28;
    const ratio = count / maxCount;
    return minSize + ratio * (maxSize - minSize);
  };

  // selectedTag 从全局 searchQuery 派生，与搜索框双向联动
  const selectedTag = searchQuery || null;

  // 处理标签点击（筛选）
  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSearchQuery('');
    } else {
      setSearchQuery(tag);
    }
    onTagClick?.(tag);
  };

  // 添加新置顶标签
  const handleAddTag = () => {
    const trimmed = newTagName.trim();
    if (trimmed && !pinnedTags.includes(trimmed)) {
      addPinnedTag(trimmed);
    }
    setNewTagName('');
    setIsAdding(false);
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTag();
    } else if (e.key === 'Escape') {
      setNewTagName('');
      setIsAdding(false);
    }
  };

  const hasPinnedTags = pinnedTags.length > 0;
  const hasAnyTags = tagData.length > 0 || hasPinnedTags;

  if (!hasAnyTags) {
    return (
      <div className="tag-cloud-empty">
        <Tag size={32} strokeWidth={1.5} />
        <p>{t('sidebar.tagCloud.empty', 'No tags yet')}</p>
      </div>
    );
  }

  return (
    <div className="tag-cloud-container">
      <div className="tag-cloud-header">
        <div className="tag-cloud-title">
          <Tag size={18} />
          <span>{t('sidebar.tagCloud.title', 'Tag Cloud')}</span>
          <span className="tag-count">({tagData.length})</span>
        </div>
        {onClose && (
          <button className="tag-cloud-close" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* 置顶标签区 */}
      <div className="pinned-tags-section">
        <div className="pinned-tags-header">
          <Pin size={14} />
          <span>{t('sidebar.tagCloud.pinned', 'Pinned Tags')}</span>
          <button
            className="add-tag-btn"
            onClick={() => setIsAdding(true)}
            title={t('sidebar.tagCloud.addTag', 'Add tag')}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="pinned-tags-list">
          {pinnedTags.map((tag) => (
            <button
              key={tag}
              className={`tag-item pinned-tag ${selectedTag === tag ? 'selected' : ''}`}
              onClick={() => handleTagClick(tag)}
              title={tag}
            >
              <span className="tag-name">{tag}</span>
              <span
                className="tag-unpin"
                onClick={(e) => {
                  e.stopPropagation();
                  removePinnedTag(tag);
                }}
                title={t('sidebar.tagCloud.unpin', 'Unpin')}
              >
                <X size={12} />
              </span>
            </button>
          ))}
          {isAdding && (
            <div className="add-tag-input-wrapper">
              <input
                ref={inputRef}
                className="add-tag-input"
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={handleAddKeyDown}
                onBlur={handleAddTag}
                placeholder={t('sidebar.tagCloud.newTagPlaceholder', 'Tag name...')}
              />
            </div>
          )}
          {!hasPinnedTags && !isAdding && (
            <span className="pinned-tags-empty">
              {t('sidebar.tagCloud.pinnedEmpty', 'Pin your favorite tags here')}
            </span>
          )}
        </div>
      </div>

      {/* 统计标签区 */}
      {unpinnedTags.length > 0 && (
        <div className="stats-tags-section">
          <div className="stats-tags-header">
            <span>{t('sidebar.tagCloud.allTags', 'All Tags')}</span>
          </div>
          <div className="tag-cloud">
            {unpinnedTags.map((tag) => (
              <button
                key={tag.name}
                className={`tag-item ${tag.isAI ? 'ai-tag' : 'user-tag'} ${
                  selectedTag === tag.name ? 'selected' : ''
                }`}
                style={{ fontSize: `${getFontSize(tag.count)}px` }}
                onClick={() => handleTagClick(tag.name)}
                title={`${tag.name} (${tag.count})`}
              >
                <span className="tag-name">{tag.name}</span>
                <span className="tag-badge">{tag.count}</span>
                <span
                  className="tag-pin-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    addPinnedTag(tag.name);
                  }}
                  title={t('sidebar.tagCloud.pin', 'Pin')}
                >
                  <Pin size={10} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default TagCloud;
