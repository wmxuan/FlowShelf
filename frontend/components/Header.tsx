'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

const ALL_NAV_ITEMS = [
  { href: '/tabs', label: '🗂️ Tab 管理', alwaysShow: true },
  { href: '/cards', label: '📚 卡片库', alwaysShow: false },
  { href: '/toolbox', label: '🛠️ 工具箱', alwaysShow: false },
  { href: '/learning', label: '📥 暂存区', alwaysShow: true },
  { href: '/search', label: '🔍 全局搜索', alwaysShow: false },
];

// API 基址（与 tabs/page.tsx 逻辑一致）
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || (
  typeof window !== 'undefined' && window.location.port === '3000'
    ? 'http://localhost:8972'
    : ''
);

export default function Header() {
  const pathname = usePathname();
  const [aiMode, setAiMode] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 从后端 health 获取当前 AI 模式
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) {
          const data = await res.json();
          setAiMode(data.ai_mode === 'real');
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const handleToggleAiMode = useCallback(() => {
    if (aiMode) {
      // 切换到非 AI 模式：清空 key
      (async () => {
        try {
          await fetch(`${API_BASE}/api/settings/api-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: '', base_url: '' }),
          });
        } catch { /* ignore */ }
        setAiMode(false);
      })();
    } else {
      // 切换到 AI 模式：弹窗输入 key
      setShowKeyDialog(true);
      setError('');
    }
  }, [aiMode]);

  const handleSaveKey = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/settings/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim(), base_url: baseUrl.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiMode(data.ai_mode === 'real');
        setShowKeyDialog(false);
        setApiKey('');
        setBaseUrl('');
      } else {
        setError('保存失败，请重试');
      }
    } catch {
      setError('连接后端失败');
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl]);

  const navItems = ALL_NAV_ITEMS.filter(item => aiMode || item.alwaysShow);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🧩</span>
            <span className="text-lg font-bold">FlowShelf</span>
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-medium transition-colors ${
                      active
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {/* AI 模式切换 */}
            <button
              onClick={handleToggleAiMode}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                aiMode
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }`}
              title={aiMode ? '点击切换为非 AI 模式' : '点击切换为 AI 模式（需 API Key）'}
            >
              {aiMode ? '✨ AI 模式' : '📦 基础模式'}
            </button>
          </div>
        </div>
      </header>

      {/* API Key 输入弹窗 */}
      {showKeyDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl border border-border">
            <h2 className="text-lg font-semibold mb-1">切换到 AI 模式</h2>
            <p className="text-sm text-muted-foreground mb-4">
              AI 模式需要配置 OpenAI 兼容 API Key，用于智能分组、摘要生成、语义搜索等功能。
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">API Key *</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Base URL（可选）</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="留空用 OpenAI 官方，或填代理地址"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowKeyDialog(false); setApiKey(''); setBaseUrl(''); setError(''); }}
                  className="button button-outline text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveKey}
                  disabled={saving}
                  className="button button-primary text-sm"
                >
                  {saving ? '保存中...' : '确认启用'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
