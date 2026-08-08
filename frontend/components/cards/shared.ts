/**
 * 卡片统一组件的共享类型、适配函数与工具方法。
 *
 * 暂存区（LearningItem）与知识库（Card）/工具箱（Tool）的字段名不同，
 * 这里通过中间类型 KnowledgeCardData / ToolCardData 抹平差异，
 * 让 KnowledgeCard / ToolCard 组件不感知数据来源。
 */

import type { Card, Tool, LearningItem } from '@/types';

// ============ 知识卡片统一数据类型 ============

export type KnowledgeCardData = {
  id: number;
  /** 数据来源：learning=暂存区 article tab，cards=知识库 */
  source: 'learning' | 'cards';
  title: string;
  source_url: string;
  ai_summary: string | null;
  key_points: string[];
  ai_tags: string[];
  created_at: string;
  /** 仅 learning：AI 是否生成完毕 */
  is_ready?: boolean;
  /** 仅 learning：是否已转为正式卡片/工具 */
  is_converted?: boolean;
  converted_id?: number | null;
  /** 原始对象引用（详情弹窗可能需要更多字段） */
  raw: LearningItem | Card;
};

export function adaptLearningArticle(item: LearningItem): KnowledgeCardData {
  return {
    id: item.id,
    source: 'learning',
    title: item.title,
    source_url: item.source_url,
    ai_summary: item.ai_summary,
    key_points: Array.isArray(item.key_points) ? item.key_points : [],
    ai_tags: Array.isArray(item.ai_tags) ? item.ai_tags : [],
    created_at: item.created_at,
    is_ready: item.is_ready,
    is_converted: item.is_converted,
    converted_id: item.converted_id,
    raw: item,
  };
}

export function adaptCard(card: Card): KnowledgeCardData {
  return {
    id: card.id,
    source: 'cards',
    title: card.title,
    source_url: card.source_url,
    ai_summary: card.ai_summary,
    key_points: card.key_points || [],
    ai_tags: card.ai_tags || [],
    created_at: card.created_at,
    raw: card,
  };
}

// ============ 工具卡片统一数据类型 ============

export type ToolCardData = {
  id: number;
  /** 数据来源：learning=暂存区 tool tab，toolbox=工具箱 */
  source: 'learning' | 'toolbox';
  title: string;
  url: string;
  ai_tags: string[];
  description: string | null;
  created_at: string;
  /** 仅 learning */
  is_ready?: boolean;
  is_converted?: boolean;
  converted_id?: number | null;
  /** 仅 toolbox */
  visit_count?: number;
  last_visited_at?: string | null;
  /** 原始对象引用 */
  raw: LearningItem | Tool;
};

export function adaptLearningTool(item: LearningItem): ToolCardData {
  return {
    id: item.id,
    source: 'learning',
    title: item.title,
    url: item.source_url,
    ai_tags: Array.isArray(item.ai_tags) ? item.ai_tags : [],
    description: item.tool_description,
    created_at: item.created_at,
    is_ready: item.is_ready,
    is_converted: item.is_converted,
    converted_id: item.converted_id,
    raw: item,
  };
}

export function adaptTool(tool: Tool): ToolCardData {
  return {
    id: tool.id,
    source: 'toolbox',
    title: tool.title,
    url: tool.url,
    ai_tags: tool.ai_tags || [],
    description: tool.description,
    created_at: tool.created_at,
    visit_count: tool.visit_count,
    last_visited_at: tool.last_visited_at,
    raw: tool,
  };
}

// ============ favicon helper ============

/** 从 URL 提取域名，返回 { domain, faviconUrl } */
export function extractDomain(url: string): { domain: string; faviconUrl: string } {
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = '';
  }
  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    : '';
  return { domain, faviconUrl };
}
