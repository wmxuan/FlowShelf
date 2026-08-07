/**
 * 浏览器端页面正文提取
 *
 * 设计目标：让扩展端在浏览器进程内直接读取已渲染页面的正文文本，
 * 随请求传给后端，后端跳过 content_extractor，规避反爬 / 重定向循环
 * （TooManyRedirects 等）。
 *
 * 实现：chrome.scripting.executeScript 注入函数到目标 tab 的主 frame，
 * 读取 document.body.innerText 并截断到 MAX_CONTENT_LENGTH。
 *
 * 这是 AGENTS.md 设计的「P0 content script 抓取正文」的正确实现路径。
 */

/** 与后端 content_extractor.MAX_CONTENT_LENGTH 保持一致 */
const MAX_CONTENT_LENGTH = 50000;

/**
 * 在页面上下文中执行的提取函数。
 *
 * 注意：此函数会被序列化后注入目标页面，不能引用外部作用域变量，
 * 所有依赖（MAX_CONTENT_LENGTH）必须以参数形式通过 args 传入。
 */
function extractBodyTextInPage(maxLength: number): string {
  // 优先 article / main 容器，退化到 body
  const container =
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.body;
  if (!container) {
    return "";
  }
  // innerText 已按可见性过滤隐藏元素，比 textContent 更贴近用户实际看到的内容
  const raw = container.innerText || "";
  // 折叠多余空白行，压缩体积
  const collapsed = raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .join("\n");
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  // 尽量在段落边界截断
  const truncated = collapsed.slice(0, maxLength);
  const lastBreak = truncated.lastIndexOf("\n");
  const cut = lastBreak > maxLength * 0.8 ? truncated.slice(0, lastBreak) : truncated;
  return cut + "\n\n[内容已截断]";
}

/**
 * 提取当前激活标签页的正文文本。
 *
 * @param tabId 目标标签页 ID
 * @returns 提取到的正文；失败时返回空字符串（后端会降级为 url+title 处理）
 */
export async function extractPageContent(tabId: number): Promise<string> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractBodyTextInPage,
      args: [MAX_CONTENT_LENGTH],
    });
    if (!results || results.length === 0) {
      return "";
    }
    const value = results[0].result;
    return typeof value === "string" ? value : "";
  } catch (err) {
    console.warn(
      "[FlowShelf] extractPageContent 失败，后端将降级为自行抓取:",
      err
    );
    return "";
  }
}
