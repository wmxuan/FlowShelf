import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  classifyApi,
  cardsApi,
  toolsApi,
  getApiBase,
  setApiBase,
  getWebBase,
  setWebBase,
  DEFAULT_API_BASE,
  DEFAULT_WEB_BASE,
} from "@/lib/api";
import { extractPageContent } from "@/lib/content-extractor";
import type { TabInfo, CardPreview, ToolPreview, PageType } from "@/lib/types";
import "./popup.css";

// ============ 调试日志 ============
console.log("[FlowShelf] Popup script loaded");
console.log("[FlowShelf] Default API base:", DEFAULT_API_BASE);

type Phase =
  | "loading"
  | "preview"
  | "switching"
  | "saving"
  | "success"
  | "error"
  | "settings"
  | "invalid-page";

type CollectType = "card" | "tool";

function classifyToCollectType(type: PageType): CollectType {
  return type === "tool" ? "tool" : "card";
}

function isCollectible(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export default function Popup() {
  // ---- 核心状态 ----
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadingMsg, setLoadingMsg] = useState("正在获取页面信息...");

  const [tabInfo, setTabInfo] = useState<TabInfo | null>(null);
  const [collectType, setCollectType] = useState<CollectType>("card");
  const [aiSuggestedType, setAiSuggestedType] = useState<CollectType>("card");

  // 预览缓存（按类型缓存，切换时避免重复生成）
  const [cardData, setCardData] = useState<CardPreview | null>(null);
  const [toolData, setToolData] = useState<ToolPreview | null>(null);

  // 浏览器端预提取的页面正文（document.body.innerText）
  // 传给后端跳过 content_extractor，规避反爬 / 重定向循环
  const [pageContent, setPageContent] = useState("");

  // 可编辑字段
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editKeyPoints, setEditKeyPoints] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // 错误 & 成功
  const [error, setError] = useState("");
  const [savedType, setSavedType] = useState<CollectType>("card");

  // 设置
  const [settingsUrl, setSettingsUrl] = useState(DEFAULT_API_BASE);
  const [settingsWebUrl, setSettingsWebUrl] = useState(DEFAULT_WEB_BASE);
  const [settingsMsg, setSettingsMsg] = useState("");

  // ============ 初始化流程：获取标签 → 分类 → 生成预览 ============
  useEffect(() => {
    initFlow();
  }, []);

  async function initFlow() {
    try {
      console.log("[FlowShelf] initFlow started");
      // Step 1: 获取当前标签页
      setLoadingMsg("正在获取页面信息...");
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      console.log("[FlowShelf] Active tab:", tab?.url, tab?.title);
      if (!tab?.url || !isCollectible(tab.url)) {
        console.log("[FlowShelf] Page not collectible:", tab?.url);
        setPhase("invalid-page");
        return;
      }
      setTabInfo({ url: tab.url, title: tab.title || "" });

      // Step 1.5: 浏览器端预提取页面正文，传给后端跳过 content_extractor
      // 规避反爬 / 重定向循环（TooManyRedirects）。提取失败返回空串，
      // 后端会降级为自行抓取，不阻断流程。
      setLoadingMsg("正在提取页面正文...");
      const content = tab.id != null ? await extractPageContent(tab.id) : "";
      console.log(
        "[FlowShelf] Extracted page content length:",
        content.length
      );
      setPageContent(content);

      // Step 2: AI 智能分流（附带正文，跳过后端抓取）
      setLoadingMsg("AI 正在识别页面类型...");
      const classifyResult = await classifyApi.classify(
        tab.url,
        tab.title,
        content
      );
      console.log("[FlowShelf] Classify result:", classifyResult);
      const suggestedType = classifyToCollectType(classifyResult.type);
      setAiSuggestedType(suggestedType);
      setCollectType(suggestedType);

      // Step 3: 生成预览
      setLoadingMsg("AI 正在生成预览内容...");
      await generatePreview(suggestedType, tab.url, content);

      console.log("[FlowShelf] Preview generated, switching to preview phase");
      setPhase("preview");
    } catch (err) {
      console.error("[FlowShelf] initFlow error:", err);
      // fetch 网络错误 → 引导用户检查后端地址
      if (err instanceof TypeError) {
        setError("无法连接到后端服务，请检查 API 地址设置。");
      } else {
        setError(err instanceof Error ? err.message : "未知错误");
      }
      setPhase("error");
    }
  }

  async function generatePreview(
    type: CollectType,
    url: string,
    content: string
  ) {
    if (type === "card") {
      if (cardData) {
        loadCardEdits(cardData);
        return;
      }
      const preview = await cardsApi.generate(url, content);
      setCardData(preview);
      loadCardEdits(preview);
    } else {
      if (toolData) {
        loadToolEdits(toolData);
        return;
      }
      const preview = await toolsApi.generate(url, content);
      setToolData(preview);
      loadToolEdits(preview);
    }
  }

  function loadCardEdits(preview: CardPreview) {
    setEditTitle(preview.title);
    setEditSummary(preview.summary);
    setEditKeyPoints(preview.key_points.join("\n"));
    setEditDescription("");
  }

  function loadToolEdits(preview: ToolPreview) {
    setEditTitle(preview.title);
    setEditDescription(preview.description);
    setEditSummary("");
    setEditKeyPoints("");
  }

  // ============ 类型切换（用户修正 AI 分流结果）============
  async function handleTypeSwitch(newType: CollectType) {
    if (newType === collectType || !tabInfo) return;
    setCollectType(newType);

    const hasCached = newType === "card" ? !!cardData : !!toolData;
    if (!hasCached) {
      setPhase("switching");
    }
    try {
      await generatePreview(newType, tabInfo.url, pageContent);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setPhase("error");
    }
  }

  // ============ 保存 ============
  async function handleSave() {
    if (!tabInfo) return;
    setPhase("saving");
    try {
      if (collectType === "card" && cardData) {
        const keyPoints = editKeyPoints
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        await cardsApi.create(
          tabInfo.url,
          {
            title: editTitle.trim() || cardData.title,
            summary: editSummary.trim() || cardData.summary,
            key_points: keyPoints,
            tags: cardData.tags,
          },
          pageContent
        );
        setSavedType("card");
      } else if (collectType === "tool" && toolData) {
        await toolsApi.create(
          tabInfo.url,
          editTitle.trim() || toolData.title,
          editDescription.trim() || toolData.description,
          toolData.tags,
          pageContent
        );
        setSavedType("tool");
      }
      setPhase("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setPhase("error");
    }
  }

  // ============ 跳转 Web 应用 ============
  async function openWebPage(path: string) {
    try {
      const base = await getWebBase();
      const url = base.replace(/\/$/, "") + path;
      await chrome.tabs.create({ url });
    } catch (err) {
      console.error("[FlowShelf] openWebPage failed:", err);
    }
  }

  // ============ 设置面板 ============
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
    setSettingsMsg("✅ 设置已保存，正在重新连接...");
    setCardData(null);
    setToolData(null);
    setPageContent("");
    setTimeout(() => {
      setPhase("loading");
      setLoadingMsg("正在获取页面信息...");
      initFlow();
    }, 500);
  }

  // ============ 重试 ============
  function handleRetry() {
    setError("");
    setCardData(null);
    setToolData(null);
    setPageContent("");
    setPhase("loading");
    setLoadingMsg("正在获取页面信息...");
    initFlow();
  }

  // ============ 渲染各阶段内容 ============

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

  function renderLoading(msg: string) {
    return (
      <div className="fs-loading">
        <div className="fs-spinner" />
        <p className="fs-loading-msg">{msg}</p>
      </div>
    );
  }

  function renderTypeToggle() {
    return (
      <div className="fs-type-toggle">
        <button
          className={`fs-type-btn ${collectType === "card" ? "active" : ""}`}
          onClick={() => handleTypeSwitch("card")}
          disabled={phase === "switching" || phase === "saving"}
        >
          📄 知识卡片
        </button>
        <button
          className={`fs-type-btn ${collectType === "tool" ? "active" : ""}`}
          onClick={() => handleTypeSwitch("tool")}
          disabled={phase === "switching" || phase === "saving"}
        >
          🔧 工具箱
        </button>
      </div>
    );
  }

  function renderTags(tags: string[]) {
    return (
      <div className="fs-field">
        <label className="fs-field-label">🏷️ 标签（AI 生成）</label>
        <div className="fs-tags">
          {tags.length > 0 ? (
            tags.map((tag, i) => (
              <span key={i} className="fs-tag">
                {tag}
              </span>
            ))
          ) : (
            <span className="fs-tag-empty">暂无标签</span>
          )}
        </div>
      </div>
    );
  }

  function renderCardPreview() {
    return (
      <div className="fs-preview">
        {aiSuggestedType !== collectType && (
          <div className="fs-ai-hint">
            💡 AI 建议保存为
            {aiSuggestedType === "card" ? "知识卡片" : "工具"}，已按你的选择调整
          </div>
        )}
        {aiSuggestedType === collectType && (
          <div className="fs-ai-hint fs-ai-hint-ok">
            ✨ AI 已识别为{collectType === "card" ? "文章" : "工具"}
          </div>
        )}

        <div className="fs-field">
          <label className="fs-field-label">📌 标题</label>
          <input
            type="text"
            className="fs-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            disabled={phase === "saving"}
          />
        </div>

        <div className="fs-field">
          <label className="fs-field-label">📝 摘要</label>
          <textarea
            className="fs-textarea"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            rows={4}
            disabled={phase === "saving"}
          />
        </div>

        <div className="fs-field">
          <label className="fs-field-label">💡 关键观点（每行一条）</label>
          <textarea
            className="fs-textarea"
            value={editKeyPoints}
            onChange={(e) => setEditKeyPoints(e.target.value)}
            rows={4}
            placeholder="每行一条观点"
            disabled={phase === "saving"}
          />
        </div>

        {cardData && renderTags(cardData.tags)}
      </div>
    );
  }

  function renderToolPreview() {
    return (
      <div className="fs-preview">
        {aiSuggestedType !== collectType && (
          <div className="fs-ai-hint">
            💡 AI 建议保存为
            {aiSuggestedType === "card" ? "知识卡片" : "工具"}，已按你的选择调整
          </div>
        )}
        {aiSuggestedType === collectType && (
          <div className="fs-ai-hint fs-ai-hint-ok">
            ✨ AI 已识别为工具
          </div>
        )}

        <div className="fs-field">
          <label className="fs-field-label">🔧 工具名称</label>
          <input
            type="text"
            className="fs-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            disabled={phase === "saving"}
          />
        </div>

        <div className="fs-field">
          <label className="fs-field-label">📝 工具描述</label>
          <textarea
            className="fs-textarea"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={3}
            placeholder="工具用途说明"
            disabled={phase === "saving"}
          />
        </div>

        {toolData && renderTags(toolData.tags)}
      </div>
    );
  }

  function renderFooter() {
    return (
      <div className="fs-footer">
        <button
          className="fs-btn fs-btn-outline"
          onClick={() => window.close()}
          disabled={phase === "saving"}
        >
          取消
        </button>
        <button
          className="fs-btn fs-btn-primary"
          onClick={handleSave}
          disabled={phase === "saving" || phase === "switching"}
        >
          {collectType === "card" ? "保存为卡片" : "保存到工具箱"}
        </button>
      </div>
    );
  }

  // ============ 主渲染 ============
  return (
    <div className="fs-popup">
      {renderHeader()}
      <div className="fs-content">
        {(phase === "loading" || phase === "switching") &&
          renderLoading(
            phase === "switching"
              ? "AI 正在生成预览内容..."
              : loadingMsg
          )}

        {phase === "preview" && (
          <>
            {renderTypeToggle()}
            {collectType === "card" ? renderCardPreview() : renderToolPreview()}
            {renderFooter()}
          </>
        )}

        {phase === "saving" && (
          <>
            {renderTypeToggle()}
            <div className="fs-loading">
              <div className="fs-spinner" />
              <p className="fs-loading-msg">正在保存...</p>
            </div>
          </>
        )}

        {phase === "success" && (
          <div className="fs-success">
            <div className="fs-success-icon">✅</div>
            <p className="fs-success-msg">
              已保存为{savedType === "card" ? "知识卡片" : "工具"}！
            </p>
            <p className="fs-success-sub">
              {tabInfo?.title && tabInfo.title.length > 40
                ? tabInfo.title.slice(0, 40) + "..."
                : tabInfo?.title}
            </p>
            <div className="fs-success-actions">
              <button
                className="fs-btn fs-btn-outline"
                onClick={() =>
                  openWebPage(savedType === "card" ? "/cards" : "/toolbox")
                }
              >
                查看{savedType === "card" ? "卡片库" : "工具箱"}
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
              <button className="fs-btn fs-btn-outline" onClick={openSettings}>
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
              FlowShelf 仅支持 http/https 页面，不支持浏览器内部页面。
            </p>
          </div>
        )}

        {phase === "settings" && (
          <div className="fs-settings">
            <h3 className="fs-settings-title">设置</h3>
            <p className="fs-settings-desc">
              配置 FlowShelf 后端服务与 Web 应用地址（含协议和端口）
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
              <label className="fs-settings-label">Web 应用地址（卡片库 / 工具箱）</label>
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
      </div>
    </div>
  );
}

// ============ 挂载 React 根节点 ============
console.log("[FlowShelf] Mounting React root...");
const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<Popup />);
  console.log("[FlowShelf] React root mounted successfully");
} else {
  console.error("[FlowShelf] Root element #root not found!");
}
