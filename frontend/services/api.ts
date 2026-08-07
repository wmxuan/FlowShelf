import type { Card, Tool, SearchResponse, TagCount } from '@/types';

// API 基础配置
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `请求失败: ${response.status}`);
  }
  
  return response.json();
}

// 卡片 API
export const cardsApi = {
  create: (url: string) =>
    apiRequest<Card>('/cards', {
      method: 'POST',
      body: JSON.stringify({ source_url: url }),
    }),
  
  list: (params?: { skip?: number; limit?: number; tag?: string; days?: number; q?: string }) => {
    const queryString = new URLSearchParams();
    if (params?.skip) queryString.set('skip', String(params.skip));
    if (params?.limit) queryString.set('limit', String(params.limit));
    if (params?.tag) queryString.set('tag', params.tag);
    if (params?.days) queryString.set('days', String(params.days));
    if (params?.q) queryString.set('q', params.q);
    return apiRequest<Card[]>(`/cards?${queryString.toString()}`);
  },

  tags: () => apiRequest<TagCount[]>('/cards/tags'),

  get: (id: number) => apiRequest<Card>(`/cards/${id}`),
  
  update: (id: number, data: object) =>
    apiRequest<Card>(`/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: number) =>
    apiRequest(`/cards/${id}`, {
      method: 'DELETE',
    }),
  
  generate: (url: string) =>
    apiRequest('/cards/generate', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
};

// 工具箱 API
export const toolsApi = {
  create: (url: string, title: string, description?: string) =>
    apiRequest<Tool>('/tools', {
      method: 'POST',
      body: JSON.stringify({ url, title, description }),
    }),
  
  list: (params?: { skip?: number; limit?: number; tag?: string; sort_by?: string; q?: string }) => {
    const queryString = new URLSearchParams();
    if (params?.skip) queryString.set('skip', String(params.skip));
    if (params?.limit) queryString.set('limit', String(params.limit));
    if (params?.tag) queryString.set('tag', params.tag);
    if (params?.sort_by) queryString.set('sort_by', params.sort_by);
    if (params?.q) queryString.set('q', params.q);
    return apiRequest<Tool[]>(`/tools?${queryString.toString()}`);
  },

  tags: () => apiRequest<TagCount[]>('/tools/tags'),

  get: (id: number) => apiRequest<Tool>(`/tools/${id}`),
  
  update: (id: number, data: object) =>
    apiRequest(`/tools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: number) =>
    apiRequest(`/tools/${id}`, {
      method: 'DELETE',
    }),
  
  visit: (id: number) =>
    apiRequest(`/tools/${id}/visit`, {
      method: 'POST',
    }),
};

// 搜索 API
export const searchApi = {
  semantic: (query: string, type: string = 'all', limit: number = 20) => {
    const queryString = new URLSearchParams();
    queryString.set('q', query);
    queryString.set('type', type);
    queryString.set('limit', String(limit));
    return apiRequest<SearchResponse>(`/search?${queryString.toString()}`);
  },
};

// 健康检查
export const healthApi = {
  check: () => apiRequest('/health'),
};