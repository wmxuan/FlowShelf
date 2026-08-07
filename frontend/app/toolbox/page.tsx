'use client';

import { useEffect, useState } from 'react';
import { Wrench, Tag, Clock, Eye, Trash2, ExternalLink, Search, X } from 'lucide-react';
import { toolsApi } from '@/services/api';
import type { Tool, TagCount } from '@/types';

export default function ToolboxPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [sortBy, setSortBy] = useState('created_at');
  const [newToolUrl, setNewToolUrl] = useState('');
  const [newToolTitle, setNewToolTitle] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const isSearching = searchQuery.trim().length > 0;

  const fetchTools = async () => {
    setIsLoading(true);
    try {
      const data = await toolsApi.list({
        limit: 50,
        tag: isSearching ? undefined : activeTag || undefined,
        sort_by: sortBy,
        q: isSearching ? searchQuery.trim() : undefined,
      });
      setTools(data);
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

  // 搜索优先：有搜索词走 q（忽略标签筛选），无搜索词走标签筛选
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

  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolUrl.trim() || !newToolTitle.trim()) return;

    try {
      await toolsApi.create(newToolUrl, newToolTitle);
      setNewToolUrl('');
      setNewToolTitle('');
      setShowAddForm(false);
      fetchTools();
      fetchTags();
    } catch (err) {
      console.error('添加工具失败:', err);
      alert('添加失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个工具吗？')) return;
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
          onClick={() => setShowAddForm(!showAddForm)}
          className="button button-primary"
        >
          {showAddForm ? '取消' : '+ 添加工具'}
        </button>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <form onSubmit={handleAddTool} className="card space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">工具 URL</label>
              <input
                type="url"
                value={newToolUrl}
                onChange={(e) => setNewToolUrl(e.target.value)}
                placeholder="https://example.com"
                className="input mt-1"
                required
              />
            </div>
            <div>
              <label className="label">工具名称</label>
              <input
                type="text"
                value={newToolTitle}
                onChange={(e) => setNewToolTitle(e.target.value)}
                placeholder="给这个工具起个名字"
                className="input mt-1"
                required
              />
            </div>
          </div>
          <button type="submit" className="button button-primary w-full">
            收藏到工具箱
          </button>
        </form>
      )}

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

      {/* 工具列表 */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="mb-3 h-4 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/2 bg-muted rounded" />
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
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tools.map((tool) => (
            <div key={tool.id} className="card group flex flex-col">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="font-semibold line-clamp-2 flex-1" title={tool.title}>
                  {tool.title}
                </h3>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDelete(tool.id)}
                    className="rounded p-1 hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 标签 */}
              <div className="mb-3 flex flex-wrap gap-1">
                {(tool.ai_tags || []).slice(0, 3).map((tag, i) => (
                  <span key={i} className="badge badge-secondary text-xs">
                    {tag}
                  </span>
                ))}
              </div>

              {/* 底部：访问统计 + 链接 */}
              <div className="mt-auto flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {tool.visit_count} 次
                  </span>
                  {tool.last_visited_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(tool.last_visited_at).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
                <a
                  href={tool.url}
                  target="_blank"
                  onClick={() => handleVisit(tool.id)}
                  className="rounded p-1 hover:bg-muted transition-colors"
                  title="打开并记录访问"
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}