#!/bin/bash
# FlowShelf 一键启动脚本
# 用法:
#   ./start.sh          # 生产模式（后端托管前端静态文件，推荐）
#   ./start.sh dev      # 开发模式（前后端分离 + HMR，仅本机调试用）
#
# ⚠️  生产模式下，后端同时提供 API 和前端页面，无需单独启动 Next.js。

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-prod}"

echo "🚀 FlowShelf 启动中 (模式: $MODE)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 获取局域网 IP
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null \
      || ipconfig getifaddr en1 2>/dev/null \
      || ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1 \
      || echo "未知")
echo "📍 本机局域网 IP: $LAN_IP"
echo ""

if [ "$MODE" = "dev" ]; then
  # ── 开发模式：前后端分离 ──
  echo "🔧 启动后端 (端口 8000, 监听所有网卡, reload)..."
  cd "$PROJECT_ROOT/backend"
  if [ -d "venv" ]; then
    source venv/bin/activate
  fi
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
  BACKEND_PID=$!
  echo "   后端 PID: $BACKEND_PID"

  echo "🎨 启动前端 (端口 3000, HMR 热更新)..."
  cd "$PROJECT_ROOT/frontend"
  npm run dev -- --hostname 0.0.0.0 &
  FRONTEND_PID=$!
  echo "   前端 PID: $FRONTEND_PID"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ FlowShelf 已启动 (开发模式)！"
  echo ""
  echo "📱 访问地址:"
  echo "   前端:      http://localhost:3000"
  echo "   后端 API:  http://localhost:8000"
  echo "   局域网:    http://$LAN_IP:3000"
  echo ""
  echo "🔧 浏览器扩展设置:"
  echo "   API 地址: http://localhost:8000"
  echo ""
  echo "⏹  按 Ctrl+C 停止所有服务"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ 已停止"
    exit 0
  }
  trap cleanup SIGINT SIGTERM
  wait

else
  # ── 生产模式：后端托管一切 ──
  # 构建前端静态文件（如果 out/ 不存在）
  FRONTEND_OUT="$PROJECT_ROOT/frontend/out"
  if [ ! -d "$FRONTEND_OUT" ]; then
    echo "⏳ 首次构建前端静态文件..."
    cd "$PROJECT_ROOT/frontend"
    npm run build
    echo "✅ 前端构建完成"
  fi

  # 复制前端静态文件到后端目录
  BACKEND_STATIC="$PROJECT_ROOT/backend/frontend_dist"
  rm -rf "$BACKEND_STATIC"
  cp -r "$FRONTEND_OUT" "$BACKEND_STATIC"
  echo "📦 前端静态文件已复制到 backend/frontend_dist/"

  # 启动后端（同时提供 API + 前端页面）
  echo "🔧 启动后端 (端口 8972 起, 监听所有网卡)..."
  cd "$PROJECT_ROOT/backend"
  if [ -d "venv" ]; then
    source venv/bin/activate
  fi
  # 使用 entrypoint.py 找可用端口并启动
  python entrypoint.py &
  BACKEND_PID=$!
  echo "   后端 PID: $BACKEND_PID"

  # 等待后端就绪，读取端口号
  sleep 2
  SERVER_INFO="$HOME/.flowshelf/server.json"
  if [ -f "$SERVER_INFO" ]; then
    PORT=$(python3 -c "import json; print(json.load(open('$SERVER_INFO'))['port'])" 2>/dev/null || echo "8972")
  else
    PORT="8972"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ FlowShelf 已启动 (生产模式)！"
  echo ""
  echo "📱 访问地址:"
  echo "   本机:     http://localhost:$PORT"
  echo "   局域网:   http://$LAN_IP:$PORT"
  echo "   API 文档: http://localhost:$PORT/docs"
  echo ""
  echo "💡 后端同时提供 API 和前端页面，无需单独启动前端"
  echo ""
  echo "🔧 浏览器扩展设置:"
  echo "   API 地址: http://localhost:$PORT"
  echo ""
  echo "⏹  按 Ctrl+C 停止"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    kill $BACKEND_PID 2>/dev/null
    echo "✅ 已停止"
    exit 0
  }
  trap cleanup SIGINT SIGTERM
  wait
fi
