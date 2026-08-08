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
} from 'lucide-react';
import { cardsApi } from '@/services/api';
import type { Card } from '@/types';
import Modal from './Modal';

interface CardDetailModalProps {
  card: Card | null;
  onClose: () => void;
  onUpdated: (card: Card) => void;
}

export default function CardDetailModal({
  card,
  onClose,
  onUpdated,
}: CardDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [keyPointsText, setKeyPointsText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 同步 card 到表单，切换卡片时重置
  useEffect(() => {
    if (card) {
      setTitle(card.title || '');
      setSummary(card.ai_summary || '');
      setKeyPointsText((card.key_points || []).join('\n'));
      setIsEditing(false);
      setError(null);
    }
  }, [card]);

  if (!card) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const newKeyPoints = keyPointsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await cardsApi.update(card.id, {
        title: title.trim(),
        ai_summary: summary,
        key_points: newKeyPoints,
      });
      onUpdated(updated);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // 还原表单到原始值
    setTitle(card.title || '');
    setSummary(card.ai_summary || '');
    setKeyPointsText((card.key_points || []).join('\n'));
    setIsEditing(false);
    setError(null);
  };

  // 头部：编辑态显示标题输入框，非编辑态显示标题文本（与原逻辑完全一致）
  const header = isEditing ? (
    <div className="w-full">
      <label className="label mb-1 block">标题</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input"
        disabled={isSaving}
      />
    </div>
  ) : (
    <h2 className="break-words text-xl font-bold">{card.title}</h2>
  );

  // 底部操作：编辑态显示「取消+保存」，否则显示「编辑」（与原逻辑完全一致）
  const footer = isEditing ? (
    <>
      <button
        onClick={handleCancelEdit}
        className="button button-outline"
        disabled={isSaving}
      >
        取消
      </button>
      <button
        onClick={handleSave}
        className="button button-primary"
        disabled={isSaving}
      >
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
    <button
      onClick={() => setIsEditing(true)}
      className="button button-secondary"
    >
      <Edit2 className="mr-2 h-4 w-4" />
      编辑
    </button>
  );

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      header={header}
      footer={footer}
      heightClass="h-[85vh]"
    >
      {/* 内容 */}
      <div className="flex-1 space-y-5">
        {/* 元信息 */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            创建于 {new Date(card.created_at).toLocaleString('zh-CN')}
          </span>
          {card.updated_at !== card.created_at && (
            <span>更新于 {new Date(card.updated_at).toLocaleString('zh-CN')}</span>
          )}
          <a
            href={card.source_url}
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
            <p className="text-sm leading-relaxed">{card.ai_summary}</p>
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
          ) : (card.key_points || []).length > 0 ? (
            <ul className="space-y-2">
              {card.key_points.map((point, i) => (
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
          {(card.ai_tags || []).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {card.ai_tags.map((tag, i) => (
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
