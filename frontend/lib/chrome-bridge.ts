/**
 * Chrome Bridge 客户端
 *
 * 与扩展的 Content Script Bridge 通信，获取/操作浏览器标签页。
 * 仅在扩展已安装且 Content Script 已注入时可用。
 */

const BRIDGE_SOURCE = "flowshelf-bridge";

export interface ChromeTabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  windowId?: number;
  groupId?: number;
  active?: boolean;
}

/** Chrome 原生标签群组信息 */
export interface ChromeTabGroupInfo {
  id: number;
  title: string;
  color: string;
  windowId: number;
}

/** 标签页事件类型 */
export type TabEventType = "created" | "updated" | "removed" | "grouped";

/** 标签页变更信息（onUpdated 时包含 changeInfo） */
export interface TabChangeInfo {
  url?: string;
  title?: string;
  favIconUrl?: string;
  groupId?: number;
}

/** 标签页事件数据 */
export interface TabEventData {
  event: TabEventType;
  tab: ChromeTabInfo & { changeInfo?: TabChangeInfo };
}

/** Chrome 原生标签群组事件类型 */
export type GroupEventType = "created" | "updated" | "removed";

/** Chrome 原生标签群组事件数据 */
export interface GroupEventData {
  event: GroupEventType;
  group: ChromeTabGroupInfo;
}

type TabEventListener = (data: TabEventData) => void;
type GroupEventListener = (data: GroupEventData) => void;

type BridgeCallback = (result: unknown, error?: string) => void;

let messageId = 0;
const pendingCallbacks = new Map<number, BridgeCallback>();

// 桥接就绪状态
let bridgeReady = false;
let bridgeReadyCheckers: (() => void)[] = [];

// 标签页事件监听器集合
const tabEventListeners = new Set<TabEventListener>();

// 群组事件监听器集合
const groupEventListeners = new Set<GroupEventListener>();

// 监听来自 Content Script 的回复
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== BRIDGE_SOURCE) return;

    // 忽略本脚本发出的请求回声：window.postMessage 会广播给同一 window 的所有
    // listener（含发送者自己）。请求带 action，响应只带 result/error/status/eventType。
    // 若不过滤，请求回声会命中 pendingCallbacks 并立即 resolve(undefined)。
    if (data.action !== undefined) return;

    if (data.status === "ready") {
      // 桥接已就绪
      bridgeReady = true;
      // 通知所有等待中的检查器
      bridgeReadyCheckers.forEach((checker) => checker());
      bridgeReadyCheckers = [];
      return;
    }

    // 标签页事件（由 Background SW → CS → 这里转发）
    if (data.eventType === "tabEvent") {
      const eventData: TabEventData = {
        event: data.event,
        tab: data.tab,
      };
      tabEventListeners.forEach((fn) => fn(eventData));
      return;
    }

    // 群组事件（由 Background SW → CS → 这里转发）
    if (data.eventType === "groupEvent") {
      const eventData: GroupEventData = {
        event: data.event,
        group: data.group,
      };
      groupEventListeners.forEach((fn) => fn(eventData));
      return;
    }

    const callback = pendingCallbacks.get(data.id);
    if (callback) {
      pendingCallbacks.delete(data.id);
      if (data.error) {
        callback(undefined, data.error);
      } else {
        callback(data.result);
      }
    }
  });

  // 主动发送 ping，请求 Content Script 回复 ready
  // 解决 Content Script 在 document_start 时发 ready 但 Web JS 还没加载的问题
  window.postMessage(
    { source: BRIDGE_SOURCE, action: "ping" },
    "*"
  );
  // 延迟再发一次，确保 React 完全加载后 Content Script 能收到
  setTimeout(() => {
    if (!bridgeReady) {
      window.postMessage(
        { source: BRIDGE_SOURCE, action: "ping" },
        "*"
      );
    }
  }, 500);
}

/**
 * 调用 Chrome Bridge 的某个 action
 */
function callBridge<T = unknown>(
  action: string,
  payload?: Record<string, unknown>,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const timer = setTimeout(() => {
      pendingCallbacks.delete(id);
      reject(new Error(`Bridge timeout: ${action}`));
    }, timeoutMs);

    pendingCallbacks.set(id, (result, error) => {
      clearTimeout(timer);
      if (error) {
        reject(new Error(error));
      } else {
        resolve(result as T);
      }
    });

    window.postMessage(
      { source: BRIDGE_SOURCE, action, payload, id },
      "*"
    );
  });
}

/**
 * 等待桥接就绪（最长 2 秒）
 */
function waitForBridge(timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    if (bridgeReady) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    bridgeReadyCheckers.push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * 检查 Chrome Bridge 是否可用
 * 真正的检测：等待 Content Script 发送 ready 消息
 */
export async function checkBridgeAvailable(
  timeoutMs = 2000
): Promise<boolean> {
  return waitForBridge(timeoutMs);
}

/**
 * 获取所有标签页（跨窗口）
 * 如果桥接不可用，返回空数组
 */
export async function getAllTabs(): Promise<ChromeTabInfo[]> {
  try {
    const ready = await waitForBridge(2000);
    if (!ready) {
      console.warn("[FlowShelf] Bridge not available");
      return [];
    }
    const tabs = await callBridge<ChromeTabInfo[]>("getAllTabs");
    return Array.isArray(tabs) ? tabs : [];
  } catch (err) {
    console.error("[FlowShelf] getAllTabs failed:", err);
    return [];
  }
}

/**
 * 关闭指定标签页
 */
export async function closeTab(tabId: number): Promise<void> {
  await callBridge<void>("closeTab", { tabId });
}

/**
 * 激活指定标签页
 */
export async function activateTab(tabId: number): Promise<void> {
  await callBridge<void>("activateTab", { tabId });
}

/**
 * 获取指定标签页的正文内容
 */
export async function getTabContent(tabId: number): Promise<string> {
  try {
    const result = await callBridge<{ content: string }>("getTabContent", {
      tabId,
    });
    return result?.content || "";
  } catch (err) {
    console.error("[FlowShelf] getTabContent failed:", err);
    return "";
  }
}

/**
 * 获取当前激活的标签页
 */
export async function getCurrentTab(): Promise<ChromeTabInfo | null> {
  try {
    return await callBridge<ChromeTabInfo | null>("getCurrentTab");
  } catch {
    return null;
  }
}

/**
 * 获取所有 Chrome 原生标签群组（含名称和颜色）
 */
export async function getTabGroups(): Promise<ChromeTabGroupInfo[]> {
  try {
    const ready = await waitForBridge(2000);
    if (!ready) return [];
    const groups = await callBridge<ChromeTabGroupInfo[]>("getTabGroups");
    return Array.isArray(groups) ? groups : [];
  } catch (err) {
    console.error("[FlowShelf] getTabGroups failed:", err);
    return [];
  }
}

/**
 * 订阅标签页事件（新增/关闭/URL变化/换群组）
 * 返回取消订阅函数
 */
export function onTabEvent(listener: TabEventListener): () => void {
  tabEventListeners.add(listener);
  return () => tabEventListeners.delete(listener);
}

/**
 * 订阅 Chrome 原生标签群组事件（创建/改名/解散）
 * 返回取消订阅函数
 */
export function onGroupEvent(listener: GroupEventListener): () => void {
  groupEventListeners.add(listener);
  return () => groupEventListeners.delete(listener);
}

/** AI 分组结果 → Chrome 原生标签群组的映射结构 */
export interface TabGroupRequest {
  name: string;
  tabIds: number[];
}

/** 一键整理结果 */
export interface GroupTabsResult {
  success: boolean;
  results?: {
    name: string;
    windowId: number;
    groupId: number;
    tabCount: number;
  }[];
  error?: string;
}

/**
 * 一键整理：将 AI 分组结果应用为 Chrome 原生标签群组。
 *
 * 后端会先解散所有窗口的现有群组，再按分组逐组创建群组并设置名称/颜色。
 * 跨窗口的同一分组会在每个窗口分别创建同名群组。
 */
export async function groupTabs(
  groups: TabGroupRequest[]
): Promise<GroupTabsResult> {
  try {
    const ready = await waitForBridge(2000);
    if (!ready) {
      return { success: false, error: "Bridge 不可用" };
    }
    const result = await callBridge<GroupTabsResult>("groupTabs", { groups });
    return result || { success: false, error: "无响应" };
  } catch (err) {
    console.error("[FlowShelf] groupTabs failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
