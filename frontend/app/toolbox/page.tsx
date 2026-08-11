'use client';

import { useState } from 'react';
import { Wrench, Search, Plus } from 'lucide-react';
import { toolsApi } from '@/services/api';
import AddItemModal from '@/components/AddItemModal';
import SearchBar, { SearchStatus } from '@/components/SearchBar';
import TagFilter from '@/components/TagFilter';
import { EmptyState, ListRowSkeleton } from '@/components/StateDisplays';
import { useListPage } from '@/hooks/useListPage';
import { useAiMode } from '@/hooks/useAiMode';
import ToolCard, { ToolCardActions } from '@/components/cards/ToolCard';
import ToolDetailModal from '@/components/cards/ToolDetailModal';
import { adaptTool, type ToolCardData } from '@/components/cards/shared';
import type { Tool, SearchResult, TagCount } from '@/types';

// SearchResult → Tool 适配层：搜索态用 searchApi 返回的 SearchResult 渲染工具列表，
// 字段映射回 Tool 结构以复用既有渲染逻辑。
const adaptSearchResultToTool = (r: SearchResult): Tool => ({
  id: r.id,
  url: r.url,
  title: r.title,
  ai_tags: r.tags,
  description: r.summary,
  visit_count: r.visit_count ?? 0,
  last_visited_at: r.last_visited_at ?? null,
  created_at: r.created_at || new Date().toISOString(),
  updated_at: r.created_at || new Date().toISOString(),
});

export default function ToolboxPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ToolCardData | null>(null);
  const [sortBy, setSortBy] = useState('created_at');
  const { aiMode } = useAiMode();

  // toolbox 额外依赖 sortBy：变化时需要重新 fetch（useListPage extraDeps）
  const list = useListPage<Tool, { tag?: string; query?: string; sortBy?: string }>({
    queryKeyPrefix: 'tools',
    fetchList: (opts) =>
      toolsApi.list({
        limit: 50,
        tag: opts.tag,
        sort_by: opts.sortBy || sortBy,
      }),
    fetchTags: toolsApi.tags as () => Promise<TagCount[]>,
    adaptSearchResult: adaptSearchResultToTool,
    deleteItem: async (id) => { await toolsApi.delete(id); },
    searchType: 'tools',
    useSemantic: aiMode,
    extraDeps: [sortBy],
  });

  const {
    items: tools,
    isLoading,
    searchInput, setSearchInput, searchQuery, setSearchQuery, isSearching,
    clearSearch,
    allTags, activeTag, setActiveTag,
    handleDelete, refresh, refreshTags,
  } = list;

  const handleVisit = async (id: number) => {
    try {
      await toolsApi.visit(id);
      // 访问后刷新（更新访问计数）——不影响搜索/标签上下文
      await refresh();
    } catch (err) {
      console.error('记录访问失败:', err);
    }
  };

  const handleView = (data: ToolCardData) => {
    setSelectedTool(data);
  };

  const handleUpdated = (updated: {
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
    list.setItems((prev) =>
      prev.map((t) =>
        t.id === updated.id
          ? {
              ...t,
              title: updated.title,
              url: updated.url,
              description: updated.description,
            }
          : t
      )
    );
    setSelectedTool((prev) =>
      prev && prev.id === updated.id
        ? { ...prev, title: updated.title, url: updated.url, description: updated.description }
        : prev
    );
  };

  // 构建卡片 actions（工具箱不暴露 AI 重新生成，仅在弹窗内编辑）
  const toolActions: ToolCardActions = {
    onView: handleView,
    onOpenExternal: (data) => {
      // 仅 toolbox 记录访问
      if (data.source === 'toolbox') {
        handleVisit(data.id);
      }
    },
    onDelete: (id) => handleDelete(id),
  };

  return (
    <div className="space-y-8">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-7 w-7 text-primary" />
            智能工具箱
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            已收藏 {tools.length} 个工具，AI 自动打标签 + 行为排序
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="button button-primary">
          <Plus className="mr-2 h-4 w-4" />
          添加工具
        </button>
      </div>

      {/* 搜索框 */}
      <SearchBar
        placeholder="在工具箱中搜索（标题 / 标签 / 描述）"
        searchQuery={searchQuery}
        searchInput={searchInput}
        onInputChange={setSearchInput}
        onSubmit={(val) => setSearchQuery(val)}
        onClear={clearSearch}
      />

      {/* 搜索状态提示 */}
      {isSearching && (
        <SearchStatus searchQuery={searchQuery} resultCount={tools.length} onClear={clearSearch} unit="个工具" />
      )}

      {/* 筛选和排序（搜索时隐藏，搜索优先）*/}
      {!isSearching && (
        <div className="flex flex-wrap items-center gap-4">
          <TagFilter
            allTags={allTags as TagCount[]}
            activeTag={activeTag}
            onTagChange={setActiveTag}
            label="筛选："
          />

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm font-medium text-muted-foreground">排序：</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input h-9 w-auto"
            >
              <option value="created_at">最新添加</option>
              <option value="visit_count">使用频率</option>
              <option value="last_visited_at">最近使用</option>
            </select>
          </div>
        </div>
      )}

      {/* 工具列表 - 紧凑列表布局 */}
      {isLoading ? (
        <ListRowSkeleton rows={5} />
      ) : tools.length === 0 ? (
        <EmptyState
          icon={isSearching ? <Search className="h-8 w-8 text-primary" /> : <Wrench className="h-8 w-8 text-primary" />}
          title={isSearching ? '没有匹配的工具' : '工具箱是空的'}
          description={isSearching
            ? '换个关键词试试，或清除搜索查看全部工具'
            : '点击"添加工具"按钮收藏第一个常用工具'}
        />
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              data={adaptTool(tool)}
              actions={toolActions}
            />
          ))}
        </div>
      )}

      {/* 详情/编辑弹窗 */}
      <ToolDetailModal
        data={selectedTool}
        onClose={() => setSelectedTool(null)}
        onUpdated={handleUpdated}
      />

      {/* 添加工具弹窗 */}
      <AddItemModal
        kind="tool"
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={() => { refresh(); refreshTags(); }}
      />
    </div>
  );
}
