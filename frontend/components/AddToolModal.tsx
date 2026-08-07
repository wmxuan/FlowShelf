'use client';

import { useState, useEffect } from 'react';
import {
  Wrench,
  X,
  Loader2,
  Sparkles,
  Tag as TagIcon,
} from 'lucide-react';
import { toolsApi } from '@/services/api';

interface AddToolModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function AddToolModal({ open, onClose, onCreated }: AddToolModalProps) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{
    title: string;
    description: string;
    tags: string[];
  } | null>(null);
  // 可编辑字段（用户可在保存前修改）
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      setUrl('');
      setPreview(null);
      setEditTitle('');
      setEditDescription('');
      setHasGenerated(false);
      setIsGenerating(false);
      setIsSaving(false);
      setError(null);
    }
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleGenerate = async () => {
    if (!url.trim()) {
      setError('请输入有效的 URL');
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const result = await toolsApi.generate(url);
      setPreview(result);
      // 同步到可编辑字段
      setEditTitle(result.title || '');
      setEditDescription(result.description || '');
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!url.trim() || !preview) return;
    const title = editTitle.trim() || preview.title;
    const description = editDescription.trim() || preview.description;
    // 标签由 AI 生成，不允许用户编辑，直接使用 preview.tags
    setIsSaving(true);
    setError(null);
    try {
      // 复用预览阶段的 title + tags，跳过后端重复 AI 分类
      await toolsApi.create(url, title, description, preview.tags);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !hasGenerated) {
      e.preventDefault();
      handleGenerate();
    }
  };

  if (!open) return null;

  const busy = isGenerating || isSaving;

  return (
    <div
      className="fixed inset-0 z-[100] !m-0 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Wrench className="h-5 w-5 text-primary" />
            添加工具
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 transition-colors hover:bg-muted"
            title="关闭"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 内容：顶部输入区固定 + 下方预览区撑满滚动 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          {/* URL 输入区（固定顶部，不滚动） */}
          <div className="flex-shrink-0">
            <label className="label mb-2 block">工具 URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://example.com"
                className="input flex-1"
                disabled={busy}
              />
              <button
                onClick={handleGenerate}
                disabled={busy || !url.trim()}
                className="button button-primary"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {hasGenerated ? '重新生成' : 'AI 创建工具'}
                  </>
                )}
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>

          {/* 预览区：撑满剩余空间，内部滚动；未生成时空状态占位 */}
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
            {/* loading 优先判断：初次生成与重新生成都显示 loading */}
            {isGenerating ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center text-muted-foreground">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">正在分析页面内容，生成工具信息...</p>
                <p className="mt-1 text-xs">名称 / 描述 / 标签</p>
              </div>
            ) : !hasGenerated ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center text-muted-foreground">
                <Sparkles className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm">输入 URL 并点击「AI 创建工具」</p>
                <p className="mt-1 text-xs">AI 将自动识别工具并生成名称、描述与标签</p>
              </div>
            ) : preview ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI 生成预览（可编辑）
                </h3>
                <div className="space-y-4">
                  {/* 工具名称（可编辑） */}
                  <div>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                      工具名称
                    </h4>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="input"
                      disabled={isSaving}
                    />
                  </div>

                  {/* 描述（可编辑） */}
                  <div>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                      工具描述
                    </h4>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="input min-h-[80px] resize-y"
                      placeholder="工具用途说明"
                      disabled={isSaving}
                    />
                  </div>

                  {/* 标签（只读，AI 生成） */}
                  <div>
                    <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <TagIcon className="h-3 w-3" />
                      标签（AI 生成）
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {preview.tags.map((tag, i) => (
                        <span key={i} className="badge badge-secondary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border bg-card p-4">
          <button onClick={onClose} className="button button-outline">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !preview}
            className="button button-primary"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Wrench className="mr-2 h-4 w-4" />
                保存为工具
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
