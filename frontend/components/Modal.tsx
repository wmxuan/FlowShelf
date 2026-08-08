'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useEscClose } from '@/hooks/useEscClose';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** 头部左侧内容（标题+图标等） */
  header: ReactNode;
  /** 主体内容（内部 overflow-y 可滚动） */
  children: ReactNode;
  /** 底部操作按钮 */
  footer: ReactNode;
  /** maxH override：默认 85vh，详情可用 h-[85vh] */
  heightClass?: string;
}

/**
 * 通用 Modal 外壳：overlay + 点击外部关闭 + stopPropagation + ESC + header + body + footer。
 * 与 AddCardModal / AddToolModal / CardDetailModal 的原外壳 CSS 类完全一致，确保 UI 零变化。
 */
export default function Modal({
  open,
  onClose,
  header,
  children,
  footer,
  heightClass = 'max-h-[85vh]',
}: ModalProps) {
  useEscClose(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] !m-0 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`flex ${heightClass} w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-card p-6">
          <div className="flex-1">{header}</div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 transition-colors hover:bg-muted"
            title="关闭"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 内容：滚动区 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>

        {/* 底部操作 */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border bg-card p-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
