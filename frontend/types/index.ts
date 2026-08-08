// TypeScript 类型定义

export interface Card {
  id: number;
  source_url: string;
  title: string;
  ai_summary: string;
  key_points: string[];
  ai_tags: string[];
  source_type: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardGenerationResponse {
  title: string;
  summary: string;
  key_points: string[];
  tags: string[];
}

export interface TagCount {
  name: string;
  count: number;
}

export interface Tool {
  id: number;
  url: string;
  title: string;
  ai_tags: string[];
  description: string | null;
  visit_count: number;
  last_visited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: number;
  title: string;
  url: string;
  type: 'card' | 'tool';
  summary: string | null;
  tags: string[];
  score: number;
  // 卡片特有字段（type=card 时存在）
  key_points?: string[];
  created_at?: string;
  // 工具特有字段（type=tool 时存在）
  visit_count?: number;
  last_visited_at?: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

export interface MessageResponse {
  message: string;
  data?: Record<string, unknown>;
}

export interface ErrorResponse {
  detail: string;
  error_code?: string;
}

export interface LearningItem {
  id: number;
  source_url: string;
  title: string;
  item_type: 'unspecified' | 'article' | 'tool';
  content?: string | null;
  ai_summary: string | null;
  key_points: string[] | null;
  ai_tags: string[] | null;
  tool_description: string | null;
  is_ready: boolean;
  is_converted: boolean;
  converted_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface LearningConvertResult {
  id: number;
  is_converted: boolean;
  converted_id: number | null;
  converted_type: 'article' | 'tool';
  ai_summary?: string;
  tool_description?: string;
}