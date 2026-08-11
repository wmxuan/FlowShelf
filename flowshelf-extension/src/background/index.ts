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
 *    - 页面 toast 提示用户已收藏到暂存区
 * 5. 自动启动后端（通过 Native Messaging 或端口探测）
 */

import { getApiBase, setApiBase, setWebBase, DEFAULT_API_BASE, DEFAULT_WEB_BASE } from "@/lib/api";
import { startBackend, checkBackendStatus } from "@/native-host";

const CONTEXT_MENU_ID = "flowshelf-collect";

// 通知 ID 前缀
const NOTIFICATION_ID_PREFIX = "flowshelf-bookmark-";

// 防抖：避免短时间内重复书签事件（如 Chrome 同步触发）
const recentBookmarkUrls = new Map<string, number>();
const DEDUP_WINDOW_MS = 3000;

// 暂存区去重：相同 URL 60 秒内已成功写入过就不重复创建（避免 ⭐️+popup 双入口重复造 unspecified/article）
const recentlySavedLearningUrls = new Map<string, number>();
const RECENT_SAVED_WINDOW_MS = 60 * 1000;

// 扩展安装/更新时：创建右键菜单 + 启动后端 + 注册动态 content script
chrome.runtime.onInstalled.addListener(async () => {
  // 1. 创建右键菜单
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "📚 收藏到 FlowShelf",
    contexts: ["page"],
  });

  // 2. 启动后端
  await ensureBackendRunning();

  // 3. 注册动态 content script（匹配后端实际端口）
  await registerDynamicContentScript();
});

// 扩展 Service Worker 启动时也确保后端在运行 + 注册动态 CS
// （onInstalled 只在安装/更新时触发，Service Worker 重启后需要重新检测）
chrome.runtime.onStartup.addListener(async () => {
  await ensureBackendRunning();
  await registerDynamicContentScript();
});

/**
 * 确保后端在运行：
 * 1. 先探测是否已在运行 → 直接用
 * 2. Native Messaging 启动 → 用返回的 URL
 * 3. Native Messaging 也失败 → 再探测一次（启动需要时间）
 */
async function ensureBackendRunning(): Promise<void> {
  // 先快速探测是否已在运行
  for (let port = 8972; port <= 8979; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) {
        const url = `http://localhost:${port}`;
        await setApiBase(url);
        await setWebBase(url);
        console.log("[FlowShelf] Backend already running on port", port);
        // 立即注册动态 content script 以匹配实际端口
        await registerDynamicContentScript();
        return;
      }
    } catch {
      /* not running */
    }
  }

  // 后端未运行，尝试 Native Messaging 启动
  const result = await startBackend();
  if (result.status === "ok" && result.port && result.url) {
    await setApiBase(result.url);
    await setWebBase(result.url);
    console.log("[FlowShelf] Backend auto-started via Native Messaging on port", result.port);
    await registerDynamicContentScript();
    return;
  }

  console.warn("[FlowShelf] Native Messaging start failed:", result.message);

  // Native Messaging 也失败，等 2 秒再探测一次（可能有其他进程在启动）
  await new Promise((r) => setTimeout(r, 2000));
  await tryDetectBackend();
}

/**
 * 探测已在运行的后端（Native Messaging 失败时的 fallback）
 * 尝试 8972-8979 端口，命中 /api/health 即认为可用
 */
async function tryDetectBackend(): Promise<void> {
  for (let port = 8972; port <= 8979; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        const url = `http://localhost:${port}`;
        await setApiBase(url);
        await setWebBase(url);
        console.log("[FlowShelf] Detected backend on port", port);
        await registerDynamicContentScript();
        return;
      }
    } catch {
      /* not running on this port */
    }
  }
  console.warn("[FlowShelf] No backend detected, using default");
}

/**
 * 动态注册 Content Script，匹配后端实际运行的端口
 *
 * manifest.json 的 content_scripts 只能声明固定端口（8972、3000），
 * 但后端可能因端口占用而启动在 8973+。动态注册弥补这一不足。
 *
 * 原理：chrome.scripting.registerContentScripts 可在运行时添加匹配规则，
 * 比静态声明更灵活，能覆盖 8973-8979 等动态端口。
 */
async function registerDynamicContentScript(): Promise<void> {
  const DYNAMIC_CS_ID = "flowshelf-bridge-dynamic";

  // 获取当前后端实际地址
  const { flowshelf_web_base } = await chrome.storage.local.get(["flowshelf_web_base"]);
  const webBase = (flowshelf_web_base as string) || DEFAULT_WEB_BASE;

  // 从 webBase 提取 origin（如 http://localhost:8973）
  let origin: string;
  try {
    origin = new URL(webBase).origin;
  } catch {
    origin = DEFAULT_WEB_BASE;
  }

  // 构建匹配模式：origin + 通配符路径
  const matchPattern = `${origin}/*`;

  // 检查是否已经注册过（避免重复注册报错）
  let existingScripts: chrome.scripting.RegisteredContentScript[] = [];
  try {
    existingScripts = await chrome.scripting.getRegisteredContentScripts({
      ids: [DYNAMIC_CS_ID],
    });
  } catch { /* API not available in older Chrome */ }

  // 如果已注册且匹配模式相同，跳过
  if (existingScripts.length > 0 && existingScripts[0].matches?.includes(matchPattern)) {
    console.log("[FlowShelf] Dynamic content script already registered for", matchPattern);
    return;
  }

  // 注册（或更新）动态 content script
  try {
    // 先尝试注销旧的
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_CS_ID] });
    } catch { /* ignore */ }

    await chrome.scripting.registerContentScripts([{
      id: DYNAMIC_CS_ID,
      matches: [matchPattern],
      js: ["src/content/bridge.ts"],
      runAt: "document_start",
    }]);
    console.log("[FlowShelf] Registered dynamic content script for", matchPattern);
  } catch (err) {
    console.warn("[FlowShelf] Failed to register dynamic content script:", err);
  }
}

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
//
// 用户点 ⭐️ → Chrome 原生书签弹窗选文件夹 → 点「完成」→ bookmarks.onCreated 触发
// → 扩展直接同步到 FlowShelf 暂存区（item_type=unspecified）→ 页面 toast 提示。
// 不做二次确认：用户已通过 Chrome 原生弹窗表达了收藏意图，直接入库减少摩擦。
// 如需删除可在 Web 应用暂存区操作。

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log("[FlowShelf] Bookmark created:", id, bookmark.url);

  const url = bookmark.url;
  if (!url || !url.startsWith("http")) {
    // 非网页书签（如文件夹），不处理
    return;
  }

  // 防抖：3 秒内相同 URL 不重复触发（Chrome 同步多设备/多窗口重复事件）
  // 使用归一化 URL 作为 key，容忍末尾斜杠差异
  const now = Date.now();
  const dedupKey = url.replace(/\/+$/, "");
  const lastEventTime = recentBookmarkUrls.get(dedupKey);
  if (lastEventTime && now - lastEventTime < DEDUP_WINDOW_MS) {
    console.log("[FlowShelf] Duplicate bookmark event, skipping");
    return;
  }
  recentBookmarkUrls.set(dedupKey, now);
  setTimeout(() => recentBookmarkUrls.delete(dedupKey), DEDUP_WINDOW_MS);

  // 暂存区去重：60 秒内这条 URL 已经成功写入过暂存区（不管是 ⭐️ 还是 popup），就不再重复同步
  const savedDedupKey = dedupKey; // 复用归一化 URL
  const lastSavedTime = recentlySavedLearningUrls.get(savedDedupKey);
  if (lastSavedTime && now - lastSavedTime < RECENT_SAVED_WINDOW_MS) {
    console.log("[FlowShelf] URL recently saved to learning, skip:", url);
    return;
  }

  // 直接同步到 FlowShelf 暂存区（无需二次确认）
  try {
    await syncBookmarkToFlowShelf(url, bookmark.title || url);
    recentlySavedLearningUrls.set(savedDedupKey, Date.now());
    setTimeout(
      () => recentlySavedLearningUrls.delete(savedDedupKey),
      RECENT_SAVED_WINDOW_MS
    );
  } catch (err) {
    console.error("[FlowShelf] Bookmark sync failed:", err);
  }
});

/**
 * 将书签同步到 FlowShelf 待学习队列
 */
async function syncBookmarkToFlowShelf(url: string, title: string): Promise<void> {
  // 跨窗口定位刚收藏的 Tab：Service Worker 中 currentWindow 不可靠
  // （指向 SW 所在的"窗口"概念，非用户操作窗口），导致取不到对应 tab → content 为空
  // → create_item 跳过 AI 补全 → 条目永久 is_ready=False（用户感知"失效"）。
  // 改为查询所有 tab 后按 URL 模糊匹配（容忍末尾斜杠差异）。
  const allTabs = await chrome.tabs.query({});
  const normalizeUrl = (u: string) => u.replace(/\/+$/, ""); // 去掉末尾斜杠
  const targetTab = allTabs.find(
    (t) => t.url && normalizeUrl(t.url) === normalizeUrl(url)
  );

  let content = "";
  if (targetTab?.id) {
    try {
      // 先验证 tab 仍然存在（用户可能在点击⭐后快速关闭了页面）
      await chrome.tabs.get(targetTab.id);
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          const body = document.body;
          const text = body ? body.innerText : "";
          return text.slice(0, 50000);
        },
      });
      content = (result?.result as string) || "";
    } catch (err) {
      console.warn("[FlowShelf] Content extraction failed:", err);
      // tab 已关闭或权限不足，content 留空，收藏仍继续
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
      item_type: "unspecified",
      content,
    }),
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }

  const data = await res.json();
  console.log("[FlowShelf] Bookmark synced to learning queue:", data.id);

  // 反馈：优先向目标页注入 toast（用户能看到），失败兜底系统通知
  const shortTitle = title.length > 30 ? title.slice(0, 30) + "..." : title;
  const toastMsg = `✅ 已放入待分类暂存区\n请在 Web 应用中选择归档类型\n${shortTitle}`;
  let toasted = false;
  if (targetTab?.id) {
    toasted = await injectPageToast(targetTab.id, toastMsg, true);
  }
  if (!toasted) {
    showNotification(
      "✅ 已放入待分类暂存区",
      `${shortTitle}\n请到 Web 应用「暂存区 → 待分类」选择归档类型`
    );
  }
}

/**
 * 向目标标签页注入一条页面内 toast（与 bookmarklet toast 样式一致）。
 * @returns 是否注入成功
 */
async function injectPageToast(
  tabId: number,
  message: string,
  ok: boolean
): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg: string, success: boolean) => {
        const t = document.createElement("div");
        t.textContent = msg;
        t.style.cssText =
          'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 20px;border-radius:8px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#fff;background:' +
          (success ? "#10b981" : "#dc2626") +
          ";box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:80vw;word-break:break-word;white-space:pre-line;";
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
      },
      args: [message, ok],
    });
    return true;
  } catch (err) {
    console.warn("[FlowShelf] injectPageToast failed:", err);
    return false;
  }
}

/**
 * 显示 Chrome 通知
 */
function showNotification(title: string, message: string): void {
  const notificationId = `${NOTIFICATION_ID_PREFIX}${Date.now()}`;
  try {
    chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon512.png"),
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

// 默认 URL 匹配模式（开发环境 localhost:3000 + 生产环境 flowshelf.app）
const DEFAULT_WEB_APP_URL_PATTERNS = [
  "http://localhost:3000/*",
  "http://127.0.0.1:3000/*",
  "http://localhost:8972/*",
  "http://127.0.0.1:8972/*",
  "https://*.flowshelf.app/*",
];

/**
 * 获取 Web 应用 URL 匹配模式（动态读取 storage 中的 web base）
 */
async function getWebAppUrlPatterns(): Promise<string[]> {
  const { flowshelf_web_base } = await chrome.storage.local.get(["flowshelf_web_base"]);
  const webBase = flowshelf_web_base as string | undefined;
  if (!webBase) return DEFAULT_WEB_APP_URL_PATTERNS;
  // 将 http://localhost:8972 转为 http://localhost:8972/*
  const pattern = webBase.endsWith("/*") ? webBase : `${webBase}/*`;
  // 去重：自定义 pattern + 默认 patterns
  const all = [pattern, ...DEFAULT_WEB_APP_URL_PATTERNS];
  return [...new Set(all)];
}

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
        groupId: t.groupId,
        active: t.active,
      }));
    }
    case "getTabGroups": {
      const groups = await chrome.tabGroups.query({});
      return groups.map((g) => ({
        id: g.id,
        title: g.title || "",
        color: g.color,
        windowId: g.windowId,
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
    case "groupTabs": {
      // 「一键整理」：按 AI 分组创建 Chrome 原生标签群组。
      // 分配策略：单窗口最多 MAX_TABS_PER_WINDOW 个 tab，
      // 超出时新开窗口；单个分组超限时拆分到多个窗口。
      const groups = payload.groups as {
        name: string;
        tabIds: number[];
      }[];
      if (!Array.isArray(groups)) {
        return { success: false, error: "groups required" };
      }

      const MAX_TABS_PER_WINDOW = 10;

      // Step 1: 获取当前窗口（最后聚焦的窗口）
      const currentWindow = await chrome.windows.getLastFocused();
      const currentWindowId = currentWindow.id!;

      // Step 2: 查询所有 tab，建立 tabId → windowId 映射
      const allTabs = await chrome.tabs.query({});
      const tabWindowMap = new Map<number, number>();
      for (const t of allTabs) {
        if (t.id != null && t.windowId != null) {
          tabWindowMap.set(t.id, t.windowId);
        }
      }

      // Step 3: 先解散所有窗口的所有现有群组
      const allTabIds = allTabs
        .map((t) => t.id)
        .filter((id): id is number => id != null);
      if (allTabIds.length > 0) {
        try {
          await chrome.tabs.ungroup(allTabIds);
        } catch (err) {
          console.warn("[FlowShelf BG] ungroup all failed:", err);
        }
      }

      // Step 4: 过滤有效分组（去除已关闭的 tab）
      const validGroups = groups
        .map((g) => ({
          name: g.name,
          tabIds: (g.tabIds || []).filter((id) => tabWindowMap.has(id)),
        }))
        .filter((g) => g.tabIds.length > 0);

      // Step 5: 计算窗口分配方案
      // 每个 slot = { windowId, groupChunks: [{ name, tabIds, groupIndex }] }
      // groupChunks 允许单个分组拆分到多个窗口
      type GroupChunk = {
        name: string;
        tabIds: number[];
        groupIndex: number;
      };
      type WindowSlot = {
        windowId: number;
        groupChunks: GroupChunk[];
        tabCount: number;
      };

      const windowSlots: WindowSlot[] = [
        { windowId: currentWindowId, groupChunks: [], tabCount: 0 },
      ];

      for (let gi = 0; gi < validGroups.length; gi++) {
        const { name, tabIds } = validGroups[gi];
        let remaining = [...tabIds];

        while (remaining.length > 0) {
          let slot = windowSlots[windowSlots.length - 1];
          const available = MAX_TABS_PER_WINDOW - slot.tabCount;

          if (available <= 0) {
            // 当前窗口已满，新建窗口（占位 ID，后续替换）
            slot = {
              windowId: -1,
              groupChunks: [],
              tabCount: 0,
            };
            windowSlots.push(slot);
            continue; // 重新计算 available
          }

          const chunk = remaining.splice(0, available);
          slot.groupChunks.push({ name, tabIds: chunk, groupIndex: gi });
          slot.tabCount += chunk.length;
        }
      }

      // Step 6: 为 windowId=-1 的 slot 创建真实窗口
      // 用第一个 chunk 的第一个 tab 作为种子，避免 chrome.windows.create 产生空白新标签页
      for (const slot of windowSlots) {
        if (slot.windowId === -1) {
          const firstChunk = slot.groupChunks[0];
          const seedTabId = firstChunk?.tabIds[0]; // 不移除，保留在 chunk 中以参与建组
          if (seedTabId != null) {
            const newWin = await chrome.windows.create({ tabId: seedTabId, focused: false });
            slot.windowId = newWin.id!;
            // 更新映射，让 Step 8 知道种子 tab 已在新窗口中，无需再 move
            tabWindowMap.set(seedTabId, newWin.id!);
          } else {
            // 无 tab 可用（不应发生），回退到空白窗口
            const newWin = await chrome.windows.create({ focused: false });
            slot.windowId = newWin.id!;
          }
        }
      }

      // Step 7: 颜色循环
      const COLORS: chrome.tabGroups.ColorEnum[] = [
        "blue",
        "cyan",
        "red",
        "yellow",
        "green",
        "pink",
        "purple",
        "orange",
      ];

      // Step 8: 移动 tab 到目标窗口 + 创建群组
      const results: {
        name: string;
        windowId: number;
        groupId: number;
        tabCount: number;
      }[] = [];

      for (const slot of windowSlots) {
        for (const chunk of slot.groupChunks) {
          // 把不在目标窗口的 tab 移过去
          const tabsToMove = chunk.tabIds.filter(
            (id) => tabWindowMap.get(id) !== slot.windowId
          );
          if (tabsToMove.length > 0) {
            try {
              await chrome.tabs.move(tabsToMove, {
                windowId: slot.windowId,
                index: -1,
              });
            } catch (err) {
              console.warn("[FlowShelf BG] move tabs failed:", err);
            }
          }

          // 创建群组
          try {
            const groupId = await chrome.tabs.group({
              tabIds: chunk.tabIds,
              createProperties: { windowId: slot.windowId },
            });
            await chrome.tabGroups.update(groupId, {
              title: chunk.name,
              color: COLORS[chunk.groupIndex % COLORS.length],
            });
            results.push({
              name: chunk.name,
              windowId: slot.windowId,
              groupId,
              tabCount: chunk.tabIds.length,
            });
          } catch (err) {
            console.warn("[FlowShelf BG] create group failed:", err);
          }
        }
      }

      // Step 9: 清理新建窗口中的多余空白 tab（chrome.windows.create 会自带一个 about:blank）
      for (const slot of windowSlots) {
        if (slot.windowId === currentWindowId) continue;
        try {
          const tabsInWin = await chrome.tabs.query({ windowId: slot.windowId });
          for (const t of tabsInWin) {
            // 空白 tab 且不在任何分组 chunk 中
            if (t.id && (t.url === "chrome://newtab/" || t.url === "about:blank")) {
              const usedInChunk = slot.groupChunks.some((c) => c.tabIds.includes(t.id!));
              if (!usedInChunk) {
                await chrome.tabs.remove(t.id);
              }
            }
          }
        } catch (err) {
          console.warn("[FlowShelf BG] cleanup blank tab failed:", err);
        }
      }

      // Step 10: 关闭变空的普通窗口（保留当前窗口和特殊窗口）
      const remainingWindows = await chrome.windows.getAll();
      for (const win of remainingWindows) {
        if (win.id == null) continue;
        if (win.id === currentWindowId) continue;
        // 不关闭刚创建的窗口（它们有分组内容）
        if (windowSlots.some((s) => s.windowId === win.id)) continue;
        if (win.type !== "normal") continue;
        const tabsInWin = await chrome.tabs.query({ windowId: win.id });
        if (tabsInWin.length === 0) {
          try {
            await chrome.windows.remove(win.id);
          } catch (err) {
            console.warn("[FlowShelf BG] close empty window failed:", err);
          }
        }
      }

      return { success: true, results };
    }
    default:
      return { error: `Unknown action: ${action}` };
  }
}

/** 将标签事件转发给 Web 应用页面的 Content Script */
async function forwardTabEvent(eventType: string, tabData: unknown): Promise<void> {
  const patterns = await getWebAppUrlPatterns();
  chrome.tabs.query({ url: patterns }).then((tabs) => {
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
    groupId: tab.groupId,
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
    groupId: tab.groupId,
    active: tab.active,
    changeInfo,
  });

  // 标签在浏览器中换群组 → 额外转发 grouped 事件，让 Web 应用同步分组归属
  if (Object.prototype.hasOwnProperty.call(changeInfo, "groupId") && tab) {
    forwardTabEvent("grouped", {
      id: tabId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      windowId: tab.windowId,
      groupId: tab.groupId,
      active: tab.active,
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forwardTabEvent("removed", { id: tabId });
});

// ============ Chrome 原生标签群组事件转发 ============
// 群组创建/改名/解散 → 转发为 groupEvent，Web 应用同步分组名称与归属

/** 将群组事件转发给 Web 应用页面的 Content Script */
async function forwardGroupEvent(
  eventType: "created" | "updated" | "removed",
  group: chrome.tabGroups.TabGroup
): Promise<void> {
  const patterns = await getWebAppUrlPatterns();
  chrome.tabs.query({ url: patterns }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "group-event",
            event: eventType,
            group: {
              id: group.id,
              title: group.title || "",
              color: group.color,
              windowId: group.windowId,
            },
          })
          .catch(() => {
            // 目标 tab 没有 content script，静默忽略
          });
      }
    }
  });
}

chrome.tabGroups.onCreated.addListener((group) => {
  forwardGroupEvent("created", group);
});

chrome.tabGroups.onUpdated.addListener((group) => {
  forwardGroupEvent("updated", group);
});

chrome.tabGroups.onRemoved.addListener((group) => {
  forwardGroupEvent("removed", group);
});

export {};
