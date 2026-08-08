/**
 * FlowShelf 扩展后台脚本（Service Worker）
 *
 * 职责：
 * 1. 注册右键菜单「收藏到 FlowShelf」
 * 2. 监听快捷键 Cmd+Shift+S / Ctrl+Shift+S
 * 3. 两者都触发打开 popup，由 popup 完成收藏流程
 * 4. 监听浏览器原生书签创建（方案 B：双写）
 *    - 用户点 ⭐️ → Chrome 创建书签 → 扩展同步到 FlowShelf 待学习队列
 *    - 保留原生书签，不删除
 *    - 显示 chrome.notifications 通知用户
 */

import { getApiBase } from "@/lib/api";

const CONTEXT_MENU_ID = "flowshelf-collect";

// 通知 ID 前缀
const NOTIFICATION_ID_PREFIX = "flowshelf-bookmark-";

// 防抖：避免短时间内重复书签事件（如 Chrome 同步触发）
const recentBookmarkUrls = new Map<string, number>();
const DEDUP_WINDOW_MS = 3000;

// 安装时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "📚 收藏到 FlowShelf",
    contexts: ["page"],
  });
});

// 右键菜单点击 → 打开弹窗
chrome.contextMenus.onClicked.addListener(async (info, _tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    await openPopup();
  }
});

// 快捷键 → 打开弹窗
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "collect-current-page") {
    await openPopup();
  }
});

// ============ 书签双写：监听原生 ⭐️ 收藏 ============

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log("[FlowShelf] Bookmark created:", id, bookmark.url);

  const url = bookmark.url;
  if (!url || !url.startsWith("http")) {
    // 非网页书签（如文件夹），不处理
    return;
  }

  // 防抖：3 秒内相同 URL 不重复处理
  const now = Date.now();
  const lastTime = recentBookmarkUrls.get(url);
  if (lastTime && now - lastTime < DEDUP_WINDOW_MS) {
    console.log("[FlowShelf] Duplicate bookmark event, skipping");
    return;
  }
  recentBookmarkUrls.set(url, now);
  // 清理过期记录
  setTimeout(() => recentBookmarkUrls.delete(url), DEDUP_WINDOW_MS);

  try {
    await syncBookmarkToFlowShelf(url, bookmark.title || url);
  } catch (err) {
    console.error("[FlowShelf] Bookmark sync failed:", err);
    showNotification(
      "FlowShelf 同步失败",
      `${bookmark.title.slice(0, 30)} - 可在扩展中手动重试`
    );
  }
});

/**
 * 将书签同步到 FlowShelf 待学习队列
 */
async function syncBookmarkToFlowShelf(url: string, title: string): Promise<void> {
  // 查找当前激活的 Tab（用于提取正文）
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  let content = "";
  if (activeTab?.id && activeTab.url === url) {
    // 当前激活 Tab 就是刚收藏的页面，提取正文
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          const body = document.body;
          const text = body ? body.innerText : "";
          return text.slice(0, 50000);
        },
      });
      content = (result?.result as string) || "";
    } catch (err) {
      console.warn("[FlowShelf] Content extraction failed:", err);
    }
  }

  // 调后端快速保存（方案 C：先入库，AI 后台补全）
  const apiBase = await getApiBase();
  const res = await fetch(`${apiBase}/api/learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_url: url,
      title,
      item_type: "article",
      content,
    }),
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }

  const data = await res.json();
  console.log("[FlowShelf] Bookmark synced to learning queue:", data.id);

  // 显示通知
  const shortTitle = title.length > 30 ? title.slice(0, 30) + "..." : title;
  showNotification(
    "✅ 已同步到 FlowShelf",
    `${shortTitle}\nAI 正在后台生成摘要和标签`
  );
}

/**
 * 显示 Chrome 通知
 */
function showNotification(title: string, message: string): void {
  const notificationId = `${NOTIFICATION_ID_PREFIX}${Date.now()}`;
  try {
    chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: "icon-128.png",
      title,
      message,
      priority: 1,
    });
  } catch (err) {
    console.warn("[FlowShelf] Notification failed:", err);
  }
}

/**
 * 打开 popup 弹窗
 * Chrome 127+ 支持 chrome.action.openPopup()，旧版本静默失败
 */
async function openPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch {
    // 旧版本 Chrome 不支持 openPopup，用户需手动点击扩展图标
    console.log("openPopup 不可用，请点击扩展图标收藏");
  }
}

// ============ Bridge：Tab 操作中继 + 事件转发 ============
// Content Script 无法直接访问 chrome.tabs.*，由 Background SW 中继。
// 同时监听标签事件，转发给 Web 应用页面的 Content Script。

const WEB_APP_URL_PATTERNS = [
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
  "https://*.flowshelf.app/*",
];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "bridge-action") return;

  console.log("[FlowShelf BG] Bridge action:", message.action);

  handleBridgeAction(message.action, message.payload)
    .then((result) => sendResponse({ result }))
    .catch((err) =>
      sendResponse({ error: err instanceof Error ? err.message : String(err) })
    );

  return true; // 保持消息通道开放（异步响应）
});

async function handleBridgeAction(
  action: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  switch (action) {
    case "getAllTabs": {
      const tabs = await chrome.tabs.query({});
      return tabs.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        favIconUrl: t.favIconUrl,
        windowId: t.windowId,
        active: t.active,
      }));
    }
    case "closeTab": {
      const tabId = payload.tabId as number;
      if (tabId) {
        await chrome.tabs.remove(tabId);
        return { success: true };
      }
      return { success: false, error: "tabId required" };
    }
    case "activateTab": {
      const tabId = payload.tabId as number;
      if (tabId) {
        const tab = await chrome.tabs.update(tabId, { active: true });
        if (tab?.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        return { success: true };
      }
      return { success: false, error: "tabId required" };
    }
    case "getTabContent": {
      const tabId = payload.tabId as number;
      if (tabId) {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const body = document.body;
            return body ? body.innerText.slice(0, 50000) : "";
          },
        });
        return { content: (result?.result as string) || "" };
      }
      return { content: "" };
    }
    case "getCurrentTab": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      return tab
        ? {
            id: tab.id,
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
          }
        : null;
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

/** 将标签事件转发给 Web 应用页面的 Content Script */
function forwardTabEvent(eventType: string, tabData: unknown): void {
  chrome.tabs.query({ url: WEB_APP_URL_PATTERNS }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "tab-event",
            event: eventType,
            tab: tabData,
          })
          .catch(() => {
            // 目标 tab 没有 content script，静默忽略
          });
      }
    }
  });
}

chrome.tabs.onCreated.addListener((tab) => {
  forwardTabEvent("created", {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    windowId: tab.windowId,
    active: tab.active,
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  forwardTabEvent("updated", {
    id: tabId,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    windowId: tab.windowId,
    active: tab.active,
    changeInfo,
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forwardTabEvent("removed", { id: tabId });
});

export {};
