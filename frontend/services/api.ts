import type { Card, Tool, SearchResponse, TagCount, LearningItem, LearningConvertResult } from '@/types';

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
  create: (
    url: string,
    preview?: {
      title: string;
      summary: string;
      key_points: string[];
      tags: string[];
    },
    content?: string
  ) => {
    const body: Record<string, unknown> = { source_url: url };
    if (content) {
      // Bookmarklet / 扩展端预提取的正文，跳过服务端抓取，规避反爬 / SPA 场景
      body.content = content;
    }
    if (preview) {
      // 携带预览数据走「预览保存」路径，跳过 AI 生成，保留用户编辑后的内容
      body.title = preview.title;
      body.ai_summary = preview.summary;
      body.key_points = preview.key_points;
      body.ai_tags = preview.tags;
    }
    return apiRequest<Card>('/cards', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  
  list: (params?: { skip?: number; limit?: number; tag?: string; days?: number }) => {
    const queryString = new URLSearchParams();
    if (params?.skip) queryString.set('skip', String(params.skip));
    if (params?.limit) queryString.set('limit', String(params.limit));
    if (params?.tag) queryString.set('tag', params.tag);
    if (params?.days) queryString.set('days', String(params.days));
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
  create: (url: string, title: string, description?: string, aiTags?: string[]) =>
    apiRequest<Tool>('/tools', {
      method: 'POST',
      body: JSON.stringify({ url, title, description, ai_tags: aiTags }),
    }),
  
  list: (params?: { skip?: number; limit?: number; tag?: string; sort_by?: string }) => {
    const queryString = new URLSearchParams();
    if (params?.skip) queryString.set('skip', String(params.skip));
    if (params?.limit) queryString.set('limit', String(params.limit));
    if (params?.tag) queryString.set('tag', params.tag);
    if (params?.sort_by) queryString.set('sort_by', params.sort_by);
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

  generate: (url: string) =>
    apiRequest<{ title: string; description: string; tags: string[] }>(
      '/tools/generate',
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      }
    ),
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

// 待学习队列 API
export const learningApi = {
  create: (
    url: string,
    title: string,
    itemType: 'unspecified' | 'article' | 'tool' = 'unspecified',
    content?: string
  ) => {
    const body: Record<string, unknown> = { source_url: url, title, item_type: itemType };
    if (content) body.content = content;
    return apiRequest<LearningItem>('/learning', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  list: () => apiRequest<LearningItem[]>('/learning'),

  get: (id: number) => apiRequest<LearningItem>(`/learning/${id}`),

  delete: (id: number) =>
    apiRequest(`/learning/${id}`, { method: 'DELETE' }),

  enrich: (id: number) =>
    apiRequest<LearningItem>(`/learning/${id}/enrich`, { method: 'POST' }),

  convert: (id: number, overwrite: Partial<{
    item_type: 'article' | 'tool';
    ai_summary: string;
    key_points: string[];
    ai_tags: string[];
    tool_description: string;
  }> = {}) =>
    apiRequest<LearningConvertResult>(`/learning/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(overwrite),
    }),
};