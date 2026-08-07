'use client';

import { useState, useEffect } from 'react';
import { Bookmark, Sparkles, Loader2, X, FileText } from 'lucide-react';
import { cardsApi } from '@/services/api';

interface AddCardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function AddCardModal({ open, onClose, onCreated }: AddCardModalProps) {
  const [url, setUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  // 预览原始数据（AI 生成结果）
  const [preview, setPreview] = useState<{
    title: string;
    summary: string;
    key_points: string[];
    tags: string[];
  } | null>(null);

  // 可编辑字段（用户可在保存前修改）
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editKeyPoints, setEditKeyPoints] = useState(''); // 每行一条

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      setUrl('');
      setIsGenerating(false);
      setIsSaving(false);
      setError(null);
      setPreview(null);
      setHasGenerated(false);
      setEditTitle('');
      setEditSummary('');
      setEditKeyPoints('');
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
      const result = (await cardsApi.generate(url)) as {
        title: string;
        summary: string;
        key_points: string[];
        tags: string[];
      };
      setPreview(result);
      // 同步到可编辑字段
      setEditTitle(result.title || '');
      setEditSummary(result.summary || '');
      setEditKeyPoints((result.key_points || []).join('\n'));
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!url.trim() || !preview) return;
    setIsSaving(true);
    setError(null);
    try {
      // 解析编辑后的 key_points
      const keyPoints = editKeyPoints
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      // 走「预览保存」路径，把编辑后的内容传给后端，跳过 AI 重新生成
      // 标签由 AI 生成，不允许用户编辑，直接使用 preview.tags
      await cardsApi.create(url, {
        title: editTitle.trim() || preview.title,
        summary: editSummary.trim() || preview.summary,
        key_points: keyPoints,
        tags: preview.tags,
      });
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
            <Bookmark className="h-5 w-5 text-primary" />
            新增卡片
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
            <label className="label mb-2 block">网页 URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://example.com/article"
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
                    {hasGenerated ? '重新生成' : 'AI 生成卡片'}
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
                <p className="text-sm">正在分析文章内容，生成卡片信息...</p>
                <p className="mt-1 text-xs">标题 / 摘要 / 关键观点 / 标签</p>
              </div>
            ) : !hasGenerated ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center text-muted-foreground">
                <Sparkles className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm">输入 URL 并点击「AI 生成卡片」</p>
                <p className="mt-1 text-xs">AI 将自动生成标题、摘要、关键观点与标签</p>
              </div>
            ) : preview ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI 生成预览（可编辑）
                </h3>
                <div className="space-y-4">
                  {/* 标题（可编辑） */}
                  <div>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                      📌 标题
                    </h4>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="input"
                      disabled={isSaving}
                    />
                  </div>

                  {/* 摘要（可编辑） */}
                  <div>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                      📝 摘要
                    </h4>
                    <textarea
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="input min-h-[100px] resize-y"
                      disabled={isSaving}
                    />
                  </div>

                  {/* 关键观点（可编辑，每行一条） */}
                  <div>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                      💡 关键观点（每行一条）
                    </h4>
                    <textarea
                      value={editKeyPoints}
                      onChange={(e) => setEditKeyPoints(e.target.value)}
                      className="input min-h-[120px] resize-y"
                      placeholder="每行一条观点"
                      disabled={isSaving}
                    />
                  </div>

                  {/* 标签（只读，AI 生成） */}
                  <div>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                      🏷️ 标签（AI 生成）
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
                <FileText className="mr-2 h-4 w-4" />
                保存为卡片
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
