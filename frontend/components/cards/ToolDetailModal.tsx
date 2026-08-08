'use client';

import { useState, useEffect } from 'react';
import {
  Edit2,
  Save,
  ExternalLink,
  Calendar,
  Tag as TagIcon,
  Loader2,
  Wrench,
  RefreshCw,
  Eye,
  Clock,
} from 'lucide-react';
import { toolsApi, learningApi } from '@/services/api';
import Modal from '@/components/Modal';

interface ToolDetailModalProps {
  data: {
    id: number;
    source: 'learning' | 'toolbox';
    title: string;
    url: string;
    ai_tags: string[];
    description: string | null;
    created_at: string;
    visit_count?: number;
    last_visited_at?: string | null;
  } | null;
  onClose: () => void;
  onUpdated: (updated: {
    id: number;
    source: 'learning' | 'toolbox';
    title: string;
    url: string;
    ai_tags: string[];
    description: string | null;
    created_at: string;
    visit_count?: number;
    last_visited_at?: string | null;
  }) => void;
  onRegenerate?: (id: number, source: 'learning' | 'toolbox') => Promise<void>;
  /** 是否为 AI 生成失败状态（仅 learning 失败时为 true，控制底部 AI 重新生成按钮是否显示） */
  isFailed?: boolean;
}

/**
 * 工具详情弹窗（查看 + 编辑 + AI 重新生成）。
 *
 * 同时支持「工具箱」(source=toolbox) 与「暂存区 tool」(source=learning)：
 *   - 查看：标题/描述/标签/元信息（访问次数、最近使用仅 toolbox 展示）
 *   - 编辑：标题/工具描述，保存时按 source 调不同 API
 *     - toolbox: toolsApi.update(id, {title, description})
 *     - learning: learningApi.update(id, {title, tool_description})
 *   - AI 重新生成：onRegenerate（toolbox 用 generate+update，learning 用 enrich）
 */
export default function ToolDetailModal({
  data,
  onClose,
  onUpdated,
  onRegenerate,
  isFailed,
}: ToolDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setTitle(data.title || '');
      setDescription(data.description || '');
      setIsEditing(false);
      setError(null);
    }
  }, [data]);

  if (!data) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (data.source === 'toolbox') {
        const updated = await toolsApi.update(data.id, {
          title: title.trim(),
          description: description.trim() || null,
        });
        onUpdated({
          id: updated.id,
          source: 'toolbox',
          title: updated.title,
          url: updated.url,
          ai_tags: updated.ai_tags,
          description: updated.description,
          created_at: updated.created_at,
        });
      } else {
        const updated = await learningApi.update(data.id, {
          title: title.trim(),
          tool_description: description.trim() || null,
        });
        onUpdated({
          id: updated.id,
          source: 'learning',
          title: updated.title,
          url: updated.source_url,
          ai_tags: Array.isArray(updated.ai_tags) ? updated.ai_tags : [],
          description: updated.tool_description,
          created_at: updated.created_at,
        });
      }
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setTitle(data.title || '');
    setDescription(data.description || '');
    setIsEditing(false);
    setError(null);
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    setIsRegenerating(true);
    setError(null);
    try {
      await onRegenerate(data.id, data.source);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setIsRegenerating(false);
    }
  };

  const header = isEditing ? (
    <div className="w-full">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input"
        placeholder="工具名称"
        disabled={isSaving}
      />
    </div>
  ) : (
    <h2 className="break-words text-xl font-bold">{data.title}</h2>
  );

  const footer = isEditing ? (
    <>
      <button onClick={handleCancelEdit} className="button button-outline" disabled={isSaving}>
        取消
      </button>
      <button onClick={handleSave} className="button button-primary" disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            保存中...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            保存
          </>
        )}
      </button>
    </>
  ) : (
    <>
      {isFailed && onRegenerate && (
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="button button-outline"
        >
          {isRegenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              AI 重新生成
            </>
          )}
        </button>
      )}
      <button onClick={() => setIsEditing(true)} className="button button-secondary">
        <Edit2 className="mr-2 h-4 w-4" />
        编辑
      </button>
    </>
  );

  return (
    <Modal open={!!data} onClose={onClose} header={header} footer={footer} heightClass="h-[75vh]">
      <div className="flex-1 space-y-5">
        {/* 元信息 */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            创建于 {new Date(data.created_at).toLocaleString('zh-CN')}
          </span>
          {data.source === 'toolbox' && typeof data.visit_count === 'number' && (
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              访问 {data.visit_count} 次
            </span>
          )}
          {data.source === 'toolbox' && data.last_visited_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              最近使用 {new Date(data.last_visited_at).toLocaleString('zh-CN')}
            </span>
          )}
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            打开工具
          </a>
        </div>

        {/* 工具描述 */}
        <div>
          <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
            <Wrench className="h-4 w-4 text-primary" />
            工具描述
          </h3>
          {isEditing ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input min-h-[100px] resize-y"
              placeholder="工具用途说明"
              disabled={isSaving}
            />
          ) : (
            <p className="text-sm leading-relaxed">{data.description || '暂无描述'}</p>
          )}
        </div>

        {/* 标签（只读，AI 生成） */}
        <div>
          <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
            <TagIcon className="h-4 w-4 text-primary" />
            标签
          </h3>
          {(data.ai_tags || []).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.ai_tags.map((tag, i) => (
                <span key={i} className="badge badge-secondary">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无</p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
