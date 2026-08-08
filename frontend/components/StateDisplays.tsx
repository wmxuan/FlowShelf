'use client';

import type { ReactNode } from 'react';

// ============ EmptyState ============

interface EmptyStateProps {
  /** 图标组件（如 <FileText />）*/
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * 通用空状态：圆形图标容器 + 标题 + 描述。
 * 与 cards/page.tsx / toolbox/page.tsx 原空状态 CSS 完全一致：
 *   <div className="card text-center py-12">
 *     <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
 *       {icon}
 *     </div>
 *     <h3 className="text-lg font-semibold mb-2">{title}</h3>
 *     <p className="text-muted-foreground mb-4">{desc}</p>
 *   </div>
 */
export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="card text-center py-12">
      <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">{description}</p>
    </div>
  );
}

// ============ LoadingSkeleton ============

interface CardGridSkeletonProps {
  /** 骨架卡片数量，默认 4（原 cards 页面）*/
  count?: number;
}

/** 卡片网格骨架屏（cards/page.tsx 原 loading 态） */
export function CardGridSkeleton({ count = 4 }: CardGridSkeletonProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="mb-4 h-4 w-3/4 bg-muted rounded" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-5/6 bg-muted rounded" />
            <div className="h-3 w-4/6 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ListRowSkeletonProps {
  /** 骨架行数，默认 5（原 toolbox 页面）*/
  rows?: number;
}

/** 列表骨架屏（toolbox/page.tsx 原 loading 态：工具列表行） */
export function ListRowSkeleton({ rows = 5 }: ListRowSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 animate-pulse"
        >
          <div className="h-8 w-8 bg-muted rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-1/3 bg-muted rounded" />
            <div className="h-3 w-1/4 bg-muted rounded" />
          </div>
          <div className="flex gap-1">
            <div className="h-5 w-12 bg-muted rounded-full" />
            <div className="h-5 w-12 bg-muted rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
