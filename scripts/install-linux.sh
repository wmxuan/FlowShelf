#!/bin/bash
# FlowShelf Linux 安装脚本
# 注册 Native Messaging Host（支持 Google Chrome + Chromium）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.flowshelf.backend"
BACKEND_BIN="$SCRIPT_DIR/flowshelf-backend"

# TODO: 替换为实际的扩展 ID（由 manifest.json 中的 key 决定）
# 当前 key 对应的扩展 ID 为 3aa3451962e4f139333083bbca7fd03d
EXTENSION_ID="3aa3451962e4f139333083bbca7fd03d"

echo "🔧 FlowShelf Linux 安装"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 确保后端二进制可执行
if [ ! -f "$BACKEND_BIN" ]; then
  echo "❌ 找不到后端二进制: $BACKEND_BIN"
  echo "   请确认 flowshelf-backend 位于脚本同级目录"
  exit 1
fi
chmod +x "$BACKEND_BIN"
echo "✅ 后端二进制已设置可执行权限"

# 2. 注册 Native Messaging Host（Google Chrome）
CHROME_MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
mkdir -p "$CHROME_MANIFEST_DIR"
cat > "$CHROME_MANIFEST_DIR/$HOST_NAME.json" << EOF
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
echo "✅ Native Messaging Host 已注册 (Google Chrome)"
echo "   位置: $CHROME_MANIFEST_DIR/$HOST_NAME.json"

# 3. 同时注册到 Chromium
CHROMIUM_MANIFEST_DIR="$HOME/.config/chromium/NativeMessagingHosts"
mkdir -p "$CHROMIUM_MANIFEST_DIR"
cat > "$CHROMIUM_MANIFEST_DIR/$HOST_NAME.json" << EOF
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
echo "✅ Native Messaging Host 已注册 (Chromium)"
echo "   位置: $CHROMIUM_MANIFEST_DIR/$HOST_NAME.json"

# 4. 创建数据目录
mkdir -p "$HOME/.flowshelf"
echo "✅ 数据目录已创建: ~/.flowshelf"

# 5. 提示加载扩展
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 接下来请手动完成以下步骤："
echo ""
echo "1. 打开 Chrome / Chromium 浏览器"
echo "2. 访问 chrome://extensions"
echo "3. 开启右上角「开发者模式」"
echo "4. 点击「加载已解压的扩展程序」"
echo "5. 选择目录: $SCRIPT_DIR/flowshelf-extension"
echo ""
echo "扩展加载后，FlowShelf 后端会自动启动！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
