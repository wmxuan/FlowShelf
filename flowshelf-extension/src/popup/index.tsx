import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { learningApi, tabsApi, getWebBase } from "@/lib/api";
import { extractPageContent } from "@/lib/content-extractor";
import type { TabGroup, GroupContext } from "@/lib/types";
import "./popup.css";

console.log("[FlowShelf] Popup script loaded");

type CollectType = "card" | "tool";
type Phase = "loading" | "ready" | "saving" | "success" | "error" | "invalid-page";
type ViewMode = "collect" | "tabs";

function isCollectible(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export default function Popup() {
  const [viewMode, setViewMode] = useState<ViewMode>("collect");
  const [phase, setPhase] = useState<Phase>("loading");
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  const [savingType, setSavingType] = useState<CollectType | null>(null);
  const [error, setError] = useState("");

  // Tab 视图状态
  const [allTabs, setAllTabs] = useState<chrome.tabs.Tab[]>([]);
  const [tabGroups, setTabGroups] = useState<TabGroup[]>([]);
  const [groupCount, setGroupCount] = useState(0);
  const [tabLoading, setTabLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [tabError, setTabError] = useState("");
  const [enriching, setEnriching] = useState<number | null>(null);
  const [enrichMsg, setEnrichMsg] = useState("");
  const enrichMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs：事件监听器中读取最新状态（与 tabs 页面一致的模式）
  const tabsRef = useRef<chrome.tabs.Tab[]>([]);
  const groupsRef = useRef<TabGroup[]>([]);
  const loadedRef = useRef(false);
  const currentWindowIdRef = useRef<number | null>(null);
  useEffect(() => { tabsRef.current = allTabs; }, [allTabs]);
  useEffect(() => { groupsRef.current = tabGroups; }, [tabGroups]);

  // ============ 初始化：取当前 Tab（快，不调 AI） ============
  useEffect(() => {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.url || !isCollectible(tab.url)) {
          setPhase("invalid-page");
          return;
        }
        setTabId(tab.id ?? null);
        setTabUrl(tab.url);
        setTabTitle(tab.title || tab.url);
        setPhase("ready");
      } catch (err) {
        console.error("[FlowShelf] init error:", err);
        setError(err instanceof Error ? err.message : "初始化失败");
        setPhase("error");
      }
    })();
  }, []);

  useEffect(() => {
    if (viewMode === "tabs") {
      fetchAndGroupTabs();
    }
  }, [viewMode]);

  // ============ 收藏：卡片 / 工具 → 暂存区（不等待 AI，成功用 toast 提示，无第二页） ============
  async function handleCollect(type: CollectType) {
    if (tabId == null || !tabUrl) return;
    setSavingType(type);
    setError("");
    try {
      const content = await extractPageContent(tabId);
      const itemType = type === "card" ? "article" : "tool";
      await learningApi.create(tabUrl, tabTitle, itemType, content);

      // 成功：向当前页面注入 toast（绿色，与书签/bookmarklet 视觉一致），不显示第二页
      const msg =
        type === "card"
          ? "✅ 已收入知识卡片库暂存区，AI 后台生成中"
          : "✅ 已放入工具箱暂存区，AI 后台生成中";
      await injectToastToCurrentTab(msg, true);

      // toast 弹出后短延迟关闭 popup，让用户感知反馈已送达
      setTimeout(() => window.close(), 400);
    } catch (err) {
      console.error("[FlowShelf] collect error:", err);
      // 提供更详细的错误信息，帮助定位 "Failed to fetch" 根因
      const errMsg = err instanceof Error ? err.message : "收藏失败";
      if (errMsg === "Failed to fetch") {
        setError("连接后端失败，请确认后端正在运行（http://localhost:8972）");
      } else {
        setError(errMsg);
      }
    } finally {
      setSavingType(null);
    }
  }

  /**
   * 向当前 Tab 注入页面内 toast（与书签同步、bookmarklet 样式一致）
   */
  async function injectToastToCurrentTab(message: string, ok: boolean): Promise<void> {
    if (tabId == null) return;
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
    } catch (err) {
      console.warn("[FlowShelf] injectToastToCurrentTab failed:", err);
    }
  }

  // ============ Tab 管理（逻辑与 Web tabs 页面对齐） ============

  function isHttpTab(url?: string): boolean {
    return !!url && (url.startsWith("http://") || url.startsWith("https://"));
  }

  const fetchAndGroupTabs = useCallback(async () => {
    setTabLoading(true);
    setTabError("");
    try {
      const win = await chrome.windows.getCurrent();
      currentWindowIdRef.current = win.id ?? null;

      const tabs = await chrome.tabs.query({ currentWindow: true });
      const httpTabs = tabs.filter((t) => isHttpTab(t.url));
      setAllTabs(httpTabs);

      const tabInputs = httpTabs.map((t) => ({
        url: t.url!,
        title: t.title || "",
        favIconUrl: t.favIconUrl,
      }));

      if (tabInputs.length === 0) {
        setTabGroups([]);
        setGroupCount(0);
        return;
      }

      if (tabInputs.length <= 1) {
        setTabGroups([{ name: "全部标签", tab_indices: [0] }]);
        setGroupCount(1);
        setExpandedGroups(new Set([0]));
        return;
      }

      const result = await tabsApi.group(tabInputs);
      setTabGroups(result.groups);
      setGroupCount(result.group_count);
      setExpandedGroups(new Set(result.groups.map((_, i: number) => i)));
    } catch (err) {
      console.error("[FlowShelf] Tab grouping error:", err);
      setTabError(err instanceof Error ? err.message : "Tab 归组失败");
    } finally {
      setTabLoading(false);
      loadedRef.current = true;
    }
  }, []);

  /**
   * 本地移除单个标签：更新 tabs 数组和 groups 结构。
   * 基于 ref 一次性算出目标值后直接设值，规避 StrictMode 双调用问题。
   */
  function removeTabFromState(tabId: number) {
    const removedIndex = tabsRef.current.findIndex((t) => t.id === tabId);
    if (removedIndex === -1) return;

    const newTabs = tabsRef.current.filter((t) => t.id !== tabId);
    const newGroups = groupsRef.current
      .map((group) => ({
        ...group,
        tab_indices: group.tab_indices
          .filter((ti) => ti !== removedIndex)
          .map((ti) => (ti > removedIndex ? ti - 1 : ti)),
      }))
      .filter((group) => group.tab_indices.length > 0);

    setAllTabs(newTabs);
    setTabGroups(newGroups);
    setGroupCount(newGroups.length);
  }

  /** 本地移除整组：从 tabs 数组移除该组所有标签，并删除该组 */
  function removeGroupFromState(group: TabGroup) {
    const groupTabIds = new Set<number>(
      group.tab_indices
        .map((i) => tabsRef.current[i]?.id)
        .filter((id): id is number => id != null)
    );
    const newTabs = tabsRef.current.filter(
      (t) => !t.id || !groupTabIds.has(t.id)
    );
    setAllTabs(newTabs);
    setTabGroups((prevGroups) => {
      const remaining = prevGroups
        .filter((g) => g !== group)
        .map((g) => {
          const newIndices = g.tab_indices
            .map((oldIdx) => tabsRef.current[oldIdx])
            .filter((t) => t && t.id && !groupTabIds.has(t.id))
            .map((t) => newTabs.indexOf(t))
            .filter((idx) => idx >= 0);
          return { ...g, tab_indices: newIndices };
        })
        .filter((g) => g.tab_indices.length > 0);
      setGroupCount(remaining.length);
      return remaining;
    });
  }

  /** 构建 assign API 所需的已有分组上下文（仅传组名+数量+1个示例，省 token） */
  function buildExistingGroups(): GroupContext[] {
    return groupsRef.current.map((g) => ({
      name: g.name,
      count: g.tab_indices.length,
      sample_tabs: g.tab_indices
        .slice(0, 1)
        .map((i) => tabsRef.current[i])
        .filter(Boolean)
        .map((t) => ({ url: t.url || "", title: t.title || "" })),
    }));
  }

  /** 将新标签分配到已有分组或创建新分组（增量更新，不重新归组全部标签） */
  async function assignNewTab(tab: chrome.tabs.Tab, newTabIndex: number) {
    const existingGroups = buildExistingGroups();
    let groupName = "新标签";
    let isCreate = true;

    try {
      const result = await tabsApi.assign(
        { url: tab.url || "", title: tab.title || "" },
        existingGroups
      );
      groupName = result.group_name;
      isCreate = result.action === "create";
    } catch {
      // 降级：创建新组
    }

    setTabGroups((prevGroups) => {
      if (!isCreate) {
        return prevGroups.map((g) =>
          g.name === groupName && !g.tab_indices.includes(newTabIndex)
            ? { ...g, tab_indices: [...g.tab_indices, newTabIndex] }
            : g
        );
      }
      const exists = prevGroups.some((g) => g.name === groupName);
      if (exists) {
        return prevGroups.map((g) =>
          g.name === groupName && !g.tab_indices.includes(newTabIndex)
            ? { ...g, tab_indices: [...g.tab_indices, newTabIndex] }
            : g
        );
      }
      const updated = [
        ...prevGroups,
        { name: groupName, tab_indices: [newTabIndex] },
      ];
      setExpandedGroups((prev) => new Set([...prev, updated.length - 1]));
      setGroupCount(updated.length);
      return updated;
    });
  }

  /** 逐标签收藏到待学习暂存区 */
  async function handleCollectToLearning(
    tabIndex: number,
    type: "article" | "tool",
    e?: React.MouseEvent
  ) {
    if (e) e.stopPropagation();
    const tab = allTabs[tabIndex];
    if (!tab?.id || !tab.url) return;
    setEnriching(tabIndex);
    try {
      const content = await extractPageContent(tab.id);
      await learningApi.create(tab.url, tab.title || tab.url, type, content);
      setEnrichMsg("✅ 已保存到暂存区，AI 后台生成中");
      if (enrichMsgTimer.current) clearTimeout(enrichMsgTimer.current);
      enrichMsgTimer.current = setTimeout(() => setEnrichMsg(""), 3000);
    } catch (err) {
      setTabError(err instanceof Error ? err.message : "收藏失败");
    } finally {
      setEnriching(null);
    }
  }

  function toggleGroupExpand(groupIndex: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupIndex) ? next.delete(groupIndex) : next.add(groupIndex);
      return next;
    });
  }

  async function activateTab(tabIndex: number) {
    const tab = allTabs[tabIndex];
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  }

  async function handleCloseTab(tabId: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    try {
      await chrome.tabs.remove(tabId);
      removeTabFromState(tabId);
    } catch (err) {
      setTabError(err instanceof Error ? err.message : "关闭失败");
    }
  }

  async function handleCloseGroup(group: TabGroup) {
    const ids = group.tab_indices
      .map((i) => allTabs[i]?.id)
      .filter((id): id is number => id != null);
    for (const id of ids) {
      try {
        await chrome.tabs.remove(id);
      } catch {
        // 静默失败
      }
    }
    removeGroupFromState(group);
  }

  // ============ 实时标签事件监听（仅当前窗口）============
  // 与 Web tabs 页面的 onTabEvent 逻辑对齐，但 popup 直接用 chrome.tabs.* 事件
  useEffect(() => {
    if (viewMode !== "tabs") return;

    const onCreated = (tab: chrome.tabs.Tab) => {
      if (!loadedRef.current) return;
      if (
        currentWindowIdRef.current != null &&
        tab.windowId !== currentWindowIdRef.current
      )
        return;
      if (!isHttpTab(tab.url)) return;
      if (tabsRef.current.some((t) => t.id === tab.id)) return;
      const newTabIndex = tabsRef.current.length;
      setAllTabs((prev) => [...prev, tab]);
      assignNewTab(tab, newTabIndex);
    };

    const onRemoved = (tabId: number) => {
      if (!loadedRef.current) return;
      removeTabFromState(tabId);
    };

    const onUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (!loadedRef.current) return;
      if (
        currentWindowIdRef.current != null &&
        tab.windowId !== currentWindowIdRef.current
      )
        return;

      const existingIndex = tabsRef.current.findIndex((t) => t.id === tabId);
      const httpNow = isHttpTab(tab.url);

      if (existingIndex === -1) {
        if (httpNow && !tabsRef.current.some((t) => t.id === tabId)) {
          const newTabIndex = tabsRef.current.length;
          setAllTabs((prev) => [...prev, tab]);
          assignNewTab(tab, newTabIndex);
        }
        return;
      }

      const oldTab = tabsRef.current[existingIndex];
      const urlChanged = !!changeInfo.url && changeInfo.url !== oldTab.url;

      if (!httpNow) {
        removeTabFromState(tabId);
        return;
      }

      if (urlChanged) {
        // URL 变化：先从旧组移除，更新标签信息，再用新 URL 重新分组
        setTabGroups((prevGroups) =>
          prevGroups
            .map((g) => ({
              ...g,
              tab_indices: g.tab_indices.filter((ti) => ti !== existingIndex),
            }))
            .filter((g) => g.tab_indices.length > 0)
        );
        setAllTabs((prev) => prev.map((t) => (t.id === tabId ? tab : t)));
        assignNewTab(tab, existingIndex);
      } else if (changeInfo.title || changeInfo.favIconUrl) {
        setAllTabs((prev) => prev.map((t) => (t.id === tabId ? tab : t)));
      }
    };

    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      chrome.tabs.onCreated.removeListener(onCreated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [viewMode]);

  // ============ 跳转 ============
  async function openSettings() {
    try {
      await chrome.runtime.openOptionsPage();
    } catch (err) {
      console.error("[FlowShelf] openOptionsPage failed:", err);
    }
    window.close();
  }

  async function openWebPage(path: string) {
    try {
      const base = (await getWebBase()).replace(/\/$/, "");
      const targetUrl = base + path;
      const tabs = await chrome.tabs.query({ url: `${base}/*` });
      if (tabs.length > 0 && tabs[0].id) {
        await chrome.tabs.update(tabs[0].id, { url: targetUrl, active: true });
        if (tabs[0].windowId != null) {
          await chrome.windows.update(tabs[0].windowId, { focused: true });
        }
      } else {
        await chrome.tabs.create({ url: targetUrl });
      }
    } catch (err) {
      console.error("[FlowShelf] openWebPage failed:", err);
    }
    window.close();
  }

  function domainOf(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  // ============ 渲染 ============
  function renderHeader() {
    return (
      <div className="fs-header">
        <div className="fs-logo">
          <span className="fs-logo-icon">🧩</span>
          <span className="fs-logo-text">FlowShelf</span>
        </div>
        <div className="fs-header-actions">
          <button
            className="fs-nav-btn"
            onClick={() => openWebPage("/cards")}
            title="打开卡片库"
          >
            📚
          </button>
          <button
            className="fs-nav-btn"
            onClick={() => openWebPage("/toolbox")}
            title="打开工具箱"
          >
            🛠️
          </button>
          <button
            className="fs-nav-btn"
            onClick={() => openWebPage("/tabs")}
            title="打开 Tab 管理台"
          >
            🗂️
          </button>
          <button className="fs-icon-btn" onClick={openSettings} title="设置">
            ⚙️
          </button>
        </div>
      </div>
    );
  }

  function renderViewTabs() {
    return (
      <div className="fs-view-tabs">
        <button
          className={`fs-view-tab ${viewMode === "collect" ? "active" : ""}`}
          onClick={() => setViewMode("collect")}
        >
          收藏
        </button>
        <button
          className={`fs-view-tab ${viewMode === "tabs" ? "active" : ""}`}
          onClick={() => setViewMode("tabs")}
        >
          标签页
        </button>
      </div>
    );
  }

  function renderMenu() {
    const cardBusy = savingType === "card";
    const toolBusy = savingType === "tool";
    return (
      <div className="fs-menu">
        {renderViewTabs()}

        <div className="fs-url-preview">
          <div className="fs-url-title">{tabTitle || "无标题"}</div>
          <div className="fs-url-domain">{domainOf(tabUrl)}</div>
        </div>

        <button
          className="fs-menu-btn"
          onClick={() => handleCollect("card")}
          disabled={savingType !== null}
        >
          <span className="fs-menu-icon">📄</span>
          <span className="fs-menu-text">
            <span className="fs-menu-title">
              {cardBusy ? "⏳ 处理中..." : "收入知识卡片库"}
            </span>
            <span className="fs-menu-desc">文章 / 教程 / 博客</span>
          </span>
        </button>

        <button
          className="fs-menu-btn"
          onClick={() => handleCollect("tool")}
          disabled={savingType !== null}
        >
          <span className="fs-menu-icon">🔧</span>
          <span className="fs-menu-text">
            <span className="fs-menu-title">
              {toolBusy ? "⏳ 处理中..." : "放入工具箱"}
            </span>
            <span className="fs-menu-desc">在线工具 / 常用网站</span>
          </span>
        </button>

        <button className="fs-menu-btn" onClick={openSettings}>
          <span className="fs-menu-icon">⚙️</span>
          <span className="fs-menu-text">
            <span className="fs-menu-title">设置</span>
            <span className="fs-menu-desc">配置 API 与 Web 应用地址</span>
          </span>
        </button>

        {error && <p className="fs-menu-error">{error}</p>}

        <p className="fs-hint">
          💡 收藏后进入暂存区，AI 在后台生成摘要和标签
        </p>
      </div>
    );
  }

  function renderTabView() {
    const totalTabs = allTabs.length;
    return (
      <div>
        {renderViewTabs()}

        <div className="fs-tab-stats">
          <span>
            📊 当前窗口 <strong>{totalTabs}</strong> 个标签 · AI 已分为{" "}
            <strong>{groupCount}</strong> 组
          </span>
          <button
            className="fs-tab-refresh"
            onClick={fetchAndGroupTabs}
            title="重新归组"
          >
            🔄
          </button>
        </div>

        {enrichMsg && (
          <div
            style={{
              padding: "8px 12px",
              background: "#ecfdf5",
              color: "#065f46",
              fontSize: 12,
              borderRadius: 6,
              margin: "4px 12px",
            }}
          >
            {enrichMsg}
          </div>
        )}

        {tabLoading && (
          <div className="fs-loading">
            <div className="fs-spinner" />
            <p className="fs-loading-msg">AI 正在归组标签页...</p>
          </div>
        )}

        {!tabLoading && tabError && (
          <div className="fs-error">
            <p className="fs-error-msg">{tabError}</p>
            <button
              className="fs-btn fs-btn-primary"
              onClick={fetchAndGroupTabs}
              style={{ marginTop: 8, minWidth: 80 }}
            >
              重试
            </button>
          </div>
        )}

        {!tabLoading && !tabError && tabGroups.length === 0 && (
          <div className="fs-tab-empty">
            <div className="fs-tab-empty-icon">📭</div>
            <p className="fs-tab-empty-msg">暂无可归组的标签页</p>
          </div>
        )}

        {!tabLoading && !tabError && tabGroups.length > 0 && (
          <div className="fs-tab-groups">
            {tabGroups.map((group, gi) => {
              const expanded = expandedGroups.has(gi);
              return (
                <div key={gi} className="fs-tab-group">
                  <div
                    className="fs-tab-group-header"
                    onClick={() => toggleGroupExpand(gi)}
                  >
                    <div className="fs-tab-group-name">
                      <span
                        className={`fs-tab-group-chevron ${expanded ? "open" : ""}`}
                      >
                        ▶
                      </span>
                      <span>{group.name}</span>
                      <span className="fs-tab-group-count">
                        {group.tab_indices.length}
                      </span>
                    </div>
                  </div>
                  {expanded && (
                    <>
                      <div className="fs-tab-group-body">
                        {group.tab_indices.map((ti) => {
                          const tab = allTabs[ti];
                          if (!tab) return null;
                          const isEnriching = enriching === ti;
                          return (
                            <div
                              key={ti}
                              className="fs-tab-group-item"
                              onClick={() => activateTab(ti)}
                              title={tab.title || tab.url}
                            >
                              <span className="fs-tab-group-item-icon">🌐</span>
                              <span className="fs-tab-group-item-title">
                                {tab.title || tab.url}
                              </span>
                              <button
                                className="fs-tab-group-item-collect"
                                onClick={(e) =>
                                  handleCollectToLearning(ti, "article", e)
                                }
                                disabled={isEnriching}
                                title="收藏为知识卡片"
                              >
                                📄
                              </button>
                              <button
                                className="fs-tab-group-item-collect"
                                onClick={(e) =>
                                  handleCollectToLearning(ti, "tool", e)
                                }
                                disabled={isEnriching}
                                title="收藏为工具"
                              >
                                🔧
                              </button>
                              <button
                                className="fs-tab-group-item-close"
                                onClick={(e) => handleCloseTab(tab.id!, e)}
                                title="关闭此标签"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="fs-tab-group-actions">
                        <button
                          className="fs-tab-group-btn"
                          onClick={() => handleCloseGroup(group)}
                        >
                          🗑 整组关闭
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #f3f4f6" }}>
          <button
            className="fs-btn fs-btn-outline"
            onClick={() => openWebPage("/tabs")}
            style={{ width: "100%" }}
          >
            🗂️ 在 Web 应用中管理所有窗口标签
          </button>
        </div>
      </div>
    );
  }

  // ============ 主渲染 ============
  return (
    <div className="fs-popup">
      {renderHeader()}
      <div className="fs-content">
        {viewMode === "tabs" && renderTabView()}

        {viewMode === "collect" && (
          <>
            {phase === "loading" && (
              <div className="fs-loading">
                <div className="fs-spinner" />
                <p className="fs-loading-msg">加载中...</p>
              </div>
            )}

            {phase === "ready" && renderMenu()}

            {phase === "success" && renderMenu()}

            {phase === "error" && (
              <div className="fs-error">
                <div className="fs-error-icon">⚠️</div>
                <p className="fs-error-msg">{error}</p>
                <div className="fs-error-actions">
                  <button className="fs-btn fs-btn-outline" onClick={openSettings}>
                    设置
                  </button>
                  <button
                    className="fs-btn fs-btn-primary"
                    onClick={() => setPhase("ready")}
                  >
                    重试
                  </button>
                </div>
              </div>
            )}

            {phase === "invalid-page" && (
              <div className="fs-error">
                <div className="fs-error-icon">🚫</div>
                <p className="fs-error-msg">当前页面无法收藏</p>
                <p className="fs-error-sub">FlowShelf 仅支持 http/https 页面。</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<Popup />);
}
