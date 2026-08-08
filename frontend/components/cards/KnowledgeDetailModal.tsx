'use client';

import { useState, useEffect } from 'react';
import {
  Edit2,
  Save,
  ExternalLink,
  Calendar,
  Sparkles,
  Tag as TagIcon,
  Loader2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { cardsApi, learningApi } from '@/services/api';
import type { Card, LearningItem } from '@/types';
import Modal from '@/components/Modal';

interface KnowledgeDetailModalProps {
  /** 当前查看的数据（统一类型），null 时关闭 */
  data: {
    id: number;
    source: 'learning' | 'cards';
    title: string;
    source_url: string;
    ai_summary: string | null;
    key_points: string[];
    ai_tags: string[];
    created_at: string;
    updated_at?: string;
  } | null;
  onClose: () => void;
  /** 保存成功后回调，传入更新后的数据 */
  onUpdated: (updated: { id: number; source: 'learning' | 'cards'; title: string; source_url: string; ai_summary: string; key_points: string[]; ai_tags: string[]; created_at: string }) => void;
  /** AI 重新生成的回调（由父组件提供，learning 用 enrich，cards 用 generate+update） */
  onRegenerate?: (id: number, source: 'learning' | 'cards') => Promise<void>;
  /** 是否为 AI 生成失败状态（仅 learning 失败时为 true，控制底部 AI 重新生成按钮是否显示） */
  isFailed?: boolean;
}

/**
 * 知识卡片详情弹窗（查看 + 编辑 + AI 重新生成）。
 *
 * 同时支持「知识库」(source=cards) 与「暂存区 article」(source=learning)：
 *   - 查看：只读展示标题/摘要/关键观点/标签/元信息
 *   - 编辑：切换为表单，保存时按 source 调不同 API
 *     - cards: cardsApi.update(id, {title, ai_summary, key_points})
 *     - learning: learningApi.update(id, {title, ai_summary, key_points})
 *   - AI 重新生成：调用 onRegenerate（父组件实现，cards 用 generate+update，learning 用 enrich）
 */
export default function KnowledgeDetailModal({
  data,
  onClose,
  onUpdated,
  onRegenerate,
  isFailed,
}: KnowledgeDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [keyPointsText, setKeyPointsText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 同步 data 到表单，切换卡片时重置
  useEffect(() => {
    if (data) {
      setTitle(data.title || '');
      setSummary(data.ai_summary || '');
      setKeyPointsText((data.key_points || []).join('\n'));
      setIsEditing(false);
      setError(null);
    }
  }, [data]);

  if (!data) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const newKeyPoints = keyPointsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      if (data.source === 'cards') {
        const updated = await cardsApi.update(data.id, {
          title: title.trim(),
          ai_summary: summary,
          key_points: newKeyPoints,
        });
        onUpdated({
          id: updated.id,
          source: 'cards',
          title: updated.title,
          source_url: updated.source_url,
          ai_summary: updated.ai_summary,
          key_points: updated.key_points,
          ai_tags: updated.ai_tags,
          created_at: updated.created_at,
        });
      } else {
        // learning article
        const updated = await learningApi.update(data.id, {
          title: title.trim(),
          ai_summary: summary,
          key_points: newKeyPoints,
        });
        onUpdated({
          id: updated.id,
          source: 'learning',
          title: updated.title,
          source_url: updated.source_url,
          ai_summary: updated.ai_summary || '',
          key_points: Array.isArray(updated.key_points) ? updated.key_points : [],
          ai_tags: Array.isArray(updated.ai_tags) ? updated.ai_tags : [],
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
    setSummary(data.ai_summary || '');
    setKeyPointsText((data.key_points || []).join('\n'));
    setIsEditing(false);
    setError(null);
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    setIsRegenerating(true);
    setError(null);
    try {
      await onRegenerate(data.id, data.source);
      // 重新生成后关闭弹窗（父组件会刷新列表，用户可重新打开看新内容）
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setIsRegenerating(false);
    }
  };

  // 头部
  const header = isEditing ? (
    <div className="w-full">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input"
        placeholder="标题"
        disabled={isSaving}
      />
    </div>
  ) : (
    <h2 className="break-words text-xl font-bold">{data.title}</h2>
  );

  // 底部操作：编辑态「取消+保存」，查看态「[AI重新生成(仅失败)] + 编辑」
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
    <Modal
      open={!!data}
      onClose={onClose}
      header={header}
      footer={footer}
      heightClass="h-[85vh]"
    >
      <div className="flex-1 space-y-5">
        {/* 元信息 */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            创建于 {new Date(data.created_at).toLocaleString('zh-CN')}
          </span>
          <a
            href={data.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            查看原文
          </a>
        </div>

        {/* 摘要 */}
        <div>
          <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            摘要
          </h3>
          {isEditing ? (
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="input min-h-[100px] resize-y"
              disabled={isSaving}
            />
          ) : (
            <p className="text-sm leading-relaxed">{data.ai_summary || '暂无'}</p>
          )}
        </div>

        {/* 关键观点 */}
        <div>
          <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            关键观点
          </h3>
          {isEditing ? (
            <textarea
              value={keyPointsText}
              onChange={(e) => setKeyPointsText(e.target.value)}
              className="input min-h-[120px] resize-y"
              placeholder="每行一条"
              disabled={isSaving}
            />
          ) : (data.key_points || []).length > 0 ? (
            <ul className="space-y-2">
              {data.key_points.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="shrink-0 text-primary">{i + 1}.</span>
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无</p>
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
