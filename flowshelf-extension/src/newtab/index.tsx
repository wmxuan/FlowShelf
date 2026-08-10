import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./newtab.css";

/**
 * 新标签页：重定向到 Web 应用 /tabs
 *
 * Chrome 不允许 chrome_url_overrides.newtab 直接指向外部 URL，
 * 因此用扩展页做跳板，立即重定向到 Web 应用。
 * Web 应用内通过 Next.js App Router 实现 SPA 路由。
 *
 * 如果后端未运行（连接失败），显示友好提示而非空白页。
 */

const DEFAULT_WEB_BASE = "http://localhost:8972";

/**
 * 在 8972-8979 端口范围内探测后端，返回可用的 base URL 或 null
 */
async function detectBackend(): Promise<string | null> {
  for (let port = 8972; port <= 8979; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        return `http://localhost:${port}`;
      }
    } catch { /* not running */ }
  }
  return null;
}

export default function NewTabRedirect() {
  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");
  const [webBase, setWebBase] = useState("");

  useEffect(() => {
    (async () => {
      // 1. 先读缓存地址
      const { flowshelf_web_base } = await chrome.storage.local.get(["flowshelf_web_base"]);
      const cached = (flowshelf_web_base as string || DEFAULT_WEB_BASE).replace(/\/$/, "");

      // 2. 验证缓存地址是否可用
      let base: string | null = null;
      try {
        const res = await fetch(`${cached}/api/health`, { method: "GET", signal: AbortSignal.timeout(2000) });
        if (res.ok) base = cached;
      } catch { /* cached address unreachable */ }

      // 3. 缓存不可用 → 全端口探测
      if (!base) {
        base = await detectBackend();
      }

      if (base) {
        // 更新缓存，确保后续访问直接命中
        await chrome.storage.local.set({ flowshelf_web_base: base });
        setWebBase(base);
        setStatus("redirecting");
        window.location.replace(`${base}/tabs`);
      } else {
        setWebBase(cached);
        setStatus("error");
      }
    })();
  }, []);

  if (status === "redirecting") {
    return (
      <div className="nt-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ textAlign: "center", color: "#999" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🧩</div>
          <p>正在跳转到 FlowShelf...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="nt-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ textAlign: "center", color: "#555", maxWidth: 420, padding: "0 24px" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.8rem" }}>🧩</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#333" }}>FlowShelf 后端未运行</h2>
          <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6 }}>
            请先启动后端服务，然后刷新此页面。
          </p>
          <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "12px 16px", textAlign: "left", fontSize: 13, fontFamily: "monospace", color: "#666", marginBottom: 16 }}>
            <div style={{ marginBottom: 4 }}># 在安装目录中运行：</div>
            <div>./flowshelf-backend</div>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#888" }}>
            后端地址：<code style={{ background: "#f0f0f0", padding: "2px 6px", borderRadius: 4 }}>{webBase}</code>
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 8, padding: "8px 24px", borderRadius: 6, border: "none", background: "#4f46e5", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            刷新重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nt-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <div style={{ textAlign: "center", color: "#999" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🧩</div>
        <p>正在加载 FlowShelf...</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<NewTabRedirect />);
