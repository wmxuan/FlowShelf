/**
 * Content Script Bridge
 *
 * 注入到 Web 应用页面（localhost:3000），充当 Web 应用与 Chrome 扩展 API 之间的桥梁。
 * Content Script 无法直接访问 chrome.tabs.*，所有操作通过 chrome.runtime.sendMessage
 * 转发给 Background Service Worker 执行。
 *
 * 同时监听 Background 转发的标签事件（onCreated/onUpdated/onRemoved），
 * 通过 window.postMessage 通知 Web 页面。
 *
 * 消息协议：
 *   Web → CS: window.postMessage({ source: 'flowshelf-bridge', action, payload, id })
 *   CS → Web: window.postMessage({ source: 'flowshelf-bridge', result/error, id })
 *   CS → BG:  chrome.runtime.sendMessage({ type: 'bridge-action', action, payload })
 *   BG → CS:  chrome.tabs.sendMessage(tabId, { type: 'tab-event', event, tab })
 */

const BRIDGE_SOURCE = "flowshelf-bridge";

console.log("[FlowShelf Bridge] Content script loaded");

/**
 * 处理来自 Web 页面的请求：转发给 Background SW
 */
async function handleMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || data.source !== BRIDGE_SOURCE) return;

  // Web 端加载后主动发送 ping，回复 ready
  if (data.action === "ping") {
    console.log("[FlowShelf Bridge] Received ping, replying ready");
    window.postMessage({ source: BRIDGE_SOURCE, status: "ready" }, "*");
    return;
  }

  const { action, payload, id } = data;
  console.log("[FlowShelf Bridge] Received action:", action);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "bridge-action",
      action,
      payload,
    });

    console.log(`[FlowShelf Bridge] ${action} response:`, response);

    if (response?.error) {
      window.postMessage(
        { source: BRIDGE_SOURCE, error: response.error, id },
        event.origin
      );
    } else {
      window.postMessage(
        { source: BRIDGE_SOURCE, result: response?.result, id },
        event.origin
      );
    }
  } catch (err) {
    console.error("[FlowShelf Bridge] Error:", err);
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        error: err instanceof Error ? err.message : String(err),
        id,
      },
      event.origin
    );
  }
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.source !== BRIDGE_SOURCE) return;
  // 只处理请求（带 action 字段）。忽略自身发出的响应/事件回声，否则会把
  // 响应当作新请求再次转发给 background，触发无限循环。
  if (data.action === undefined) return;
  handleMessage(event);
});

// 监听 Background SW 转发的标签事件，relay 给 Web 页面
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "tab-event") return;

  window.postMessage(
    {
      source: BRIDGE_SOURCE,
      eventType: "tabEvent",
      event: message.event, // 'created' | 'updated' | 'removed'
      tab: message.tab,
    },
    "*"
  );
});

// 页面加载时发一次 ready（可能在 Web JS 加载前）
window.postMessage({ source: BRIDGE_SOURCE, status: "ready" }, "*");
console.log("[FlowShelf Bridge] Content script ready, sent initial ready message");
