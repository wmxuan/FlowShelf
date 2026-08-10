#!/bin/bash
# FlowShelf macOS 安装脚本
# 注册 Native Messaging Host + 设置后端二进制可执行权限

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.flowshelf.backend"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_FILE="$MANIFEST_DIR/$HOST_NAME.json"
BACKEND_BIN="$SCRIPT_DIR/flowshelf-backend"

# 由 manifest.json 中的 key 决定的扩展 ID
EXTENSION_ID="dkkdefbjgcoepbdjdddaidllmkhpnadn"

echo "🔧 FlowShelf macOS 安装"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 确保后端二进制可执行
if [ ! -f "$BACKEND_BIN" ]; then
  echo "❌ 找不到后端二进制: $BACKEND_BIN"
  echo "   请确认 flowshelf-backend 位于脚本同级目录"
  exit 1
fi
chmod +x "$BACKEND_BIN"
echo "✅ 后端二进制已设置可执行权限"

# 1.5 清除 macOS Gatekeeper 隔离标记（从网络下载的文件默认带 com.apple.quarantine）
xattr -cr "$BACKEND_BIN" 2>/dev/null || true
echo "✅ 已清除 Gatekeeper 隔离标记"

# 2. 注册 Native Messaging Host
mkdir -p "$MANIFEST_DIR"
cat > "$MANIFEST_FILE" << EOF
{
  "name": "$HOST_NAME",
  "description": "FlowShelf Backend Server",
  "path": "$BACKEND_BIN",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
echo "✅ Native Messaging Host 已注册"
echo "   位置: $MANIFEST_FILE"

# 3. 创建数据目录
mkdir -p "$HOME/.flowshelf"
echo "✅ 数据目录已创建: ~/.flowshelf"

# 4. 提示加载扩展
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 接下来请手动完成以下步骤："
echo ""
echo "1. 打开 Chrome 浏览器"
echo "2. 访问 chrome://extensions"
echo "3. 开启右上角「开发者模式」"
echo "4. 点击「加载已解压的扩展程序」"
echo "5. 选择目录: $SCRIPT_DIR/flowshelf-extension"
echo ""
echo "扩展加载后，FlowShelf 后端会自动启动！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
