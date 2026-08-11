'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useAiMode, useAiModeInvalidate } from '@/hooks/useAiMode';

import { API_BASE } from '@/services/api';

const ALL_NAV_ITEMS = [
  { href: '/tabs', label: '🗂️ Tab 管理'},
  { href: '/cards', label: '📚 卡片库'},
  { href: '/toolbox', label: '🛠️ 工具箱'},
  { href: '/learning', label: '📥 暂存区'},
  { href: '/search', label: '🔍 搜索'},
];

// 预设 AI Provider 配置
const AI_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
  { id: 'moonshot', name: 'Moonshot（月之暗面）', baseUrl: 'https://api.moonshot.cn', model: 'moonshot-v1-8k' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', model: 'qwen-turbo' },
  { id: 'custom', name: '自定义', baseUrl: '', model: '' },
];

export default function Header() {
  const pathname = usePathname();
  const { aiMode } = useAiMode();
  const invalidateAiMode = useAiModeInvalidate();
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [providerId, setProviderId] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleToggleAiMode = useCallback(() => {
    if (aiMode) {
      // 切换到非 AI 模式：清空 key
      (async () => {
        try {
          await fetch(`${API_BASE}/api/settings/api-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: '' }),
          });
        } catch { /* ignore */ }
        await invalidateAiMode();
      })();
    } else {
      // 切换到 AI 模式：弹窗输入 key
      setShowKeyDialog(true);
      setError('');
      // 重置为默认 Provider
      setProviderId('deepseek');
      setBaseUrl('');
      setModel('');
    }
  }, [aiMode]);

  // Provider 切换时自动填充 base_url 和 model
  const handleProviderChange = useCallback((id: string) => {
    setProviderId(id);
    const provider = AI_PROVIDERS.find(p => p.id === id);
    if (provider && id !== 'custom') {
      setBaseUrl(provider.baseUrl);
      setModel(provider.model);
    } else {
      setBaseUrl('');
      setModel('');
    }
  }, []);

  const handleSaveKey = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }
    const finalBaseUrl = providerId === 'custom' ? baseUrl.trim() : (AI_PROVIDERS.find(p => p.id === providerId)?.baseUrl || baseUrl.trim());
    const finalModel = providerId === 'custom' ? model.trim() : (AI_PROVIDERS.find(p => p.id === providerId)?.model || model.trim());
    if (!finalBaseUrl) {
      setError('请填写 Base URL');
      return;
    }
    if (!finalModel) {
      setError('请填写 Model');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/settings/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim(), base_url: finalBaseUrl, model: finalModel }),
      });
      if (res.ok) {
        await invalidateAiMode();
        setShowKeyDialog(false);
        setApiKey('');
        setBaseUrl('');
        setModel('');
      } else {
        setError('保存失败，请重试');
      }
    } catch {
      setError('连接后端失败');
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl, model, providerId, invalidateAiMode]);

  const navItems = ALL_NAV_ITEMS; // 基础模式也全显示，降级功能标注

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
              选择 AI 服务商并填入 API Key，即可启用智能分组、摘要生成、语义搜索等功能。
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">AI 服务商 *</label>
                <select
                  value={providerId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {AI_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
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
              {providerId === 'custom' ? (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Base URL *</label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Model *</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="模型名称"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Base URL: {AI_PROVIDERS.find(p => p.id === providerId)?.baseUrl}</div>
                  <div>Model: {AI_PROVIDERS.find(p => p.id === providerId)?.model}</div>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowKeyDialog(false); setApiKey(''); setBaseUrl(''); setModel(''); setError(''); }}
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
