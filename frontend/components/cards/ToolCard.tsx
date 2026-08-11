'use client';

import { Wrench, Eye, Clock, Trash2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import type { ToolCardData } from './shared';
import { extractDomain } from './shared';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import { useAiMode } from '@/hooks/useAiMode';

export interface ToolCardActions {
  /** 点击整行 → 查看详情（弹窗内才有编辑按钮） */
  onView?: (data: ToolCardData) => void;
  /** AI 重新生成（仅 learning 失败时由父组件传入） */
  onRegenerate?: (data: ToolCardData) => void;
  isRegenerating?: boolean;
  /** 打开外部链接（工具箱会调 visit API 记录访问） */
  onOpenExternal?: (data: ToolCardData) => void;
  /** 删除 */
  onDelete?: (id: number) => void;
  /** 顶部状态徽标插槽（生成中 / 已转正等） */
  statusBadge?: React.ReactNode;
  /** 底部额外按钮插槽（如暂存区的「转为正式」） */
  extraActions?: React.ReactNode;
}

interface ToolCardProps {
  data: ToolCardData;
  actions: ToolCardActions;
}

/**
 * 统一工具卡片 UI，用于「工具箱」与「暂存区 tool Tab」。
 *
 * 布局：紧凑行列表（favicon + 标题/域名 + 标签 + 访问统计 + 操作按钮）
 *   - 整行点击 → onView（查看详情，弹窗内才有编辑按钮）
 *   - 底部操作：打开外链 · [extraActions] · 删除
 *   - learning 失败：行内红色 chip 内嵌「重新生成」按钮（onRegenerate 由父组件仅在失败时传入）
 *
 * 通用功能：查看 / 打开外链 / 删除
 * 场景专属（通过插槽注入）：转为正式（learning）、生成中提示（learning !is_ready）
 */
export default function ToolCard({ data, actions }: ToolCardProps) {
  const { domain, faviconUrl } = extractDomain(data.url);
  const { aiMode } = useAiMode();

  const showGeneratingHint = data.source === 'learning' && data.is_ready === false;
  // AI 模式下：is_ready=True 但 description 为空 → 生成失败（红色 + 重试）
  const showAiFailed =
    data.source === 'learning' &&
    data.is_ready === true &&
    !data.description &&
    !data.is_converted &&
    aiMode;
  // 基础模式下：is_ready=True 但 description 为空 → 待手动填写（蓝色）
  const showNoAiHint =
    data.source === 'learning' &&
    data.is_ready === true &&
    !data.description &&
    !data.is_converted &&
    !aiMode;
  const showConvertedBadge = data.source === 'learning' && data.is_converted;

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    actions.onOpenExternal?.(data);
  };

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm cursor-pointer"
      onClick={() => actions.onView?.(data)}
    >
      {/* favicon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
        {faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded-sm"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const sibling = (e.currentTarget.parentElement?.querySelector('.fallback-icon')) as HTMLElement | null;
              if (sibling) sibling.style.display = 'block';
            }}
          />
        ) : null}
        <Wrench
          className="fallback-icon h-5 w-5 text-muted-foreground"
          style={{ display: faviconUrl ? 'none' : 'block' }}
        />
      </div>

      {/* 标题 + 域名 + 描述（点击不跳转，整行已绑定 onView） */}
      <div className="min-w-0 flex-1">
        <span
          className="block truncate text-sm font-medium transition-colors hover:text-primary"
          title={data.title}
        >
          {data.title}
        </span>
        {domain && (
          <span className="block truncate text-xs text-muted-foreground">
            {domain}
          </span>
        )}
        {data.description && (
          <span className="block mt-1 line-clamp-2 text-xs text-muted-foreground/80" title={data.description}>
            {data.description}
          </span>
        )}
      </div>

      {/* 状态徽标 */}
      {actions.statusBadge}
      {showGeneratingHint && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
          <span className="animate-pulse">⏳</span>
          生成中
          {actions.onRegenerate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.onRegenerate?.(data);
              }}
              disabled={actions.isRegenerating}
              className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-600 px-1.5 py-0.5 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-2.5 w-2.5 ${actions.isRegenerating ? 'animate-spin' : ''}`} />
              重试
            </button>
          )}
        </span>
      )}
      {showAiFailed && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
          <AlertCircle className="h-3 w-3" />
          AI 生成失败
          {actions.onRegenerate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.onRegenerate?.(data);
              }}
              disabled={actions.isRegenerating}
              className="ml-1 inline-flex items-center gap-0.5 rounded bg-red-600 px-1.5 py-0.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-2.5 w-2.5 ${actions.isRegenerating ? 'animate-spin' : ''}`} />
              重试
            </button>
          )}
        </span>
      )}
      {showNoAiHint && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          <Wrench className="h-3 w-3" />
          待手动填写
        </span>
      )}
      {showConvertedBadge && (
        <span className="inline-flex shrink-0 items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
          ✅ 已转工具{data.converted_id ? ` #${data.converted_id}` : ''}
        </span>
      )}

      {/* 标签 */}
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        {(data.ai_tags || []).slice(0, 3).map((tag, i) => (
          <span key={i} className="badge badge-secondary text-xs">
            {tag}
          </span>
        ))}
      </div>

      {/* 访问次数（仅 toolbox） */}
      {data.source === 'toolbox' && typeof data.visit_count === 'number' && (
        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground md:flex">
          <Eye className="h-3.5 w-3.5" />
          {data.visit_count}
        </span>
      )}

      {/* 最近访问时间（仅 toolbox） */}
      {data.source === 'toolbox' && data.last_visited_at && (
        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground lg:flex">
          <Clock className="h-3.5 w-3.5" />
          {new Date(data.last_visited_at).toLocaleDateString('zh-CN')}
        </span>
      )}

      {/* 创建时间（learning 或无 last_visited_at 时显示） */}
      {data.source === 'learning' && (
        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground lg:flex">
          <Clock className="h-3.5 w-3.5" />
          {new Date(data.created_at).toLocaleDateString('zh-CN')}
        </span>
      )}

      {/* 操作按钮 */}
      <div className="flex shrink-0 items-center gap-1">
        {actions.extraActions}
        {actions.onOpenExternal && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleOpen}
            className="rounded p-1.5 transition-colors hover:bg-muted"
            title="打开"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        )}
        {actions.onDelete && (
          <DeleteConfirmButton
            onConfirm={() => actions.onDelete!(data.id)}
            buttonClassName="rounded p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
            buttonTitle="删除"
            stopPropagation
            confirmText="确认删除这个工具吗？"
          >
            <Trash2 className="h-4 w-4" />
          </DeleteConfirmButton>
        )}
      </div>
    </div>
  );
}
