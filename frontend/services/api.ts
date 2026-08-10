/**
 * FlowShelf API 层
 *
 * - apiRequest: 统一请求封装（拦截器 + 错误转换 + 类型化）
 * - ApiError: 映射后端 ErrorCode 的结构化错误
 * - 各 Resource API: 类型化的请求/响应
 */

import type {
  Card,
  CardCreateRequest,
  CardGenerationResponse,
  CardUpdateRequest,
  Tool,
  ToolCreateRequest,
  ToolGenerationResponse,
  ToolUpdateRequest,
  TagCount,
  SearchResponse,
  ClassifyRequest,
  ClassifyResponse,
  LearningItem,
  LearningItemCreateRequest,
  LearningItemConvertRequest,
  LearningItemUpdateRequest,
  HealthResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse,
  MessageResponse,
  TabInfo,
  TabGroupRequest,
  TabGroupResponse,
  TabAssignRequest,
  TabAssignResponse,
  ErrorCode,
} from '@/types';

// ============ 基础配置 ============

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || (
  typeof window !== 'undefined' && window.location.port === '3000'
    ? 'http://localhost:8972/api'
    : '/api'
);

// ============ 结构化错误 ============

/** 映射后端 AppException 的前端错误类 */
export class ApiError extends Error {
  readonly errorCode: ErrorCode;
  readonly statusCode: number;

  constructor(errorCode: ErrorCode, detail: string, statusCode: number) {
    super(detail);
    this.name = 'ApiError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
  }
}

// ErrorCode → 中文提示映射
const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  NOT_FOUND: '资源不存在',
  VALIDATION_ERROR: '数据校验失败',
  BAD_REQUEST: '请求无效',
  AI_TIMEOUT: 'AI 响应超时，请稍后重试',
  AI_RATE_LIMIT: 'AI 调用频率超限，请稍后重试',
  AI_CALL_FAILED: 'AI 调用失败，请稍后重试',
  AI_OUTPUT_INVALID: 'AI 输出格式异常',
  CONTENT_EXTRACTION_FAILED: '页面内容提取失败',
  CARD_GENERATION_FAILED: '卡片生成失败',
  TOOL_GENERATION_FAILED: '工具信息生成失败',
  LEARNING_SAVE_FAILED: '保存失败',
  LEARNING_CONVERT_FAILED: '转换失败',
  LEARNING_ENRICH_FAILED: 'AI 补全失败',
  INTERNAL_ERROR: '内部错误',
};

// ============ 请求拦截器 ============

type RequestInterceptor = (url: string, options: RequestInit) => { url: string; options: RequestInit };
type ResponseInterceptor = (response: Response) => void;

const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];

/** 注册请求拦截器（可选，供扩展/鉴权等场景使用） */
export function onRequest(fn: RequestInterceptor) {
  requestInterceptors.push(fn);
}

/** 注册响应拦截器（可选，供日志/埋点等场景使用） */
export function onResponse(fn: ResponseInterceptor) {
  responseInterceptors.push(fn);
}

// ============ 核心请求函数 ============

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  let url = `${API_BASE_URL}${endpoint}`;
  let opts: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  // 请求拦截器
  for (const interceptor of requestInterceptors) {
    ({ url, options: opts } = interceptor(url, opts));
  }

  const response = await fetch(url, opts);

  // 响应拦截器
  for (const interceptor of responseInterceptors) {
    interceptor(response);
  }

  // 错误转换：映射后端 ErrorCode → ApiError
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error_code?: ErrorCode; detail?: string };
    const errorCode = errorData.error_code || 'INTERNAL_ERROR';
    const detail = errorData.detail || ERROR_MESSAGES[errorCode] || `请求失败: ${response.status}`;
    throw new ApiError(errorCode, detail, response.status);
  }

  return response.json() as Promise<T>;
}

// ============ 卡片 API ============

export const cardsApi = {
  create: (url: string, preview?: {
    title: string;
    summary: string;
    key_points: string[];
    tags: string[];
  }, content?: string) => {
    const body: CardCreateRequest = { source_url: url };
    if (content) body.content = content;
    if (preview) {
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
    const qs = new URLSearchParams();
    if (params?.skip) qs.set('skip', String(params.skip));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.days) qs.set('days', String(params.days));
    return apiRequest<Card[]>(`/cards?${qs.toString()}`);
  },

  tags: () => apiRequest<TagCount[]>('/cards/tags'),

  get: (id: number) => apiRequest<Card>(`/cards/${id}`),

  update: (id: number, data: CardUpdateRequest) =>
    apiRequest<Card>(`/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiRequest<MessageResponse>(`/cards/${id}`, { method: 'DELETE' }),

  generate: (url: string, content?: string) =>
    apiRequest<CardGenerationResponse>('/cards/generate', {
      method: 'POST',
      body: JSON.stringify({ url, content } as { url: string; content?: string }),
    }),
};

// ============ 工具箱 API ============

export const toolsApi = {
  create: (url: string, title: string, description?: string, aiTags?: string[], content?: string) =>
    apiRequest<Tool>('/tools', {
      method: 'POST',
      body: JSON.stringify({ url, title, description, ai_tags: aiTags, content } as ToolCreateRequest),
    }),

  list: (params?: { skip?: number; limit?: number; tag?: string; sort_by?: string }) => {
    const qs = new URLSearchParams();
    if (params?.skip) qs.set('skip', String(params.skip));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.sort_by) qs.set('sort_by', params.sort_by);
    return apiRequest<Tool[]>(`/tools?${qs.toString()}`);
  },

  tags: () => apiRequest<TagCount[]>('/tools/tags'),

  get: (id: number) => apiRequest<Tool>(`/tools/${id}`),

  update: (id: number, data: ToolUpdateRequest) =>
    apiRequest<Tool>(`/tools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiRequest<MessageResponse>(`/tools/${id}`, { method: 'DELETE' }),

  visit: (id: number) =>
    apiRequest<Tool>(`/tools/${id}/visit`, { method: 'POST' }),

  generate: (url: string, content?: string) =>
    apiRequest<ToolGenerationResponse>('/tools/generate', {
      method: 'POST',
      body: JSON.stringify({ url, content } as { url: string; content?: string }),
    }),
};

// ============ 搜索 API ============

/**
 * 搜索结果统一上限。
 * 顶部全局搜索与单库搜索必须使用同一个 limit，保证排序一致性。
 */
export const SEARCH_DEFAULT_LIMIT = 50;

export const searchApi = {
  semantic: (query: string, type: string = 'all', limit: number = SEARCH_DEFAULT_LIMIT) => {
    const qs = new URLSearchParams();
    qs.set('q', query);
    qs.set('type', type);
    qs.set('limit', String(limit));
    return apiRequest<SearchResponse>(`/search?${qs.toString()}`);
  },
};

// ============ 智能分流 API ============

export const classifyApi = {
  classify: (request: ClassifyRequest) =>
    apiRequest<ClassifyResponse>('/classify', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};

// ============ 系统 API ============

export const healthApi = {
  check: () => apiRequest<HealthResponse>('/health'),
};

export const settingsApi = {
  updateApiKey: (data: SettingsUpdateRequest) =>
    apiRequest<SettingsUpdateResponse>('/settings/api-key', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ============ 待学习队列 API ============

export const learningApi = {
  create: (request: LearningItemCreateRequest) =>
    apiRequest<LearningItem>('/learning', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  list: (params?: { skip?: number; limit?: number; include_converted?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.skip) qs.set('skip', String(params.skip));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.include_converted) qs.set('include_converted', 'true');
    return apiRequest<LearningItem[]>(`/learning?${qs.toString()}`);
  },

  get: (id: number) => apiRequest<LearningItem>(`/learning/${id}`),

  update: (id: number, data: LearningItemUpdateRequest) =>
    apiRequest<LearningItem>(`/learning/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiRequest<MessageResponse>(`/learning/${id}`, { method: 'DELETE' }),

  enrich: (id: number, content?: string) =>
    apiRequest<LearningItem>(`/learning/${id}/enrich`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  convert: (id: number, overwrite: LearningItemConvertRequest = {}) =>
    apiRequest<LearningItem>(`/learning/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(overwrite),
    }),
};

// ============ Tab 管理 API ============

export const tabsApi = {
  group: (request: TabGroupRequest) =>
    apiRequest<TabGroupResponse>('/tabs/group', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  assign: (request: TabAssignRequest) =>
    apiRequest<TabAssignResponse>('/tabs/assign', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};

// ============ 兼容：旧调用签名 ============

/**
 * learningApi.create 旧签名兼容包装。
 * 新代码请直接传 LearningItemCreateRequest 对象。
 */
export const learningApiCompat = {
  create: (url: string, title: string, itemType: 'unspecified' | 'article' | 'tool' = 'unspecified', content?: string) =>
    learningApi.create({ source_url: url, title, item_type: itemType, content }),
};
