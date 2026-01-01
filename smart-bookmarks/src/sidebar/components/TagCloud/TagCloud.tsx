/**
 * 标签云组件
 * 可视化展示所有标签的分布情况
 */

import React, { useMemo, useState } from 'react';
import { Tag, X } from 'lucide-react';
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
  const setFilters = useBookmarkStore((state) => state.setFilters);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 聚合所有标签
  const tagData = useMemo(() => {
    const tagMap = new Map<string, TagInfo>();

    bookmarks
      .filter((b) => b.status !== 'deleted')
      .forEach((bookmark) => {
        // 用户标签
        bookmark.userTags?.forEach((tag) => {
          const existing = tagMap.get(tag);
          if (existing) {
            existing.count++;
          } else {
            tagMap.set(tag, { name: tag, count: 1, isAI: false });
          }
        });

        // AI 标签
        bookmark.aiTags?.forEach((tag) => {
          const existing = tagMap.get(tag);
          if (existing) {
            existing.count++;
            // 如果同时是用户标签和 AI 标签，保持 isAI: false
          } else {
            tagMap.set(tag, { name: tag, count: 1, isAI: true });
          }
        });
      });

    // 按数量排序
    return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  }, [bookmarks]);

  // 计算字体大小（基于标签频率）
  const getFontSize = (count: number): number => {
    if (tagData.length === 0) return 14;
    const maxCount = tagData[0]?.count || 1;
    const minSize = 12;
    const maxSize = 28;
    const ratio = count / maxCount;
    return minSize + ratio * (maxSize - minSize);
  };

  // 处理标签点击
  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      // 取消选择
      setSelectedTag(null);
      setFilters({ tag: undefined });
    } else {
      setSelectedTag(tag);
      setFilters({ tag });
    }
    onTagClick?.(tag);
  };

  if (tagData.length === 0) {
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

      <div className="tag-cloud">
        {tagData.map((tag) => (
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
          </button>
        ))}
      </div>

      {selectedTag && (
        <div className="tag-cloud-filter-hint">
          {t('sidebar.tagCloud.filtering', 'Filtering by:')} <strong>{selectedTag}</strong>
          <button onClick={() => handleTagClick(selectedTag)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TagCloud;
