import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  getApiBase,
  setApiBase,
  getWebBase,
  setWebBase,
  DEFAULT_API_BASE,
  DEFAULT_WEB_BASE,
} from "@/lib/api";
import "../popup/popup.css";

/**
 * FlowShelf 扩展设置页（options_ui，在新标签页打开）。
 * 复用 popup.css 的 fs-* 类，外层用 inline style 全页居中。
 */
export default function OptionsPage() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_BASE);
  const [webUrl, setWebUrl] = useState(DEFAULT_WEB_BASE);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setApiUrl(await getApiBase());
      setWebUrl(await getWebBase());
      setLoaded(true);
    })();
  }, []);

  async function handleSave() {
    const api = apiUrl.trim().replace(/\/$/, "");
    const web = webUrl.trim().replace(/\/$/, "");
    await setApiBase(api);
    await setWebBase(web);
    setApiUrl(api);
    setWebUrl(web);
    setMsg("✅ 设置已保存");
  }

  if (!loaded) {
    return (
      <div style={{ textAlign: "center", color: "#6b7280" }}>加载中...</div>
    );
  }

  return (
    <div
      className="fs-popup"
      style={{
        width: 420,
        height: "auto",
        minHeight: 360,
        maxHeight: "none",
        borderRadius: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
      }}
    >
      <div className="fs-header">
        <div className="fs-logo">
          <span className="fs-logo-icon">🧩</span>
          <span className="fs-logo-text">FlowShelf 设置</span>
        </div>
      </div>
      <div className="fs-content">
        <div className="fs-settings">
          <p className="fs-settings-desc">
            配置 FlowShelf 后端服务与 Web 应用地址
          </p>
          <div className="fs-settings-field">
            <label className="fs-settings-label">后端 API 地址</label>
            <input
              type="text"
              className="fs-input"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:8000"
            />
          </div>
          <div className="fs-settings-field">
            <label className="fs-settings-label">Web 应用地址</label>
            <input
              type="text"
              className="fs-input"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              placeholder="http://localhost:3000"
            />
          </div>
          <button
            className="fs-btn fs-btn-primary"
            onClick={handleSave}
            style={{ marginTop: 4, width: "100%" }}
          >
            保存
          </button>
          {msg && <p className="fs-settings-msg">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<OptionsPage />);
}
