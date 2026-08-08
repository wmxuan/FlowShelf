'use client';

import { useState } from 'react';
import { Tag } from 'lucide-react';
import type { TagCount } from '@/types';

interface TagFilterProps {
  /** 所有标签及计数 */
  allTags: TagCount[];
  /** 当前激活标签；null 表示「全部」 */
  activeTag: string | null;
  /** 切换激活标签：点击当前激活的会取消激活 */
  onTagChange: (tag: string | null) => void;
  /** 超过此数量时显示「展开更多」按钮（默认 15，与原页面一致） */
  expandThreshold?: number;
  /** 前置标签文字，默认「筛选标签：」；toolbox 传「筛选：」 */
  label?: string;
  className?: string;
}

/**
 * 通用标签筛选器：标签按钮组 + 展开/收起。
 * 与 cards/page.tsx / toolbox/page.tsx 原标签筛选 CSS 完全一致。
 */
export default function TagFilter({
  allTags,
  activeTag,
  onTagChange,
  expandThreshold = 15,
  label = '筛选标签：',
  className = '',
}: TagFilterProps) {
  const [showAll, setShowAll] = useState(false);

  if (!allTags.length) return null;

  const displayTags = showAll ? allTags : allTags.slice(0, expandThreshold);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
        <Tag className="h-4 w-4" />
        {label}
      </span>
      <button
        onClick={() => onTagChange(null)}
        className={`badge ${!activeTag ? 'badge-primary' : 'badge-secondary'}`}
      >
        全部
      </button>
      {displayTags.map((t) => (
        <button
          key={t.name}
          onClick={() => onTagChange(t.name === activeTag ? null : t.name)}
          className={`badge ${t.name === activeTag ? 'badge-primary' : 'badge-secondary'}`}
        >
          {t.name}
          <span className="ml-1 opacity-60">{t.count}</span>
        </button>
      ))}
      {allTags.length > expandThreshold && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="badge badge-secondary"
        >
          {showAll ? '收起' : `+${allTags.length - expandThreshold} 更多`}
        </button>
      )}
    </div>
  );
}
