'use client';

import { useState } from 'react';
import { Bookmark, Sparkles, Loader2, X } from 'lucide-react';
import { cardsApi } from '@/services/api';

interface URLInputProps {
  onCardCreated?: () => void;
}

export default function URLInput({ onCardCreated }: URLInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    summary: string;
    key_points: string[];
    tags: string[];
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerate = async () => {
    if (!url.trim()) {
      setError('请输入有效的 URL');
      return;
    }

    setError(null);
    setIsLoading(true);
    setPreview(null);

    try {
      const result = await cardsApi.generate(url);
      setPreview(result as { summary: string; key_points: string[]; tags: string[] });
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    try {
      await cardsApi.create(url);
      setUrl('');
      setPreview(null);
      setShowPreview(false);
      onCardCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Bookmark className="h-5 w-5 text-primary" />
          <label className="text-sm font-medium">输入 URL 收藏</label>
        </div>
        
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com/article"
            className="input flex-1"
            disabled={isLoading}
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !url.trim()}
            className="button button-primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                AI 生成卡片
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
      </div>

      {/* 预览区域 */}
      {showPreview && preview && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI 生成预览
            </h3>
            <button
              onClick={() => setShowPreview(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">📝 摘要</h4>
              <p className="text-sm bg-background rounded p-3">{preview.summary}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">💡 关键观点</h4>
              <ul className="space-y-1">
                {preview.key_points.map((point, i) => (
                  <li key={i} className="text-sm bg-background rounded p-2">
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">🏷️ 标签</h4>
              <div className="flex flex-wrap gap-2">
                {preview.tags.map((tag, i) => (
                  <span key={i} className="badge badge-secondary">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="button button-primary flex-1"
            >
              {isLoading ? '保存中...' : '💾 保存为卡片'}
            </button>
            <button
              onClick={() => setShowPreview(false)}
              className="button button-outline"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}