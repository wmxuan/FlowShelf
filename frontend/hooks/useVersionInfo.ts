'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@/services/api';

/** /api/health 响应数据 */
export interface VersionInfo {
  version: string;
  demoMode: boolean;
  hasApiKey: boolean;
  aiMode: 'real' | 'demo';
  apiBase: string;
}

/** health query key（全局唯一，invalidate 即刷新所有消费者） */
export const HEALTH_KEY = ['health'] as const;

async function fetchHealth(): Promise<VersionInfo> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error('health check failed');
  const data = await res.json();
  return {
    version: data.version || '?',
    demoMode: !!data.demo_mode,
    hasApiKey: !!data.has_api_key,
    aiMode: data.ai_mode === 'real' ? 'real' : 'demo',
    apiBase: API_BASE || (typeof window !== 'undefined' ? window.location.origin : ''),
  };
}

/** 全局订阅版本/AI模式信息（TanStack Query 驱动，自动缓存+跨标签同步） */
export function useVersionInfo() {
  const { data, isLoading, error } = useQuery({
    queryKey: HEALTH_KEY,
    queryFn: fetchHealth,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
  return {
    versionInfo: data ?? null,
    loading: isLoading,
    error,
    /** 派生：是否为 AI 模式 */
    aiMode: data ? data.aiMode === 'real' : false,
  };
}

/** 切换 AI 模式后调用，invalidate 即自动触发所有消费者 refetch + 跨标签广播 */
export function useHealthInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: HEALTH_KEY });
}
