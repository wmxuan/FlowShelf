'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SearchResult } from '@/types';
import { searchApi, SEARCH_DEFAULT_LIMIT } from '@/services/api';

export interface FetchListOptions {
  tag?: string;
  query?: string;
}

export interface UseListPageParams<T, ListOptions extends FetchListOptions = FetchListOptions> {
  /** queryKey 前缀，用于 TanStack Query 缓存标识（如 'cards'、'tools'） */
  queryKeyPrefix: string;
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
  /** 是否启用语义检索（基础模式传 false，默认 true） */
  useSemantic?: boolean;
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
 * 通用「列表页」状态管理（TanStack Query 版）。
 *
 * 核心变化：
 *   - items/tags 通过 useQuery 获取，自动缓存+去重+跨标签同步
 *   - delete 通过 useMutation + invalidateQueries，自动触发刷新
 *   - useSemantic/extraDeps 变化时 queryKey 变化，自动 refetch（无需手动 effect）
 *   - 切换模式时 placeholderData 保留旧数据，无闪烁
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
    queryKeyPrefix,
    fetchList,
    fetchTags,
    adaptSearchResult,
    deleteItem,
    searchType = 'cards',
    useSemantic = true,
    extraDeps = [],
  } = params;

  const queryClient = useQueryClient();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const isSearching = searchQuery.trim().length > 0;

  // ============ 列表数据（useQuery） ============

  // 构建 queryKey：包含所有影响数据的参数
  const itemsQueryKey = useMemo(
    () => [queryKeyPrefix, 'list', { activeTag, searchQuery, useSemantic, extraDeps }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTag, searchQuery, useSemantic, ...extraDeps]
  );

  const itemsQuery = useQuery({
    queryKey: itemsQueryKey,
    queryFn: async (): Promise<T[]> => {
      if (isSearching) {
        const resp = await searchApi.semantic(searchQuery.trim(), searchType, SEARCH_DEFAULT_LIMIT, useSemantic);
        return resp.results.map(adaptSearchResult);
      }
      const opts = { tag: activeTag || undefined } as FetchListOptions;
      return fetchList(opts as ListOptions);
    },
    placeholderData: (prev) => prev, // 参数变化时保留旧数据，避免闪烁
  });

  const items = itemsQuery.data ?? [];
  const isLoading = itemsQuery.isLoading && !itemsQuery.isPlaceholderData;

  // ============ 标签数据（useQuery） ============

  const tagsQueryKey = [queryKeyPrefix, 'tags'];

  const tagsQuery = useQuery({
    queryKey: tagsQueryKey,
    queryFn: async () => {
      if (!fetchTags) return [];
      return fetchTags();
    },
    enabled: !!fetchTags,
  });

  const allTags = tagsQuery.data ?? [];

  // ============ 删除（useMutation） ============

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!deleteItem) throw new Error('deleteItem not provided');
      return deleteItem(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKeyPrefix] });
    },
  });

  // ============ 搜索操作 ============

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  // ============ 手动刷新 ============

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, 'list'] });
  }, [queryClient, queryKeyPrefix]);

  const refreshTags = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: tagsQueryKey });
  }, [queryClient, tagsQueryKey]);

  // 兼容旧接口：setItems 用于外部直接修改（如编辑后乐观更新）
  const setItems = useCallback(
    (action: React.SetStateAction<T[]>) => {
      const current = itemsQuery.data ?? [];
      const next = typeof action === 'function' ? action(current) : action;
      queryClient.setQueryData(itemsQueryKey, next);
    },
    [queryClient, itemsQueryKey, itemsQuery.data]
  );

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
    refresh,
    refreshTags,
    isSearchingRef: isSearching,
    searchQueryRef: searchQuery,
    activeTagRef: activeTag,
  };
}
