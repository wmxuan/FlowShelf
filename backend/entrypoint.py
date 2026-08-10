"""
FlowShelf 后端入口点（PyInstaller 打包入口）

支持两种运行模式：
1. 直接运行：启动 HTTP 服务器（手动使用或调试）
2. Native Messaging 模式（--native-messaging）：
   作为 Chrome Native Messaging Host，通过 stdin/stdout 与扩展通信，
   扩展加载时自动启动后端服务器。
"""

import sys
import os
import json
import struct
import socket
import signal
import threading
from pathlib import Path


# ── 端口发现 ──────────────────────────────────────────────


def find_available_port(start: int = 8972, end: int = 8999) -> int:
    """从 start 到 end 依次尝试，返回第一个可用端口"""
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"无可用端口 ({start}-{end})")


def get_server_info_path() -> Path:
    """返回 server.json 路径：~/.flowshelf/server.json"""
    info_dir = Path.home() / ".flowshelf"
    info_dir.mkdir(parents=True, exist_ok=True)
    return info_dir / "server.json"


def write_server_info(port: int, pid: int) -> None:
    """将端口和 PID 写入 server.json"""
    info_path = get_server_info_path()
    info = {"port": port, "pid": pid, "url": f"http://localhost:{port}"}
    info_path.write_text(json.dumps(info, indent=2), encoding="utf-8")


def read_server_info() -> dict | None:
    """读取 server.json，失败返回 None"""
    info_path = get_server_info_path()
    if not info_path.is_file():
        return None
    try:
        return json.loads(info_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def is_server_running(port: int) -> bool:
    """检查端口上是否已有服务器在监听"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.connect(("127.0.0.1", port))
            return True
        except OSError:
            return False


# ── 服务器启动 ──────────────────────────────────────────────

_server_thread: threading.Thread | None = None
_server_port: int | None = None


def start_server(port: int) -> None:
    """在子线程中启动 uvicorn 服务器"""
    import uvicorn

    # 确保应用能被正确导入（PyInstaller 打包后路径可能不同）
    app_module = "app.main:app"

    def run():
        uvicorn.run(
            app_module,
            host="127.0.0.1",
            port=port,
            log_level="info",
        )

    global _server_thread, _server_port
    _server_port = port
    _server_thread = threading.Thread(target=run, daemon=True)
    _server_thread.start()

    # 写入服务器信息
    write_server_info(port, os.getpid())


def stop_server() -> None:
    """尝试停止服务器（向自身发送 SIGTERM）"""
    global _server_thread, _server_port
    if _server_thread and _server_thread.is_alive():
        # uvicorn 在 daemon 线程中，进程退出时自动终止
        # 对于 Native Messaging 模式，关闭 stdin 即可终止
        _server_thread = None
        _server_port = None
    info_path = get_server_info_path()
    if info_path.is_file():
        info_path.unlink()


# ── Native Messaging 协议 ──────────────────────────────────


def read_native_message() -> dict | None:
    """从 stdin 读取一条 Native Messaging 消息（4 字节长度前缀 + JSON）"""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    message_length = struct.unpack("<I", raw_length)[0]
    if message_length == 0:
        return None
    message = sys.stdin.buffer.read(message_length)
    if len(message) < message_length:
        return None
    return json.loads(message.decode("utf-8"))


def write_native_message(response: dict) -> None:
    """向 stdout 写入一条 Native Messaging 响应（4 字节长度前缀 + JSON）"""
    encoded = json.dumps(response).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def handle_native_message(message: dict) -> dict:
    """处理来自扩展的 Native Messaging 请求"""
    action = message.get("action", "")

    if action == "start":
        # 检查是否已在运行
        info = read_server_info()
        if info and is_server_running(info.get("port", 0)):
            return {
                "status": "ok",
                "port": info["port"],
                "url": info["url"],
                "message": "Server already running",
            }

        # 找可用端口并启动
        try:
            port = find_available_port()
            start_server(port)
            return {
                "status": "ok",
                "port": port,
                "url": f"http://localhost:{port}",
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    elif action == "status":
        info = read_server_info()
        if info and is_server_running(info.get("port", 0)):
            return {
                "status": "ok",
                "port": info["port"],
                "url": info["url"],
            }
        return {"status": "error", "message": "Server not running"}

    elif action == "stop":
        stop_server()
        return {"status": "ok", "message": "Server stopped"}

    else:
        return {"status": "error", "message": f"Unknown action: {action}"}


def native_messaging_mode() -> None:
    """Native Messaging 主循环：持续读取消息直到 stdin 关闭

    同时在后台启动服务器（如果尚未运行）。
    Chrome 启动 Native Messaging host 时，进程必须保持存活并持续读 stdin，
    否则 Chrome 会报 "A session ended very soon after starting"。
    """
    # 先确保服务器在运行（扩展首次加载时会发 start 消息，但也提前启动以防万一）
    info = read_server_info()
    if not (info and is_server_running(info.get("port", 0))):
        try:
            port = find_available_port()
            start_server(port)
        except Exception:
            pass  # 启动失败不阻断消息循环，扩展会收到 error 响应

    # 消息循环：持续读取直到 stdin 关闭
    while True:
        try:
            message = read_native_message()
            if message is None:
                # stdin 关闭，退出
                break
            response = handle_native_message(message)
            write_native_message(response)
        except Exception as e:
            try:
                write_native_message({"status": "error", "message": str(e)})
            except Exception:
                break


def _is_native_messaging_context() -> bool:
    """检测当前是否被 Chrome 作为 Native Messaging Host 启动

    判断依据：
    - 命令行含 --native-messaging 参数
    - 或 stdin 不是 TTY（Chrome 通过管道连接 stdin/stdout）
    """
    if "--native-messaging" in sys.argv:
        return True
    # Chrome 启动 native host 时，stdin 是管道而非 TTY
    try:
        return not sys.stdin.isatty()
    except Exception:
        # 某些环境（如 PyInstaller onefile）isatty() 可能抛异常，保守返回 True
        return True


# ── 主入口 ──────────────────────────────────────────────────


def main() -> None:
    if _is_native_messaging_context():
        native_messaging_mode()
    else:
        # 直接启动模式：找可用端口，启动服务器
        info = read_server_info()
        if info and is_server_running(info.get("port", 0)):
            print(f"FlowShelf 后端已在运行：{info['url']}")
            print(f"  端口: {info['port']}, PID: {info.get('pid', 'unknown')}")
            return

        port = find_available_port()
        print(f"启动 FlowShelf 后端...")
        print(f"  地址: http://localhost:{port}")
        print(f"  按 Ctrl+C 停止")

        start_server(port)

        try:
            # 主线程等待服务器线程
            if _server_thread:
                _server_thread.join()
        except KeyboardInterrupt:
            print("\n正在停止...")
            stop_server()


if __name__ == "__main__":
    main()
