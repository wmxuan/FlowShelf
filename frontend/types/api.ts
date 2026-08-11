/**
 * FlowShelf 全量 API 类型定义
 *
 * 与后端 app/db/schemas/schemas.py + app/core/exceptions.py 一一对应。
 * 命名规则：{Resource}{Action}Request / {Resource}{Action}Response
 */

// ============ 通用 ============

/** ISO 8601 日期时间字符串 */
export type DateTime = string;

/** 通用消息响应 */
export interface MessageResponse {
  message: string;
  data?: Record<string, unknown>;
}

/** 统一错误响应（与后端 AppException 对齐） */
export interface ErrorResponse {
  error_code: ErrorCode;
  detail: string;
}

/** 后端 ErrorCode 枚举 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  // AI 调用
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMIT'
  | 'AI_CALL_FAILED'
  | 'AI_OUTPUT_INVALID'
  // 内容处理
  | 'CONTENT_EXTRACTION_FAILED'
  // 业务流程
  | 'CARD_GENERATION_FAILED'
  | 'TOOL_GENERATION_FAILED'
  | 'LEARNING_SAVE_FAILED'
  | 'LEARNING_CONVERT_FAILED'
  | 'LEARNING_ENRICH_FAILED'
  // 内部错误
  | 'INTERNAL_ERROR';

// ============ 卡片 ============

export interface Card {
  id: number;
  source_url: string;
  title: string;
  ai_summary: string;
  key_points: string[];
  ai_tags: string[];
  source_type: string;
  embedding?: number[];
  read_at: DateTime | null;
  created_at: DateTime;
  updated_at: DateTime;
}

export interface CardCreateRequest {
  source_url: string;
  title?: string;
  ai_summary?: string;
  key_points?: string[];
  ai_tags?: string[];
  content?: string;
}

export interface CardUpdateRequest {
  title?: string;
  ai_summary?: string;
  key_points?: string[];
  ai_tags?: string[];
  read_at?: DateTime | null;
}

export interface CardGenerationRequest {
  url: string;
  content?: string;
}

export interface CardGenerationResponse {
  title: string;
  summary: string;
  key_points: string[];
  tags: string[];
}

// ============ 工具箱 ============

export interface Tool {
  id: number;
  url: string;
  title: string;
  ai_tags: string[];
  description: string | null;
  visit_count: number;
  last_visited_at: DateTime | null;
  created_at: DateTime;
  updated_at: DateTime;
}

export interface ToolCreateRequest {
  url: string;
  title: string;
  description?: string;
  ai_tags?: string[];
  content?: string;
}

export interface ToolUpdateRequest {
  title?: string;
  ai_tags?: string[];
  description?: string;
}

export interface ToolGenerationRequest {
  url: string;
  content?: string;
}

export interface ToolGenerationResponse {
  title: string;
  description: string;
  tags: string[];
}

// ============ 标签 ============

export interface TagCount {
  name: string;
  count: number;
}

// ============ 搜索 ============

export interface SearchResult {
  id: number;
  title: string;
  url: string;
  type: 'card' | 'tool';
  summary: string | null;
  tags: string[];
  score: number;
  key_points?: string[];
  created_at?: DateTime;
  visit_count?: number;
  last_visited_at?: DateTime | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  semantic_used?: boolean;
}

// ============ 智能分流 ============

export interface ClassifyRequest {
  url: string;
  title?: string;
  content?: string;
}

export interface ClassifyResponse {
  type: 'article' | 'tool' | 'video';
  tags: string[];
  title: string | null;
}

// ============ 待学习队列 ============

export interface LearningItem {
  id: number;
  source_url: string;
  title: string;
  item_type: 'unspecified' | 'article' | 'tool';
  ai_summary: string | null;
  key_points: string[];
  ai_tags: string[];
  tool_description: string | null;
  is_ready: boolean;
  is_converted: boolean;
  converted_id: number | null;
  created_at: DateTime;
  updated_at: DateTime;
}

export interface LearningItemCreateRequest {
  source_url: string;
  title: string;
  item_type: 'unspecified' | 'article' | 'tool';
  content?: string;
}

export interface LearningItemUpdateRequest {
  title?: string;
  ai_summary?: string;
  key_points?: string[];
  ai_tags?: string[];
  tool_description?: string | null;
}

export interface LearningItemConvertRequest {
  title?: string;
  ai_summary?: string;
  key_points?: string[];
  ai_tags?: string[];
  tool_description?: string;
  item_type?: 'article' | 'tool';
}

// ============ Tab 管理 ============

export interface TabInfo {
  url: string;
  title: string;
  favIconUrl?: string | null;
}

export interface TabGroupRequest {
  tabs: TabInfo[];
}

export interface TabGroup {
  name: string;
  tab_indices: number[];
}

export interface TabGroupResponse {
  groups: TabGroup[];
  total: number;
  group_count: number;
}

export interface GroupContext {
  name: string;
  count: number;
  sample_tabs: TabInfo[];
}

export interface TabAssignRequest {
  tab: TabInfo;
  existing_groups: GroupContext[];
}

export interface TabAssignResponse {
  action: 'assign' | 'create';
  group_name: string;
}

// ============ 系统 ============

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  demo_mode: boolean;
  has_api_key: boolean;
  ai_mode: 'real' | 'demo';
  has_embedding: boolean;
}

export interface SettingsUpdateRequest {
  api_key?: string;
  base_url?: string;
  model?: string;
}

export interface SettingsUpdateResponse {
  ok: boolean;
  has_api_key: boolean;
  ai_mode: string;
}
