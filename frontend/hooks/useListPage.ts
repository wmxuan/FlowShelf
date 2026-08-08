'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SearchResult } from '@/types';
import { searchApi } from '@/services/api';

export interface FetchListOptions {
  tag?: string;
  query?: string;
}

export interface UseListPageParams<T, ListOptions extends FetchListOptions = FetchListOptions> {
  /** 根据条件拉取列表数据（非搜索态） */
  fetchList: (opts: ListOptions) => Promise<T[]>;
  /** 拉取标签列表（可省略，为空则不做 fetchTags） */
  fetchTags?: () => Promise<Array<{ name: string; count: number }>>;
  /** 搜索态时的 SearchResult → T 适配函数（必传，有搜索功能） */
  adaptSearchResult: (r: SearchResult) => T;
  /** 删除 API，传 id（可选，若不提供则需要手动在外部处理） */
  deleteItem?: (id: number) => Promise<void | boolean>;
  /** 搜索命中资源类型（cards/tools），默认 'cards' */
  searchType?: 'cards' | 'tools';
  /** 额外依赖，变化时会重新触发非搜索态 fetch（如 sortBy） */
  extraDeps?: unknown[];
}

export interface UseListPageResult<T> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  isLoading: boolean;
  // 搜索
  searchInput: string;
  setSearchInput: (v: string) => void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isSearching: boolean;
  handleSearchSubmit: (e: React.FormEvent) => void;
  clearSearch: () => void;
  // 标签
  allTags: Array<{ name: string; count: number }>;
  activeTag: string | null;
  setActiveTag: (t: string | null) => void;
  // 删除
  handleDelete: (id: number) => Promise<void>;
  // 拉取
  refresh: () => Promise<void>;
  refreshTags: () => Promise<void>;
  // 内部：当前是否搜索态（用于子组件条件渲染）
  isSearchingRef: boolean;
  searchQueryRef: string;
  activeTagRef: string | null;
}

/**
 * 通用「列表页」状态管理。
 *
 * 封装 cards/page.tsx 和 toolbox/page.tsx 中共用的：
 *   - searchInput / searchQuery / isSearching / handleSearchSubmit / clearSearch
 *   - allTags / activeTag / setActiveTag + fetchTags
 *   - items / isLoading + 搜索态走 searchApi / 非搜索态走 fetchList
 *   - handleDelete（删除 + refreshItems + refreshTags）
 *   - refresh / refreshTags
 *
 * 原 cards 与 toolbox 页面逻辑差异（正确保留）：
 *   - cards: fetchList({tag, query, limit})，sort 无
 *   - toolbox: fetchList({tag, query, limit, sortBy})，有额外 sortBy 通过 extraDeps 触发
 *   - adaptSearchResult：各自不同，各自传
 *   - deleteItem：API 不同，各自传
 */
export function useListPage<T, ListOptions extends FetchListOptions = FetchListOptions>(
  params: UseListPageParams<T, ListOptions>
): UseListPageResult<T> {
  const {
    fetchList,
    fetchTags,
    adaptSearchResult,
    deleteItem,
    searchType = 'cards',
    extraDeps = [],
  } = params;

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<Array<{ name: string; count: number }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const isSearching = searchQuery.trim().length > 0;

  const doRefresh = useCallback(
    async (opts: ListOptions) => {
      setIsLoading(true);
      try {
        const query = opts.query?.trim();
        if (query) {
          const resp = await searchApi.semantic(query, searchType, 50);
          setItems(resp.results.map(adaptSearchResult));
        } else {
          const data = await fetchList(opts);
          setItems(data);
        }
      } catch (err) {
        console.error('[useListPage] fetch failed:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchList, adaptSearchResult, searchType]
  );

  const refreshTags = useCallback(async () => {
    if (!fetchTags) return;
    try {
      const data = await fetchTags();
      setAllTags(data);
    } catch (err) {
      console.error('[useListPage] fetchTags failed:', err);
    }
  }, [fetchTags]);

  // 初始拉取标签
  useEffect(() => {
    refreshTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主刷新：搜索/标签/额外依赖变化时
  useEffect(() => {
    const opts: FetchListOptions = {};
    if (isSearching) {
      opts.query = searchQuery.trim();
    } else {
      if (activeTag) opts.tag = activeTag;
    }
    void doRefresh(opts as ListOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTag, searchQuery, ...extraDeps]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const handleDelete = async (id: number) => {
    if (!deleteItem) {
      console.warn('[useListPage] deleteItem not provided');
      return;
    }
    try {
      await deleteItem(id);
      // 删除后按当前上下文刷新
      const opts: FetchListOptions = {};
      if (isSearching) {
        opts.query = searchQuery.trim();
      } else {
        if (activeTag) opts.tag = activeTag;
      }
      await doRefresh(opts as ListOptions);
      await refreshTags();
    } catch (err) {
      console.error('[useListPage] delete failed:', err);
      throw err;
    }
  };

  return {
    items,
    setItems,
    isLoading,
    searchInput,
    setSearchInput,
    searchQuery,
    setSearchQuery,
    isSearching,
    handleSearchSubmit,
    clearSearch,
    allTags,
    activeTag,
    setActiveTag,
    handleDelete,
    refresh: () => {
      const opts: FetchListOptions = {};
      if (isSearching) {
        opts.query = searchQuery.trim();
      } else {
        if (activeTag) opts.tag = activeTag;
      }
      return doRefresh(opts as ListOptions);
    },
    refreshTags,
    // 暴露给外部组件，避免 stale closure
    isSearchingRef: isSearching,
    searchQueryRef: searchQuery,
    activeTagRef: activeTag,
  };
}
