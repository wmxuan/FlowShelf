'use client';

import { Sparkles, Calendar, ExternalLink, Trash2, RefreshCw, FileText, AlertCircle } from 'lucide-react';
import type { KnowledgeCardData } from './shared';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import { useAiMode } from '@/hooks/useAiMode';

export interface KnowledgeCardActions {
  /** 点击卡片主体 → 查看详情（弹窗内才有编辑按钮） */
  onView?: (data: KnowledgeCardData) => void;
  /** AI 重新生成（仅 learning 失败时由父组件传入） */
  onRegenerate?: (data: KnowledgeCardData) => void;
  isRegenerating?: boolean;
  /** 删除 */
  onDelete?: (id: number) => void;
  /** 顶部状态徽标插槽（生成中 / 已转正等） */
  statusBadge?: React.ReactNode;
  /** 底部额外按钮插槽（如暂存区的「转为正式」） */
  extraActions?: React.ReactNode;
}

interface KnowledgeCardProps {
  data: KnowledgeCardData;
  actions: KnowledgeCardActions;
}

/**
 * 统一知识卡片 UI，用于「知识卡片库」与「暂存区 article Tab」。
 *
 * 布局（选项 A：底部工具栏）：
 *   - 点击卡片主体 → 查看详情（弹窗内才有编辑按钮）
 *   - 底部工具栏：查看原文 · [extraActions] · 删除
 *   - statusBadge 插槽渲染在标题右侧（生成中 / 已转正等场景专属状态）
 *
 * 通用功能：查看 / 删除 / 查看原文
 * 场景专属（learning 失败）：失败提示块内嵌「重新生成」按钮（onRegenerate 由父组件仅在失败时传入）
 * 场景专属（通过插槽注入）：转为正式（learning）、生成中提示（learning !is_ready）
 */
export default function KnowledgeCard({ data, actions }: KnowledgeCardProps) {
  const { aiMode } = useAiMode();
  const showGeneratingHint = data.source === 'learning' && data.is_ready === false;
  // AI 模式下：is_ready=True 但 AI 内容为空 → 生成失败（红色 + 重试）
  const showAiFailed =
    data.source === 'learning' &&
    data.is_ready === true &&
    !data.ai_summary &&
    !data.is_converted &&
    aiMode;
  // 基础模式下：is_ready=True 但 AI 内容为空 → 待手动填写（蓝色）
  const showNoAiHint =
    data.source === 'learning' &&
    data.is_ready === true &&
    !data.ai_summary &&
    !data.is_converted &&
    !aiMode;
  const showConvertedBadge = data.source === 'learning' && data.is_converted;

  return (
    <div
      className="card group cursor-pointer"
      onClick={() => actions.onView?.(data)}
    >
      {/* 标题 + 状态徽标 */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="card-title line-clamp-2 flex-1">{data.title}</h3>
        <div className="flex items-center gap-1">
          {actions.statusBadge}
          {showConvertedBadge && (
            <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs">
              ✅ 已转卡片{data.converted_id ? ` #${data.converted_id}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* 来源链接 */}
      <a
        href={data.source_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mb-3 block truncate text-xs text-muted-foreground hover:text-primary"
      >
        {data.source_url}
      </a>

      {/* 生成中提示（仅 learning 未就绪） */}
      {showGeneratingHint && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs text-amber-700">
            <div className="flex items-center gap-2">
              <span className="inline-block animate-pulse">⏳</span>
              AI 正在生成摘要和标签...
            </div>
            {actions.onRegenerate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onRegenerate?.(data);
                }}
                disabled={actions.isRegenerating}
                className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${actions.isRegenerating ? 'animate-spin' : ''}`} />
                重新生成
              </button>
            )}
          </div>
        </div>
      )}

      {/* AI 生成失败提示（AI 模式下 is_ready=True 但 AI 内容为空） */}
      {showAiFailed && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5" />
              AI 生成失败
            </div>
            {actions.onRegenerate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onRegenerate?.(data);
                }}
                disabled={actions.isRegenerating}
                className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${actions.isRegenerating ? 'animate-spin' : ''}`} />
                重新生成
              </button>
            )}
          </div>
        </div>
      )}

      {/* 基础模式待手动填写提示 */}
      {showNoAiHint && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-blue-700">
            <FileText className="h-3.5 w-3.5" />
            点击「收藏」手动填写摘要和标签
          </div>
        </div>
      )}

      {/* 摘要 */}
      {data.ai_summary && !showGeneratingHint && (
        <div className="mb-3">
          <p className="line-clamp-3 text-sm text-muted-foreground">{data.ai_summary}</p>
        </div>
      )}

      {/* 关键观点 */}
      {data.key_points && data.key_points.length > 0 && !showGeneratingHint && (
        <div className="mb-3">
          <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            关键观点
          </h4>
          <ul className="space-y-1 text-xs">
            {data.key_points.slice(0, 3).map((point, i) => (
              <li key={i} className="line-clamp-1 text-muted-foreground">
                • {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 标签 + 时间 + 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(data.ai_tags || []).map((tag, i) => (
            <span key={i} className="badge badge-secondary text-xs">
              {tag}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {new Date(data.created_at).toLocaleDateString('zh-CN')}
        </span>
      </div>

      {/* 底部工具栏 */}
      <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/30 pt-2">
        {actions.extraActions}
        <a
          href={data.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1.5 transition-colors hover:bg-muted"
          title="查看原文"
        >
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </a>
        {actions.onDelete && (
          <DeleteConfirmButton
            onConfirm={() => actions.onDelete!(data.id)}
            buttonClassName="rounded p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
            buttonTitle="删除"
            stopPropagation
            confirmText="确认删除这个条目吗？"
          >
            <Trash2 className="h-4 w-4" />
          </DeleteConfirmButton>
        )}
      </div>
    </div>
  );
}
