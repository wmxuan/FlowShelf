/**
 * FlowShelf 扩展端 API 客户端
 *
 * 与 Web 前端共用同一套后端接口（/api/cards, /api/tools, /api/classify）。
 *
 * 地址体系：
 *   API_BASE → 后端 API 地址（8972 端口，自托管模式）
 *   WEB_BASE → 前端 Web 应用地址（开发模式可能是 3000/3001，自托管模式与 API 同端口）
 *
 * 自动探测策略：
 *   1. 用户显式设置过 → 直接使用，不探测
 *   2. 未设置 → 探测常见端口，找到可用的前端地址
 *      - 开发模式：3000, 3001, 3002（Next.js dev 常用端口）
 *      - 自托管模式：8972-8979（与后端同端口）
 */

import type {
  CardPreview,
  CardSaved,
  ClassifyResponse,
  GroupContext,
  HealthResponse,
  LearningItem,
  TabAssignResponse,
  TabGroupResponse,
  ToolPreview,
  ToolSaved,
} from "./types";

/** 默认后端地址（FlowShelf 自托管模式默认端口 8972） */
export const DEFAULT_API_BASE = "http://localhost:8972";

/** storage key：后端 API 地址 */
export const API_BASE_KEY = "flowshelf_api_base";

/** 默认 Web 应用地址（与后端同一端口，自托管模式） */
export const DEFAULT_WEB_BASE = "http://localhost:8972";

/** storage key：Web 应用地址 */
export const WEB_BASE_KEY = "flowshelf_web_base";

/** storage key：标记用户是否显式设置过 WEB_BASE（用于区分"未设置"和"显式设置为默认值"） */
export const WEB_BASE_SET_KEY = "flowshelf_web_base_set";

/**
 * 自动探测前端 Web 应用地址
 *
 * 探测顺序：开发端口（3000-3002）→ 自托管端口（8972-8979）
 * 前端判定条件：能访问且不是纯 API 端口（即该端口能返回 HTML 页面）
 * 实际实现：先探测 3000-3002 是否有 Next.js dev server，再探测 8972-8979 的 /api/health
 */
export async function detectWebBase(): Promise<string> {
  // 开发端口：Next.js dev server，尝试访问根路径（返回 HTML 即为前端）
  const devPorts = [3000, 3001, 3002];
  for (const port of devPorts) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        method: "GET",
        signal: AbortSignal.timeout(1000),
      });
      // Next.js dev server 返回 HTML
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("text/html")) {
        console.log(`[FlowShelf] Web 前端探测命中: localhost:${port}`);
        return `http://localhost:${port}`;
      }
    } catch { /* not running */ }
  }

  // 自托管端口：前端与后端同端口，通过 /api/health 判定
  for (let port = 8972; port <= 8979; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        console.log(`[FlowShelf] 自托管模式探测命中: localhost:${port}`);
        return `http://localhost:${port}`;
      }
    } catch { /* not running */ }
  }

  return DEFAULT_WEB_BASE;
}

/**
 * 获取当前配置的 API 基址
 */
export async function getApiBase(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([API_BASE_KEY], (result) => {
      const base = result[API_BASE_KEY] as string | undefined;
      resolve(base || DEFAULT_API_BASE);
    });
  });
}

/**
 * 设置 API 基址
 */
export async function setApiBase(url: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [API_BASE_KEY]: url }, () => resolve());
  });
}

/**
 * 获取当前配置的 Web 应用基址（cards / toolbox 页面所在站点）
 *
 * 优先级：用户显式设置 > 自动探测 > 默认值
 */
export async function getWebBase(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([WEB_BASE_KEY, WEB_BASE_SET_KEY], async (result) => {
      const userSet = result[WEB_BASE_SET_KEY] as boolean | undefined;
      // 用户显式设置过 → 直接使用，不探测
      if (userSet) {
        const base = (result[WEB_BASE_KEY] as string) || DEFAULT_WEB_BASE;
        resolve(base);
        return;
      }
      // 未设置 → 自动探测
      const detected = await detectWebBase();
      // 缓存探测结果（但不标记为用户设置，下次仍可探测）
      await chrome.storage.local.set({ [WEB_BASE_KEY]: detected });
      resolve(detected);
    });
  });
}

/**
 * 设置 Web 应用基址（用户显式设置，标记为不可覆盖）
 */
export async function setWebBase(url: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [WEB_BASE_KEY]: url, [WEB_BASE_SET_KEY]: true }, () => resolve());
  });
}

/**
 * 统一请求封装
 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = await getApiBase();
  const url = `${base}/api${path}`;
  console.log("[FlowShelf] API request:", options.method || "GET", url);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (fetchErr) {
    console.error("[FlowShelf] fetch failed:", url, fetchErr);
    throw new Error(`Failed to fetch`);
  }

  if (!response.ok) {
    let detail = `请求失败: ${response.status}`;
    try {
      const errorData = await response.json();
      detail = errorData.detail || detail;
    } catch {
      // JSON 解析失败，用默认错误信息
    }
    console.error("[FlowShelf] API error:", response.status, detail);
    throw new Error(detail);
  }

  const data = await response.json();
  console.log("[FlowShelf] API response:", path, data);
  return data;
}

// ============ 智能分流 ============

export const classifyApi = {
  /** AI 分类页面类型（article/tool/video） */
  classify: (url: string, title?: string, content?: string) =>
    request<ClassifyResponse>("/classify", {
      method: "POST",
      body: JSON.stringify({ url, title, content }),
    }),
};

// ============ 卡片 ============

export const cardsApi = {
  /** 生成卡片预览（AI 分析，不写库） */
  generate: (url: string, content?: string) =>
    request<CardPreview>("/cards/generate", {
      method: "POST",
      body: JSON.stringify({ url, content }),
    }),

  /** 保存卡片（携带预览数据，跳过重复 AI 生成） */
  create: (
    url: string,
    preview: {
      title: string;
      summary: string;
      key_points: string[];
      tags: string[];
    },
    content?: string
  ) =>
    request<CardSaved>("/cards", {
      method: "POST",
      body: JSON.stringify({
        source_url: url,
        title: preview.title,
        ai_summary: preview.summary,
        key_points: preview.key_points,
        ai_tags: preview.tags,
        content,
      }),
    }),
};

// ============ 工具箱 ============

export const toolsApi = {
  /** 生成工具预览（AI 分析，不写库） */
  generate: (url: string, content?: string) =>
    request<ToolPreview>("/tools/generate", {
      method: "POST",
      body: JSON.stringify({ url, content }),
    }),

  /** 保存工具（携带预览数据，跳过重复 AI 分类） */
  create: (
    url: string,
    title: string,
    description?: string,
    aiTags?: string[],
    content?: string
  ) =>
    request<ToolSaved>("/tools", {
      method: "POST",
      body: JSON.stringify({
        url,
        title,
        description,
        ai_tags: aiTags,
        content,
      }),
    }),
};

// ============ 健康检查 ============

export const healthApi = {
  check: () => request<HealthResponse>("/health"),
};

// ============ Tab 管理 ============

export const tabsApi = {
  /** AI Tab 归组：将多个标签页按主题相似度聚类分组 */
  group: (tabs: { url: string; title: string; favIconUrl?: string }[]) =>
    request<TabGroupResponse>("/tabs/group", {
      method: "POST",
      body: JSON.stringify({ tabs }),
    }),
  /** AI 单标签分组：将一个新标签分配到已有分组或创建新分组（省 token） */
  assign: (
    tab: { url: string; title: string },
    existingGroups: GroupContext[]
  ) =>
    request<TabAssignResponse>("/tabs/assign", {
      method: "POST",
      body: JSON.stringify({ tab, existing_groups: existingGroups }),
    }),
};

// ============ 待学习队列（快速收藏） ============

export const learningApi = {
  /** 快速保存到待学习队列（AI 后台异步补全）。
   *
   * item_type:
   *   - "article" / "tool"：AI 会按该类型在后台立即生成对应内容
   *   - "unspecified"：跳过后台 AI 生成，等用户在暂存区选择归档类型后，
   *     转正时同步生成对应类型内容（适用于扩展 popup 不显示类型 UI 的一键入口）
   */
  create: (
    source_url: string,
    title: string,
    item_type: "article" | "tool" | "unspecified" = "article",
    content?: string
  ) =>
    request<LearningItem>("/learning", {
      method: "POST",
      body: JSON.stringify({ source_url, title, item_type, content }),
    }),

  /** 检查后端健康状态（含 ai_mode 字段） */
  checkHealth: async (): Promise<{ ai_mode: string }> => {
    const base = await getApiBase();
    const res = await fetch(`${base}/api/health`);
    if (!res.ok) throw new Error("Health check failed");
    return res.json();
  },
};
