'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Wrench,
  Calendar,
  Shuffle,
} from 'lucide-react';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import ConvertModal from '@/components/ConvertModal';
import { learningApi } from '@/services/api';
import { useAiMode } from '@/hooks/useAiMode';
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

const LEARNING_KEY = ['learning', 'items'] as const;

export default function LearningPage() {
  const queryClient = useQueryClient();
  const { aiMode } = useAiMode();
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('unspecified');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeCardData | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolCardData | null>(null);
  // 转换弹窗
  const [convertItem, setConvertItem] = useState<LearningItem | null>(null);
  const [convertOverrideType, setConvertOverrideType] = useState<'article' | 'tool' | undefined>(undefined);

  // ============ 列表数据（useQuery） ============

  const itemsQuery = useQuery({
    queryKey: LEARNING_KEY,
    queryFn: async (): Promise<LearningItem[]> => {
      const data = await learningApi.list();
      const safeData = (Array.isArray(data) ? data : []).map((item: LearningItem) => ({
        ...item,
        key_points: Array.isArray(item.key_points) ? item.key_points : [],
        ai_tags: Array.isArray(item.ai_tags) ? item.ai_tags : [],
      }));
      return safeData;
    },
    // 有 is_ready=False 的条目时，每 3 秒轮询（AI 生成中）
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.some((item: LearningItem) => !item.is_ready && !item.is_converted)) {
        return 3000;
      }
      return false;
    },
  });

  const items = itemsQuery.data ?? [];
  const loading = itemsQuery.isLoading && !itemsQuery.isPlaceholderData;

  // ============ 删除（useMutation） ============

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await learningApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEARNING_KEY });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '删除失败');
    },
  });

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  // ============ 手动刷新（仅刷新列表数据，不触发轮询等 AI 逻辑） ============

  const loadItems = useCallback(async () => {
    await itemsQuery.refetch();
  }, [itemsQuery]);

  /** 打开转换弹窗 */
  const openConvertModal = (item: LearningItem, overrideType?: 'article' | 'tool') => {
    setConvertItem(item);
    setConvertOverrideType(overrideType);
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

  // ========== article 详情弹窗：编辑保存（乐观更新） ==========
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
    queryClient.setQueryData<LearningItem[]>(LEARNING_KEY, (prev) =>
      prev?.map((i) =>
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

  // ========== tool 详情弹窗：编辑保存（乐观更新） ==========
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
    queryClient.setQueryData<LearningItem[]>(LEARNING_KEY, (prev) =>
      prev?.map((i) =>
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

  const renderUnspecifiedCard = (item: LearningItem) => {
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

        {/* 待分类提示 */}
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 mb-3">
          <div className="text-xs text-purple-700">
            {aiMode
              ? '🗂️ 尚未选择归档类型，转正时 AI 会按所选类型同步生成内容'
              : '🗂️ 尚未选择归档类型，选择后可收藏到卡片库或工具箱'}
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
                  onClick={() => openConvertModal(item, 'article')}
                  className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  title="以知识卡片形式转正"
                >
                  {aiMode ? '📄 转为知识卡片' : '📄 收藏到卡片库'}
                </button>
                <button
                  onClick={() => openConvertModal(item, 'tool')}
                  className="text-xs px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                  title={aiMode ? '以工具形式转正' : '收藏到工具箱'}
                >
                  {aiMode ? '🔧 转为工具' : '🔧 收藏到工具箱'}
                </button>
              </>
            )}
            <DeleteConfirmButton
              onConfirm={() => handleDelete(item.id)}
              buttonClassName="text-xs px-2 py-1 rounded border border-border hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
              buttonTitle="删除"
              stopPropagation
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
        />
        <TabButton
          active={activeTab === 'article'}
          onClick={() => setActiveTab('article')}
          icon={<FileText className="h-4 w-4" />}
          label="知识卡片"
          count={articleItems.length}
        />
        <TabButton
          active={activeTab === 'tool'}
          onClick={() => setActiveTab('tool')}
          icon={<Wrench className="h-4 w-4" />}
          label="工具"
          count={toolItems.length}
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
            const actions: KnowledgeCardActions = {
              onView: () => setSelectedArticle(data),
              onDelete: (id) => handleDelete(id),
              extraActions: !isConverted ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openConvertModal(item);
                  }}
                  className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  title={aiMode ? '转为正式卡片' : '收藏到卡片库'}
                >
                  {aiMode ? '转为正式' : '收藏'}
                </button>
              ) : null,
            };
            return <KnowledgeCard key={item.id} data={data} actions={actions} />;
          })}
        </div>
      )}

      {/* 工具 tab：使用统一 ToolCard 组件 */}
      {!loading && tabItems.length > 0 && activeTab === 'tool' && (
        <div className="space-y-2">
          {tabItems.map((item) => {
            const data = adaptLearningTool(item);
            const isConverted = !!item.is_converted;
            const actions: ToolCardActions = {
              onView: () => setSelectedTool(data),
              onOpenExternal: () => {
                // learning tool 未转正，不记录访问
              },
              onDelete: (id) => handleDelete(id),
              extraActions: !isConverted ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openConvertModal(item);
                  }}
                  className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  title={aiMode ? '转为正式工具' : '收藏到工具箱'}
                >
                  {aiMode ? '转为正式' : '收藏'}
                </button>
              ) : null,
            };
            return <ToolCard key={item.id} data={data} actions={actions} />;
          })}
        </div>
      )}

      {/* article 详情/编辑弹窗 */}
      <KnowledgeDetailModal
        data={selectedArticle}
        onClose={() => setSelectedArticle(null)}
        onUpdated={handleArticleUpdated}
      />

      {/* tool 详情/编辑弹窗 */}
      <ToolDetailModal
        data={selectedTool}
        onClose={() => setSelectedTool(null)}
        onUpdated={handleToolUpdated}
      />

      {/* 转换弹窗：基础模式空表单 / AI模式AI生成+可编辑 */}
      <ConvertModal
        open={!!convertItem}
        item={convertItem}
        aiMode={aiMode}
        initialTargetType={convertOverrideType}
        onClose={() => {
          setConvertItem(null);
          setConvertOverrideType(undefined);
        }}
        onConverted={() => loadItems()}
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
}

function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
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
    </button>
  );
}
