/**
 * FlowShelf 扩展端类型定义
 * 与后端 schemas.py 保持一致
 */

/** 页面类型：AI 智能分流结果 */
export type PageType = "article" | "tool" | "video";

/** 智能分流响应 */
export interface ClassifyResponse {
  type: PageType;
  tags: string[];
  title: string | null;
}

/** 卡片生成预览（AI 生成，不写库） */
export interface CardPreview {
  title: string;
  summary: string;
  key_points: string[];
  tags: string[];
}

/** 工具生成预览（AI 生成，不写库） */
export interface ToolPreview {
  title: string;
  description: string;
  tags: string[];
}

/** 卡片保存响应 */
export interface CardSaved {
  id: number;
  source_url: string;
  title: string;
  ai_summary: string;
  key_points: string[];
  ai_tags: string[];
  source_type: string;
  created_at: string;
}

/** 工具保存响应 */
export interface ToolSaved {
  id: number;
  url: string;
  title: string;
  description: string | null;
  ai_tags: string[];
  visit_count: number;
  created_at: string;
}

/** 健康检查响应 */
export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  demo_mode: boolean;
}

/** 当前标签页信息（从 chrome.tabs 获取） */
export interface TabInfo {
  url: string;
  title: string;
  favIconUrl?: string;
}

/** Tab 归组响应 */
export interface TabGroup {
  name: string;
  tab_indices: number[];
}

export interface TabGroupResponse {
  groups: TabGroup[];
  total: number;
  group_count: number;
}

/** 单标签分组：已有分组上下文 */
export interface GroupContext {
  name: string;
  count: number;
  sample_tabs: { url: string; title: string }[];
}

/** 单标签分组响应 */
export interface TabAssignResponse {
  action: "assign" | "create";
  group_name: string;
}

/** 待学习项（快速收藏后进入的轻量记录） */
export interface LearningItem {
  id: number;
  source_url: string;
  title: string;
  item_type: string;
  ai_summary: string | null;
  key_points: string[];
  ai_tags: string[];
  tool_description: string | null;
  is_ready: boolean;
  is_converted: boolean;
  converted_id: number | null;
  created_at: string;
  updated_at: string;
}
