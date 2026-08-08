import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./newtab.css";

/**
 * 新标签页：纯重定向到 Web 应用 /tabs
 *
 * Chrome 不允许 chrome_url_overrides.newtab 直接指向外部 URL，
 * 因此用扩展页做跳板，立即重定向到 Web 应用。
 * Web 应用内通过 Next.js App Router 实现 SPA 路由。
 */

export default function NewTabRedirect() {
  const [error, setError] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["flowshelf_web_base"], (result) => {
      const base = (result.flowshelf_web_base || "http://localhost:3000").replace(/\/$/, "");
      // replace 避免产生历史记录（用户按"后退"不会回到空白跳板页）
      window.location.replace(`${base}/tabs`);
    });
  }, []);

  if (error) {
    return (
      <div className="nt-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <p style={{ color: "#666" }}>无法加载 FlowShelf，请检查 Web 应用是否运行。</p>
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
