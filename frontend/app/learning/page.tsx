'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Wrench,
  Calendar,
  Shuffle,
} from 'lucide-react';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import { learningApi } from '@/services/api';
import type { LearningItem } from '@/types';
import KnowledgeCard, { KnowledgeCardActions } from '@/components/cards/KnowledgeCard';
import ToolCard, { ToolCardActions } from '@/components/cards/ToolCard';
import KnowledgeDetailModal from '@/components/cards/KnowledgeDetailModal';
import ToolDetailModal from '@/components/cards/ToolDetailModal';
import {
  adaptLearningArticle,
  adaptLearningTool,
  type KnowledgeCardData,
  type ToolCardData,
} from '@/components/cards/shared';

type TabKey = 'unspecified' | 'article' | 'tool';

export default function LearningPage() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // key = `${id}` 或 `${id}-${overrideType}`
  const [converting, setConverting] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabKey>('unspecified');
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeCardData | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolCardData | null>(null);

  const loadItems = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await learningApi.list();
      const safeData = (Array.isArray(data) ? data : []).map((item: LearningItem) => ({
        ...item,
        key_points: Array.isArray(item.key_points) ? item.key_points : [],
        ai_tags: Array.isArray(item.ai_tags) ? item.ai_tags : [],
      }));
      setItems(safeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  // 如果有 AI 未就绪且类型已明确的条目，每 5 秒轮询一次
  // unspecified 条目不会被后台 AI 处理，不必轮询（节省资源）
  useEffect(() => {
    const hasPending = items.some(
      (i) =>
        !i.is_ready &&
        !i.is_converted &&
        i.item_type !== 'unspecified'
    );
    if (!hasPending) return;
    const timer = setTimeout(() => {
      loadItems(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [items]);

  const handleConvert = async (id: number, overrideType?: 'article' | 'tool') => {
    const key = overrideType ? `${id}-${overrideType}` : `${id}`;
    setConverting((prev) => ({ ...prev, [key]: true }));
    try {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      const body: Record<string, unknown> = {};
      if (overrideType) body.item_type = overrideType;
      if (item.ai_summary) body.ai_summary = item.ai_summary;
      if (item.key_points && item.key_points.length > 0) body.key_points = item.key_points;
      if (item.ai_tags && item.ai_tags.length > 0) body.ai_tags = item.ai_tags;
      if (item.tool_description) body.tool_description = item.tool_description;

      await learningApi.convert(id, body as Parameters<typeof learningApi.convert>[1]);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '转换失败');
    } finally {
      setConverting((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await learningApi.delete(id);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 按类型分桶：严格三态区分，unspecified 不混入 article
  const unspecifiedItems = items.filter((i) => i.item_type === 'unspecified');
  const articleItems = items.filter((i) => i.item_type === 'article');
  const toolItems = items.filter((i) => i.item_type === 'tool');
  const tabItems: LearningItem[] =
    activeTab === 'unspecified'
      ? unspecifiedItems
      : activeTab === 'article'
        ? articleItems
        : toolItems;

  const unspecifiedPendingCount = unspecifiedItems.filter((i) => !i.is_converted).length;
  const articlePendingCount = articleItems.filter((i) => !i.is_ready && !i.is_converted).length;
  const toolPendingCount = toolItems.filter((i) => !i.is_ready && !i.is_converted).length;

  // ========== article 详情弹窗：编辑保存 ==========
  const handleArticleUpdated = (updated: {
    id: number;
    source: 'learning' | 'cards';
    title: string;
    source_url: string;
    ai_summary: string;
    key_points: string[];
    ai_tags: string[];
    created_at: string;
  }) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === updated.id
          ? {
              ...i,
              title: updated.title,
              ai_summary: updated.ai_summary,
              key_points: updated.key_points,
              ai_tags: updated.ai_tags,
            }
          : i
      )
    );
    setSelectedArticle((prev) =>
      prev && prev.id === updated.id
        ? {
            ...prev,
            title: updated.title,
            ai_summary: updated.ai_summary,
            key_points: updated.key_points,
            ai_tags: updated.ai_tags,
          }
        : prev
    );
  };

  // ========== tool 详情弹窗：编辑保存 ==========
  const handleToolUpdated = (updated: {
    id: number;
    source: 'learning' | 'toolbox';
    title: string;
    url: string;
    ai_tags: string[];
    description: string | null;
    created_at: string;
    visit_count?: number;
    last_visited_at?: string | null;
  }) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === updated.id
          ? {
              ...i,
              title: updated.title,
              tool_description: updated.description,
            }
          : i
      )
    );
    setSelectedTool((prev) =>
      prev && prev.id === updated.id
        ? { ...prev, title: updated.title, description: updated.description }
        : prev
    );
  };

  // ========== AI 重新生成（learning 用 enrich） ==========
  const handleRegenerate = async (id: number) => {
    setRegeneratingId(id);
    try {
      await learningApi.enrich(id);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setRegeneratingId(null);
    }
  };

  const renderUnspecifiedCard = (item: LearningItem) => {
    const articleKey = `${item.id}-article`;
    const toolKey = `${item.id}-tool`;
    const busyArticle = !!converting[articleKey];
    const busyTool = !!converting[toolKey];
    let domain = '';
    try {
      domain = new URL(item.source_url).hostname;
    } catch {}
    return (
      <div
        key={item.id}
        className="rounded-lg border border-border bg-card p-4 hover:border-purple-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm line-clamp-2 flex-1">{item.title}</h3>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs">
            <Shuffle className="h-3 w-3" />
            待分类
          </span>
        </div>
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary truncate block mb-3"
        >
          {item.source_url}
        </a>

        {/* 待分类提示：AI 暂未生成，等用户选择类型后同步生成 */}
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 mb-3">
          <div className="text-xs text-purple-700">
            🗂️ 尚未选择归档类型，转正时 AI 会按所选类型同步生成内容
          </div>
        </div>

        {item.is_converted && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 mb-3">
            <div className="text-xs text-green-700">
              ✅ 已转为{item.item_type === 'tool' ? '工具' : '卡片'}
              {item.converted_id && ` #${item.converted_id}`}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(item.created_at)}
            {domain ? <span className="opacity-60">· {domain}</span> : null}
          </span>
          <div className="flex items-center gap-2">
            {!item.is_converted && (
              <>
                <button
                  onClick={() => handleConvert(item.id, 'article')}
                  disabled={busyArticle || busyTool}
                  className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  title="以知识卡片形式转正"
                >
                  {busyArticle ? '...' : '📄 转为知识卡片'}
                </button>
                <button
                  onClick={() => handleConvert(item.id, 'tool')}
                  disabled={busyArticle || busyTool}
                  className="text-xs px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-50"
                  title="以工具形式转正"
                >
                  {busyTool ? '...' : '🔧 转为工具'}
                </button>
              </>
            )}
            <DeleteConfirmButton
              onConfirm={() => handleDelete(item.id)}
              buttonClassName="text-xs px-2 py-1 rounded border border-border hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
              buttonTitle="删除"
              confirmText="确认删除这个条目吗？"
            >
              删除
            </DeleteConfirmButton>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📥 暂存区</h1>
          <p className="text-sm text-muted-foreground mt-1">
            快速收藏的内容在此排队，AI 后台生成摘要和标签，读完后转为卡片或工具
          </p>
        </div>
        <button onClick={() => loadItems()} className="button button-outline">
          🔄 刷新
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
          <button
            onClick={() => setError('')}
            className="ml-2 text-red-500 hover:underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* Tab 切换：待分类 / 知识卡片 / 工具 */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton
          active={activeTab === 'unspecified'}
          onClick={() => setActiveTab('unspecified')}
          icon={<Shuffle className="h-4 w-4" />}
          label="待分类"
          count={unspecifiedItems.length}
          pending={unspecifiedPendingCount}
        />
        <TabButton
          active={activeTab === 'article'}
          onClick={() => setActiveTab('article')}
          icon={<FileText className="h-4 w-4" />}
          label="知识卡片"
          count={articleItems.length}
          pending={articlePendingCount}
        />
        <TabButton
          active={activeTab === 'tool'}
          onClick={() => setActiveTab('tool')}
          icon={<Wrench className="h-4 w-4" />}
          label="工具"
          count={toolItems.length}
          pending={toolPendingCount}
        />
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
          <p>加载中...</p>
        </div>
      )}

      {!loading && tabItems.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">
            {activeTab === 'unspecified'
              ? '🗂️'
              : activeTab === 'article'
                ? '📭'
                : '🧰'}
          </div>
          <p>
            {activeTab === 'unspecified'
              ? '暂无需分类的内容'
              : activeTab === 'article'
                ? '暂存区还没有知识类内容'
                : '暂存区还没有工具类内容'}
          </p>
          <p className="text-sm mt-2">
            {activeTab === 'unspecified'
              ? '通过⭐️书签或 FlowShelf 书签小按钮收藏的内容会出现在这里，等你选择归档类型'
              : `点击浏览器扩展图标，快速收藏${activeTab === 'article' ? '文章' : '工具'}到这里`}
          </p>
        </div>
      )}

      {/* 待分类 tab：列表视图 + 双按钮（保持原有逻辑不变） */}
      {!loading && tabItems.length > 0 && activeTab === 'unspecified' && (
        <div className="grid gap-4 md:grid-cols-2">
          {tabItems.map((item) => renderUnspecifiedCard(item))}
        </div>
      )}

      {/* 知识卡片 tab：使用统一 KnowledgeCard 组件 */}
      {!loading && tabItems.length > 0 && activeTab === 'article' && (
        <div className="grid gap-4 md:grid-cols-2">
          {tabItems.map((item) => {
            const data = adaptLearningArticle(item);
            const isConverted = !!item.is_converted;
            // AI 生成失败：is_ready=true 但 ai_summary 为空（后端 enrich 失败时标记 is_ready=true）
            const isFailed = item.is_ready === true && !item.ai_summary;
            const actions: KnowledgeCardActions = {
              onView: () => setSelectedArticle(data),
              // 仅失败时提供重新生成入口（卡片内嵌红色 chip）
              ...(isFailed
                ? {
                    onRegenerate: () => handleRegenerate(item.id),
                    isRegenerating: regeneratingId === item.id,
                  }
                : {}),
              onDelete: (id) => handleDelete(id),
              extraActions: !isConverted ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConvert(item.id);
                  }}
                  disabled={!!converting[`${item.id}`]}
                  className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  title="转为正式卡片"
                >
                  {converting[`${item.id}`] ? '转换中...' : '转为正式'}
                </button>
              ) : null,
            };
            return (
              <KnowledgeCard key={item.id} data={data} actions={actions} />
            );
          })}
        </div>
      )}

      {/* 工具 tab：使用统一 ToolCard 组件 */}
      {!loading && tabItems.length > 0 && activeTab === 'tool' && (
        <div className="space-y-2">
          {tabItems.map((item) => {
            const data = adaptLearningTool(item);
            const isConverted = !!item.is_converted;
            // AI 生成失败：is_ready=true 但 tool_description 为空
            const isFailed = item.is_ready === true && !item.tool_description;
            const actions: ToolCardActions = {
              onView: () => setSelectedTool(data),
              ...(isFailed
                ? {
                    onRegenerate: () => handleRegenerate(item.id),
                    isRegenerating: regeneratingId === item.id,
                  }
                : {}),
              onOpenExternal: () => {
                // learning tool 未转正，不记录访问
              },
              onDelete: (id) => handleDelete(id),
              extraActions: !isConverted ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConvert(item.id);
                  }}
                  disabled={!!converting[`${item.id}`]}
                  className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  title="转为正式工具"
                >
                  {converting[`${item.id}`] ? '...' : '转为正式'}
                </button>
              ) : null,
            };
            return <ToolCard key={item.id} data={data} actions={actions} />;
          })}
        </div>
      )}

      {/* article 详情/编辑弹窗（仅失败时显示 AI 重新生成按钮） */}
      <KnowledgeDetailModal
        data={selectedArticle}
        onClose={() => setSelectedArticle(null)}
        onUpdated={handleArticleUpdated}
        onRegenerate={async (id) => {
          await handleRegenerate(id);
        }}
        isFailed={
          !!selectedArticle &&
          selectedArticle.source === 'learning' &&
          selectedArticle.is_ready === true &&
          !selectedArticle.ai_summary
        }
      />

      {/* tool 详情/编辑弹窗（仅失败时显示 AI 重新生成按钮） */}
      <ToolDetailModal
        data={selectedTool}
        onClose={() => setSelectedTool(null)}
        onUpdated={handleToolUpdated}
        onRegenerate={async (id) => {
          await handleRegenerate(id);
        }}
        isFailed={
          !!selectedTool &&
          selectedTool.source === 'learning' &&
          selectedTool.is_ready === true &&
          !selectedTool.description
        }
      />
    </div>
  );
}

// ========== 内联辅助组件 ==========

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  pending?: number;
}

function TabButton({ active, onClick, icon, label, count, pending }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
      {pending && pending > 0 ? (
        <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">
          {pending}
        </span>
      ) : null}
    </button>
  );
}
