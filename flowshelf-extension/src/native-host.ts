/**
 * FlowSheld Native Messaging 客户端
 *
 * 通过 Chrome Native Messaging 协议与 flowshelf-backend 二进制通信，
 * 实现扩展加载时自动启动后端服务器。
 *
 * Native Messaging 协议：
 * - 扩展调用 chrome.runtime.sendNativeMessage() 发送 JSON
 * - Chrome 启动 native host 进程，通过 stdin/stdout 传递消息
 * - 消息格式：4 字节 little-endian 长度 + JSON payload
 */

const NATIVE_HOST_NAME = 'com.flowshelf.backend';

export interface NativeHostResponse {
  status: 'ok' | 'error';
  port?: number;
  url?: string;
  message?: string;
}

/**
 * 发送 Native Messaging 消息
 */
export async function sendNativeMessage(
  message: Record<string, unknown>
): Promise<NativeHostResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        message,
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              status: 'error',
              message: chrome.runtime.lastError.message,
            });
          } else {
            resolve(response || { status: 'error', message: 'No response' });
          }
        }
      );
    } catch (err) {
      resolve({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/**
 * 启动后端服务器
 */
export async function startBackend(): Promise<NativeHostResponse> {
  return sendNativeMessage({ action: 'start' });
}

/**
 * 检查后端服务器状态
 */
export async function checkBackendStatus(): Promise<NativeHostResponse> {
  return sendNativeMessage({ action: 'status' });
}

/**
 * 停止后端服务器
 */
export async function stopBackend(): Promise<NativeHostResponse> {
  return sendNativeMessage({ action: 'stop' });
}
