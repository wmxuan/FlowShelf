'use client';

import { useState } from 'react';
import { Wrench, Eye, Clock, Trash2, ExternalLink, Search, Plus } from 'lucide-react';
import { toolsApi } from '@/services/api';
import AddItemModal from '@/components/AddItemModal';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import SearchBar, { SearchStatus } from '@/components/SearchBar';
import TagFilter from '@/components/TagFilter';
import { EmptyState, ListRowSkeleton } from '@/components/StateDisplays';
import { useListPage } from '@/hooks/useListPage';
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
  const [sortBy, setSortBy] = useState('created_at');

  // toolbox 额外依赖 sortBy：变化时需要重新 fetch（useListPage extraDeps）
  const list = useListPage<Tool, { tag?: string; query?: string; sortBy?: string }>({
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
          {tools.map((tool) => {
            // 从 URL 提取域名用于获取 favicon
            let domain = '';
            try {
              domain = new URL(tool.url).hostname;
            } catch {
              domain = '';
            }
            const faviconUrl = domain
              ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
              : '';

            return (
              <div
                key={tool.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/30 hover:shadow-sm transition-all"
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

                {/* 标题 + 域名 */}
                <div className="min-w-0 flex-1">
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleVisit(tool.id)}
                    className="block truncate text-sm font-medium hover:text-primary transition-colors"
                    title={tool.title}
                  >
                    {tool.title}
                  </a>
                  {domain && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {domain}
                    </span>
                  )}
                </div>

                {/* 标签 */}
                <div className="hidden sm:flex shrink-0 items-center gap-1">
                  {(tool.ai_tags || []).slice(0, 3).map((tag, i) => (
                    <span key={i} className="badge badge-secondary text-xs">{tag}</span>
                  ))}
                </div>

                {/* 访问次数 */}
                <span className="hidden md:flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  {tool.visit_count}
                </span>

                {/* 最后访问时间 */}
                {tool.last_visited_at && (
                  <span className="hidden lg:flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(tool.last_visited_at).toLocaleDateString('zh-CN')}
                  </span>
                )}

                {/* 操作按钮 - 默认显示 */}
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleVisit(tool.id)}
                    className="rounded p-1.5 hover:bg-muted transition-colors"
                    title="打开并记录访问"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                  <DeleteConfirmButton
                    onConfirm={() => handleDelete(tool.id)}
                    buttonClassName="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                    buttonTitle="删除"
                    confirmText="确认删除这个工具吗？"
                  >
                    <Trash2 className="h-4 w-4" />
                  </DeleteConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
