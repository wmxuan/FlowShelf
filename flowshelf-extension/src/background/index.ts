/**
 * FlowShelf 扩展后台脚本（Service Worker）
 *
 * 职责：
 * 1. 注册右键菜单「收藏到 FlowShelf」
 * 2. 监听快捷键 Cmd+Shift+S / Ctrl+Shift+S
 * 3. 两者都触发打开 popup，由 popup 完成收藏流程
 */

const CONTEXT_MENU_ID = "flowshelf-collect";

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

export {};
