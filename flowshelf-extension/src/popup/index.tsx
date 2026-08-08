import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  classifyApi,
  learningApi,
  tabsApi,
  getApiBase,
  setApiBase,
  getWebBase,
  setWebBase,
  DEFAULT_API_BASE,
  DEFAULT_WEB_BASE,
} from "@/lib/api";
import { extractPageContent } from "@/lib/content-extractor";
import type { TabInfo, LearningItem } from "@/lib/types";
import "./popup.css";

console.log("[FlowShelf] Popup script loaded");

type Phase =
  | "loading"
  | "ready"
  | "saving"
  | "success"
  | "error"
  | "settings"
  | "invalid-page";

type ViewMode = "collect" | "tabs";

type CollectType = "card" | "tool";

function classifyToCollectType(type: string): CollectType {
  return type === "tool" ? "tool" : "card";
}

function isCollectible(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export default function Popup() {
  const [viewMode, setViewMode] = useState<ViewMode>("collect");
  const [phase, setPhase] = useState<Phase>("loading");
  const [tabInfo, setTabInfo] = useState<TabInfo | null>(null);
  const [collectType, setCollectType] = useState<CollectType>("card");
  const [aiSuggestedType, setAiSuggestedType] = useState<CollectType>("card");
  const [pageContent, setPageContent] = useState("");
  const [error, setError] = useState("");
  const [savedItem, setSavedItem] = useState<LearningItem | null>(null);

  const [settingsUrl, setSettingsUrl] = useState(DEFAULT_API_BASE);
  const [settingsWebUrl, setSettingsWebUrl] = useState(DEFAULT_WEB_BASE);
  const [settingsMsg, setSettingsMsg] = useState("");

  // Tab 视图状态
  const [allTabs, setAllTabs] = useState<chrome.tabs.Tab[]>([]);
  const [tabGroups, setTabGroups] = useState<import("@/lib/types").TabGroup[]>([]);
  const [groupCount, setGroupCount] = useState(0);
  const [tabLoading, setTabLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [tabError, setTabError] = useState("");

  // ============ 初始化：获取当前 Tab + 快速分类 ============
  useEffect(() => {
    if (viewMode === "collect") {
      initQuickCollect();
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === "tabs") {
      fetchAndGroupTabs();
    }
  }, [viewMode]);

  async function initQuickCollect() {
    setPhase("loading");
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.url || !isCollectible(tab.url)) {
        setPhase("invalid-page");
        return;
      }
      setTabInfo({ url: tab.url, title: tab.title || "" });

      // 并行：提取正文 + AI 分类（分类很快，正文提取稍慢）
      const contentPromise =
        tab.id != null ? extractPageContent(tab.id) : Promise.resolve("");
      const classifyPromise = classifyApi.classify(tab.url, tab.title);

      const [content, classifyResult] = await Promise.all([
        contentPromise,
        classifyPromise,
      ]);
      setPageContent(content);

      const suggestedType = classifyToCollectType(classifyResult.type);
      setAiSuggestedType(suggestedType);
      setCollectType(suggestedType);

      setPhase("ready");
    } catch (err) {
      console.error("[FlowShelf] initQuickCollect error:", err);
      if (err instanceof TypeError) {
        setError("无法连接到后端服务，请检查 API 地址设置。");
      } else {
        setError(err instanceof Error ? err.message : "未知错误");
      }
      setPhase("error");
    }
  }

  // ============ 快速保存（方案 C：先保存后生成） ============

  async function handleQuickSave() {
    if (!tabInfo) return;
    setPhase("saving");
    setError("");
    try {
      const itemType = collectType === "card" ? "article" : "tool";
      const item = await learningApi.create(
        tabInfo.url,
        tabInfo.title || tabInfo.url,
        itemType as "article" | "tool",
        pageContent
      );
      setSavedItem(item);
      setPhase("success");
    } catch (err) {
      console.error("[FlowShelf] Quick save error:", err);
      setError(err instanceof Error ? err.message : "保存失败");
      setPhase("error");
    }
  }

  // ============ Tab 管理 ============

  async function fetchAndGroupTabs() {
    setTabLoading(true);
    setTabError("");
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      setAllTabs(tabs);

      const tabInputs = tabs.filter(
        (t) =>
          t.url && (t.url.startsWith("http") || t.url.startsWith("https"))
      ).map((t) => ({
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
        setTabGroups([
          { name: "全部标签", tab_indices: tabInputs.map((_, i) => i) },
        ]);
        setGroupCount(1);
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
    const tabs = allTabs.filter(
      (t) => t.url && (t.url.startsWith("http") || t.url.startsWith("https"))
    );
    const tab = tabs[tabIndex];
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  }

  async function closeTab(tabIndex: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const tabs = allTabs.filter(
      (t) => t.url && (t.url.startsWith("http") || t.url.startsWith("https"))
    );
    const tab = tabs[tabIndex];
    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
      fetchAndGroupTabs();
    }
  }

  async function closeGroup(group: import("@/lib/types").TabGroup) {
    const tabs = allTabs.filter(
      (t) => t.url && (t.url.startsWith("http") || t.url.startsWith("https"))
    );
    const ids = group.tab_indices
      .map((i) => tabs[i]?.id)
      .filter((id): id is number => id != null);
    if (ids.length > 0) {
      await chrome.tabs.remove(ids);
      fetchAndGroupTabs();
    }
  }

  // ============ 跳转 ============

  async function openWebPage(path: string) {
    try {
      const base = await getWebBase();
      const webBase = base.replace(/\/$/, "");
      const targetUrl = webBase + path;

      // 查找已打开的 Web 应用标签页，有则复用导航，无则新建
      const tabs = await chrome.tabs.query({ url: `${webBase}/*` });
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
  }

  // ============ 设置 ============

  async function openSettings() {
    const currentBase = await getApiBase();
    const currentWebBase = await getWebBase();
    setSettingsUrl(currentBase);
    setSettingsWebUrl(currentWebBase);
    setSettingsMsg("");
    setPhase("settings");
  }

  async function handleSaveSettings() {
    const apiUrl = settingsUrl.trim().replace(/\/$/, "");
    const webUrl = settingsWebUrl.trim().replace(/\/$/, "");
    await setApiBase(apiUrl);
    await setWebBase(webUrl);
    setSettingsMsg("✅ 设置已保存");
    setTimeout(() => {
      setPhase("loading");
      initQuickCollect();
    }, 500);
  }

  function handleRetry() {
    setError("");
    setPhase("loading");
    initQuickCollect();
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
          {phase !== "settings" && (
            <>
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
              <button
                className="fs-icon-btn"
                onClick={openSettings}
                title="设置"
              >
                ⚙️
              </button>
            </>
          )}
          {phase === "settings" && (
            <button
              className="fs-icon-btn"
              onClick={() => setPhase("loading")}
              title="返回"
            >
              ←
            </button>
          )}
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

  function renderQuickSaveForm() {
    return (
      <div>
        {renderViewTabs()}

        {aiSuggestedType === collectType && (
          <div className="fs-ai-hint fs-ai-hint-ok">
            ✨ AI 已识别为{collectType === "card" ? "文章" : "工具"}
          </div>
        )}
        {aiSuggestedType !== collectType && (
          <div className="fs-ai-hint">
            💡 AI 建议保存为
            {aiSuggestedType === "card" ? "知识卡片" : "工具"}，
            已按你的选择调整
          </div>
        )}

        <div className="fs-url-preview">
          <div className="fs-url-title">
            {tabInfo?.title || "无标题"}
          </div>
          <div className="fs-url-domain">
            {tabInfo
              ? new URL(tabInfo.url).hostname
              : ""}
          </div>
        </div>

        <div className="fs-type-toggle">
          <button
            className={`fs-type-btn ${collectType === "card" ? "active" : ""}`}
            onClick={() => setCollectType("card")}
          >
            📄 知识卡片
          </button>
          <button
            className={`fs-type-btn ${collectType === "tool" ? "active" : ""}`}
            onClick={() => setCollectType("tool")}
          >
            🔧 工具箱
          </button>
        </div>

        <div className="fs-footer">
          <button
            className="fs-btn fs-btn-primary"
            onClick={handleQuickSave}
            disabled={phase === "saving"}
            style={{ flex: 1 }}
          >
            {collectType === "card" ? "📥 加入待学习" : "🔧 存入工具箱"}
          </button>
        </div>

        <div className="fs-hint">
          💡 快速收藏，AI 会在后台为你生成摘要和标签。
          可在 Web 应用中查看和编辑。
        </div>
      </div>
    );
  }

  function renderTabView() {
    const totalTabs = allTabs.filter(
      (t) => t.url && (t.url.startsWith("http") || t.url.startsWith("https"))
    ).length;

    return (
      <div>
        {renderViewTabs()}

        <div className="fs-tab-stats">
          <span>
            📊 当前 <strong>{totalTabs}</strong> 个标签 · AI 已分为{" "}
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
              const tabs = allTabs.filter(
                (t) =>
                  t.url &&
                  (t.url.startsWith("http") || t.url.startsWith("https"))
              );
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
                          const tab = tabs[ti];
                          if (!tab) return null;
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
                                className="fs-tab-group-item-close"
                                onClick={(e) => closeTab(ti, e)}
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
                          onClick={() => closeGroup(group)}
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
                <p className="fs-loading-msg">AI 正在识别页面类型...</p>
              </div>
            )}

            {phase === "ready" && renderQuickSaveForm()}

            {phase === "saving" && (
              <div className="fs-loading">
                <div className="fs-spinner" />
                <p className="fs-loading-msg">正在保存...</p>
              </div>
            )}

            {phase === "success" && savedItem && (
              <div className="fs-success">
                <div className="fs-success-icon">✅</div>
                <p className="fs-success-msg">
                  已加入
                  {savedItem.item_type === "card"
                    ? "待学习队列"
                    : "工具箱"}
                  ！
                </p>
                <p className="fs-success-sub">
                  {savedItem.title.length > 40
                    ? savedItem.title.slice(0, 40) + "..."
                    : savedItem.title}
                </p>
                <p className="fs-success-enrich">
                  {savedItem.is_ready
                    ? "✨ AI 内容已生成"
                    : "⏳ AI 正在后台生成摘要和标签..."}
                </p>
                <div className="fs-success-actions">
                  <button
                    className="fs-btn fs-btn-outline"
                    onClick={() =>
                      openWebPage(
                        savedItem.item_type === "card"
                          ? "/cards"
                          : "/toolbox"
                      )
                    }
                  >
                    查看
                    {savedItem.item_type === "card"
                      ? "卡片库"
                      : "工具箱"}
                  </button>
                  <button
                    className="fs-btn fs-btn-primary"
                    onClick={() => window.close()}
                  >
                    完成
                  </button>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="fs-error">
                <div className="fs-error-icon">⚠️</div>
                <p className="fs-error-msg">{error}</p>
                <div className="fs-error-actions">
                  <button
                    className="fs-btn fs-btn-outline"
                    onClick={openSettings}
                  >
                    设置
                  </button>
                  <button
                    className="fs-btn fs-btn-primary"
                    onClick={handleRetry}
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
                <p className="fs-error-sub">
                  FlowShelf 仅支持 http/https 页面。
                </p>
              </div>
            )}

            {phase === "settings" && (
              <div className="fs-settings">
                <h3 className="fs-settings-title">设置</h3>
                <p className="fs-settings-desc">
                  配置 FlowShelf 后端服务与 Web 应用地址
                </p>
                <div className="fs-settings-field">
                  <label className="fs-settings-label">后端 API 地址</label>
                  <input
                    type="text"
                    className="fs-input"
                    value={settingsUrl}
                    onChange={(e) => setSettingsUrl(e.target.value)}
                    placeholder="http://localhost:8000"
                  />
                </div>
                <div className="fs-settings-field">
                  <label className="fs-settings-label">Web 应用地址</label>
                  <input
                    type="text"
                    className="fs-input"
                    value={settingsWebUrl}
                    onChange={(e) => setSettingsWebUrl(e.target.value)}
                    placeholder="http://localhost:3000"
                  />
                </div>
                <button
                  className="fs-btn fs-btn-primary"
                  onClick={handleSaveSettings}
                  style={{ marginTop: 4, width: "100%" }}
                >
                  保存并重连
                </button>
                {settingsMsg && (
                  <p className="fs-settings-msg">{settingsMsg}</p>
                )}
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
