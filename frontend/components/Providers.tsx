'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { ApiError } from '@/services/api';

const STALE_TIME = 2 * 60 * 1000; // 2min：跨标签实时性要求高，缩短过期时间
const GC_TIME = 10 * 60 * 1000;    // 10min：离开视口后回收缓存

/**
 * React Query 全局 Provider
 *
 * - staleTime 2min：列表数据 2 分钟内不重新请求（兼顾实时性与请求量）
 * - gcTime 10min：离开视口 10 分钟后回收缓存
 * - retry 策略：4xx 不重试，5xx 最多 2 次
 * - 跨标签同步：BroadcastChannel 广播 mutation 失效，其他标签即时 refetch
 * - refetchOnWindowFocus: 切回标签页时主动刷新（保证跨标签操作后数据一致）
 */
export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIME,
            gcTime: GC_TIME,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.statusCode < 500) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            networkMode: 'online',
          },
          mutations: {
            retry: false,
            networkMode: 'online',
          },
        },
      })
  );

  // 跨标签实时同步：通过 BroadcastChannel 广播 query 失效事件
  // 当标签 A 执行 mutation invalidate 某 query key 时，
  // 标签 B/C 收到广播后立即 refetch 对应数据，无延迟
  useEffect(() => {
    const channel = new BroadcastChannel('flowshelf:query-sync');

    channel.onmessage = (event) => {
      const { type, queryKey } = event.data as {
        type: 'invalidate' | 'reset';
        queryKey: unknown[];
      };
      if (type === 'invalidate') {
        queryClient.invalidateQueries({ queryKey });
      } else if (type === 'reset') {
        queryClient.resetQueries({ queryKey });
      }
    };

    // 拦截 invalidateQueries，同步广播到其他标签
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = function (filters, options) {
      const result = originalInvalidate(filters, options);
      if (filters && 'queryKey' in filters && filters.queryKey) {
        channel.postMessage({ type: 'invalidate', queryKey: filters.queryKey });
      }
      return result;
    };

    return () => {
      channel.close();
      // 恢复原始方法
      queryClient.invalidateQueries = originalInvalidate;
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
