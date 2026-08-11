'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@/services/api';

/**
 * AI 模式状态 hook
 *
 * 数据来源：/api/health（queryKey: ['ai-mode']）
 * 与 useVersionInfo 共享同一 API，但 queryKey 独立以确保
 * 各自的 staleTime/gcTime 策略互不干扰。
 */

/** aiMode query key（全局唯一，invalidate 即刷新所有消费者） */
export const AI_MODE_KEY = ['ai-mode'] as const;

async function fetchAiMode(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) return false;
  const data = await res.json();
  return data.ai_mode === 'real';
}

/** 全局订阅 AI 模式状态（TanStack Query 驱动，自动缓存+跨标签同步） */
export function useAiMode(): { aiMode: boolean; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: AI_MODE_KEY,
    queryFn: fetchAiMode,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
  return { aiMode: data ?? false, loading: isLoading };
}

/** 切换 AI 模式后调用，invalidate 即自动触发所有消费者 refetch + 跨标签广播 */
export function useAiModeInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    // 同时刷新 ai-mode 和 health，确保所有消费者一致
    queryClient.invalidateQueries({ queryKey: AI_MODE_KEY });
    queryClient.invalidateQueries({ queryKey: ['health'] });
  };
}
