'use client';

import { useEffect, useRef, useState } from 'react';

interface DeleteConfirmButtonProps {
  /** 确认删除时调用 */
  onConfirm: () => void;
  /** 触发按钮的内容（图标或文字） */
  children: React.ReactNode;
  /** 触发按钮的 className */
  buttonClassName?: string;
  /** 触发按钮的 title */
  buttonTitle?: string;
  /** 确认弹窗的提示文案 */
  confirmText?: string;
  /** popover 相对按钮的对齐方式，默认右对齐（适合操作按钮在行尾的场景） */
  align?: 'right' | 'left' | 'center';
  /** 是否阻止点击事件冒泡（删除按钮位于可点击卡片内时需要） */
  stopPropagation?: boolean;
}

/**
 * 删除二次确认按钮：点击后在按钮原位置弹出 popover 进行二次确认。
 * 用透明 backdrop 捕获外部点击来关闭。
 */
export default function DeleteConfirmButton({
  onConfirm,
  children,
  buttonClassName,
  buttonTitle,
  confirmText = '确认删除？',
  align = 'right',
  stopPropagation = false,
}: DeleteConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 popover
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleConfirm = () => {
    setOpen(false);
    onConfirm();
  };

  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'right-0';

  return (
    <div
      className="relative"
      ref={containerRef}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
        title={buttonTitle}
        aria-expanded={open}
      >
        {children}
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1 min-w-[180px] rounded-md border border-border bg-card p-3 shadow-lg ${alignClass}`}
          role="dialog"
        >
          <p className="mb-3 text-sm text-foreground">{confirmText}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="button button-destructive flex-1 px-3 py-1.5 text-xs"
              autoFocus
            >
              确认删除
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="button button-outline flex-1 px-3 py-1.5 text-xs"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
