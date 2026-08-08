'use client';

import { useEffect, useState } from 'react';
import { Wrench, Tag, Clock, Eye, Trash2, ExternalLink, Search, X, Plus } from 'lucide-react';
import { toolsApi, searchApi } from '@/services/api';
import AddToolModal from '@/components/AddToolModal';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
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
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [sortBy, setSortBy] = useState('created_at');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const isSearching = searchQuery.trim().length > 0;

  // 搜索态走 searchApi（混合检索，忽略 sort_by/tag），非搜索态走 toolsApi.list
  const fetchTools = async () => {
    setIsLoading(true);
    try {
      if (isSearching) {
        const resp = await searchApi.semantic(searchQuery.trim(), 'tools', 50);
        setTools(resp.results.map(adaptSearchResultToTool));
      } else {
        const data = await toolsApi.list({
          limit: 50,
          tag: activeTag || undefined,
          sort_by: sortBy,
        });
        setTools(data);
      }
    } catch (err) {
      console.error('获取工具失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const data = await toolsApi.tags();
      setAllTags(data);
    } catch (err) {
      console.error('获取标签失败:', err);
    }
  };

  // 搜索优先：有搜索词走 searchApi（忽略标签/排序），无搜索词走标签+排序
  useEffect(() => {
    fetchTools();
  }, [activeTag, sortBy, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await toolsApi.delete(id);
      fetchTools();
      fetchTags();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  const handleVisit = async (id: number) => {
    try {
      await toolsApi.visit(id);
      fetchTools();
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
        <button
          onClick={() => setShowAddModal(true)}
          className="button button-primary"
        >
          <Plus className="mr-2 h-4 w-4" />
          添加工具
        </button>
      </div>

      {/* 搜索框 */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="在工具箱中搜索（标题 / 标签 / 描述）"
            className="input pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted transition-colors"
              title="清除搜索"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <button type="submit" className="button button-primary" disabled={!searchInput.trim()}>
          搜索
        </button>
      </form>

      {/* 搜索状态提示 */}
      {isSearching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            搜索「<span className="font-medium text-foreground">{searchQuery}</span>」
            找到 {tools.length} 个工具
          </span>
          <button onClick={clearSearch} className="badge badge-secondary hover:bg-muted">
            清除搜索
          </button>
        </div>
      )}

      {/* 筛选和排序（搜索时隐藏，搜索优先） */}
      {!isSearching && (
        <div className="flex flex-wrap items-center gap-4">
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Tag className="h-4 w-4" />
                筛选：
              </span>
              <button
                onClick={() => setActiveTag(null)}
                className={`badge ${!activeTag ? 'badge-primary' : 'badge-secondary'}`}
              >
                全部
              </button>
              {(showAllTags ? allTags : allTags.slice(0, 15)).map((t) => (
                <button
                  key={t.name}
                  onClick={() => setActiveTag(t.name === activeTag ? null : t.name)}
                  className={`badge ${t.name === activeTag ? 'badge-primary' : 'badge-secondary'}`}
                >
                  {t.name}
                  <span className="ml-1 opacity-60">{t.count}</span>
                </button>
              ))}
              {allTags.length > 15 && (
                <button
                  onClick={() => setShowAllTags(!showAllTags)}
                  className="badge badge-secondary"
                >
                  {showAllTags ? '收起' : `+${allTags.length - 15} 更多`}
                </button>
              )}
            </div>
          )}

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
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 animate-pulse"
            >
              <div className="h-8 w-8 bg-muted rounded-md shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-1/3 bg-muted rounded" />
                <div className="h-3 w-1/4 bg-muted rounded" />
              </div>
              <div className="flex gap-1">
                <div className="h-5 w-12 bg-muted rounded-full" />
                <div className="h-5 w-12 bg-muted rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : tools.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {isSearching ? (
              <Search className="h-8 w-8 text-primary" />
            ) : (
              <Wrench className="h-8 w-8 text-primary" />
            )}
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {isSearching ? '没有匹配的工具' : '工具箱是空的'}
          </h3>
          <p className="text-muted-foreground">
            {isSearching
              ? '换个关键词试试，或清除搜索查看全部工具'
              : '点击"添加工具"按钮收藏第一个常用工具'}
          </p>
        </div>
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
                        // 加载失败时隐藏 img，显示备用 Wrench 图标
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
                    <span key={i} className="badge badge-secondary text-xs">
                      {tag}
                    </span>
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
      <AddToolModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={() => {
          fetchTools();
          fetchTags();
        }}
      />
    </div>
  );
}