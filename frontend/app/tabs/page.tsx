'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAllTabs,
  closeTab,
  activateTab,
  getTabContent,
  checkBridgeAvailable,
  onTabEvent,
  type ChromeTabInfo,
} from '@/lib/chrome-bridge';

interface TabGroup {
  name: string;
  tab_indices: number[];
}

interface TabGroupResponse {
  groups: TabGroup[];
  total: number;
  group_count: number;
}

interface TabAssignResponse {
  action: 'assign' | 'create';
  group_name: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

function isHttpTab(url?: string): boolean {
  return !!url && (url.startsWith('http') || url.startsWith('https'));
}

export default function TabsPage() {
  const [tabs, setTabs] = useState<ChromeTabInfo[]>([]);
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [bridgeAvailable, setBridgeAvailable] = useState(false);
  const [enriching, setEnriching] = useState<number | null>(null);
  const [enrichMsg, setEnrichMsg] = useState('');
  const enrichMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs：事件监听器中读取最新状态
  const tabsRef = useRef(tabs);
  const groupsRef = useRef(groups);
  const loadedRef = useRef(false);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  const loadAndGroupTabs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let allTabs = await getAllTabs();
      // 如果首次获取为空，等待 1s 后重试一次（Bridge 可能刚就绪，SW 尚未唤醒）
      if (allTabs.length === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        allTabs = await getAllTabs();
      }
      const httpTabs = allTabs.filter(
        (t) => t.url && (t.url.startsWith('http') || t.url.startsWith('https'))
      );
      setTabs(httpTabs);

      if (httpTabs.length === 0) {
        setGroups([]);
        return;
      }

      if (httpTabs.length <= 1) {
        setGroups([{ name: '全部标签', tab_indices: httpTabs.map((_, i) => i) }]);
        setExpandedGroups(new Set([0]));
        return;
      }

      const res = await fetch(`${API_BASE}/api/tabs/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabs: httpTabs.map((t) => ({
            url: t.url,
            title: t.title,
          })),
        }),
      });

      if (!res.ok) throw new Error(`AI 归组失败: ${res.status}`);
      const data: TabGroupResponse = await res.json();
      setGroups(data.groups);
      setExpandedGroups(new Set(data.groups.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const available = await checkBridgeAvailable(2000);
      if (!mounted) return;
      setBridgeAvailable(available);
      if (available) {
        loadAndGroupTabs();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadAndGroupTabs]);

  const handleCloseTab = async (tabId: number) => {
    try {
      await closeTab(tabId);
      // 本地即时移除，不重新触发 AI 归组
      removeTabFromState(tabId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '关闭失败');
    }
  };

  const handleActivateTab = async (tabId: number) => {
    try {
      await activateTab(tabId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '激活失败');
    }
  };

  const handleCollectToLearning = async (index: number, type: 'article' | 'tool') => {
    const tab = tabs[index];
    if (!tab) return;
    setEnriching(index);
    try {
      const content = await getTabContent(tab.id);
      const res = await fetch(`${API_BASE}/api/learning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_url: tab.url,
          title: tab.title,
          item_type: type,
          content,
        }),
      });
      if (!res.ok) throw new Error(`保存失败: ${res.status}`);
      setEnrichMsg('✅ 已保存到待学习队列，AI 正在后台生成摘要...');
      // 成功提示 3 秒后自动消失；用 ref 清掉之前的 timer，避免连续操作时被提前清空
      if (enrichMsgTimer.current) clearTimeout(enrichMsgTimer.current);
      enrichMsgTimer.current = setTimeout(() => setEnrichMsg(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '收藏失败');
    } finally {
      setEnriching(null);
    }
  };

  const handleCloseGroup = async (group: TabGroup) => {
    const ids = group.tab_indices
      .map((i) => tabs[i]?.id)
      .filter((id): id is number => id != null);
    for (const id of ids) {
      try {
        await closeTab(id);
      } catch {
        // 静默失败
      }
    }
    // 本地即时移除整组，不重新触发 AI 归组
    removeGroupFromState(group);
  };

  /**
   * 本地移除单个标签：更新 tabs 数组和 groups 结构
   * 如果某组移除后为空，则删除该组
   *
   * 不能用嵌套 functional update（在 setTabs updater 里调 setGroups）：
   * React StrictMode 下 updater 双调用，setGroups 的"对大于 removedIndex 的
   * index 减 1"是非幂等操作，第二次会基于第一次结果再减一次，导致 index 错乱、
   * 标签换组。这里基于 ref 一次性算出目标值后直接设值，规避该问题。
   */
  function removeTabFromState(tabId: number) {
    const removedIndex = tabsRef.current.findIndex((t) => t.id === tabId);
    if (removedIndex === -1) return;

    const newTabs = tabsRef.current.filter((t) => t.id !== tabId);
    const newGroups = groupsRef.current
      .map((group) => ({
        ...group,
        tab_indices: group.tab_indices
          .filter((ti) => ti !== removedIndex)
          .map((ti) => (ti > removedIndex ? ti - 1 : ti)),
      }))
      .filter((group) => group.tab_indices.length > 0);

    setTabs(newTabs);
    setGroups(newGroups);
  }

  /**
   * 本地移除整组：从 tabs 数组移除该组所有标签，并删除该组
   */
  function removeGroupFromState(group: TabGroup) {
    const groupTabIds = new Set<number>(
      group.tab_indices
        .map((i) => tabs[i]?.id)
        .filter((id): id is number => id != null)
    );
    setTabs((prevTabs) => prevTabs.filter((t) => t.id != null && !groupTabIds.has(t.id)));
    setGroups((prevGroups) => {
      const remainingTabs = tabs.filter((t) => t.id != null && !groupTabIds.has(t.id));
      return prevGroups
        .filter((g) => g !== group)
        .map((g) => {
          const newIndices = g.tab_indices
            .map((oldIdx) => tabs[oldIdx])
            .filter((t) => t && t.id != null && !groupTabIds.has(t.id))
            .map((t) => remainingTabs.indexOf(t))
            .filter((idx) => idx >= 0);
          return { ...g, tab_indices: newIndices };
        })
        .filter((g) => g.tab_indices.length > 0);
    });
  }

  // ============ 实时同步：单标签分组 ============

  /** 构建 assign API 所需的已有分组上下文（仅传组名+数量+1个示例，省 token） */
  function buildExistingGroups() {
    return groupsRef.current.map((g) => ({
      name: g.name,
      count: g.tab_indices.length,
      sample_tabs: g.tab_indices
        .slice(0, 1)
        .map((i) => tabsRef.current[i])
        .filter(Boolean)
        .map((t) => ({ url: t.url || '', title: t.title || '' })),
    }));
  }

  /** 将新标签分配到已有分组或创建新分组（增量更新，不重新归组全部标签） */
  async function assignNewTab(tab: ChromeTabInfo, newTabIndex: number) {
    const existingGroups = buildExistingGroups();
    let groupName = '新标签';
    let isCreate = true;

    try {
      const res = await fetch(`${API_BASE}/api/tabs/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: { url: tab.url, title: tab.title || '' },
          existing_groups: existingGroups,
        }),
      });
      if (res.ok) {
        const data: TabAssignResponse = await res.json();
        groupName = data.group_name;
        isCreate = data.action === 'create';
      }
    } catch {
      // 降级：创建新组
    }

    setGroups((prevGroups) => {
      if (!isCreate) {
        return prevGroups.map((g) =>
          g.name === groupName && !g.tab_indices.includes(newTabIndex)
            ? { ...g, tab_indices: [...g.tab_indices, newTabIndex] }
            : g
        );
      }
      const exists = prevGroups.some((g) => g.name === groupName);
      if (exists) {
        return prevGroups.map((g) =>
          g.name === groupName && !g.tab_indices.includes(newTabIndex)
            ? { ...g, tab_indices: [...g.tab_indices, newTabIndex] }
            : g
        );
      }
      const updated = [...prevGroups, { name: groupName, tab_indices: [newTabIndex] }];
      setExpandedGroups((prev) => new Set([...prev, updated.length - 1]));
      return updated;
    });
  }

  // 订阅标签页事件：实时同步新增/关闭/URL变化
  useEffect(() => {
    const unsubscribe = onTabEvent((data) => {
      // 初始加载未完成时跳过，避免与 loadAndGroupTabs 竞争
      if (!loadedRef.current) return;

      const { event, tab } = data;

      if (event === 'removed') {
        removeTabFromState(tab.id);
        return;
      }

      if (event === 'created') {
        if (!isHttpTab(tab.url)) return;
        if (tabsRef.current.some((t) => t.id === tab.id)) return;
        const newTabIndex = tabsRef.current.length;
        setTabs((prev) => [...prev, tab]);
        assignNewTab(tab, newTabIndex);
        return;
      }

      if (event === 'updated') {
        const existingIndex = tabsRef.current.findIndex((t) => t.id === tab.id);
        const httpNow = isHttpTab(tab.url);
        const changeInfo = tab.changeInfo || {};

        if (existingIndex === -1) {
          // 不在列表中：若已变为 http，作为新标签加入
          if (httpNow && !tabsRef.current.some((t) => t.id === tab.id)) {
            const newTabIndex = tabsRef.current.length;
            setTabs((prev) => [...prev, tab]);
            assignNewTab(tab, newTabIndex);
          }
          return;
        }

        const oldTab = tabsRef.current[existingIndex];
        const urlChanged = !!changeInfo.url && changeInfo.url !== oldTab.url;

        if (!httpNow) {
          removeTabFromState(tab.id);
          return;
        }

        if (urlChanged) {
          // URL 变化：先从旧组移除，更新标签信息，再用新 URL 重新分组
          setGroups((prevGroups) =>
            prevGroups
              .map((g) => ({
                ...g,
                tab_indices: g.tab_indices.filter((ti) => ti !== existingIndex),
              }))
              .filter((g) => g.tab_indices.length > 0)
          );
          setTabs((prev) => prev.map((t) => (t.id === tab.id ? tab : t)));
          assignNewTab(tab, existingIndex);
        } else if (changeInfo.title || changeInfo.favIconUrl) {
          setTabs((prev) => prev.map((t) => (t.id === tab.id ? tab : t)));
        }
      }
    });
    return unsubscribe;
  }, []);

  const toggleGroup = (gi: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(gi) ? next.delete(gi) : next.add(gi);
      return next;
    });
  };

  if (!bridgeAvailable) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-6xl mb-6">🔌</div>
        <h1 className="text-2xl font-bold mb-4">需要安装 FlowShelf 浏览器扩展</h1>
        <p className="text-muted-foreground mb-6">
          Tab 管理功能需要通过 FlowShelf Chrome 扩展与浏览器通信。
          请先安装扩展后刷新此页面。
        </p>
        <p className="text-sm text-muted-foreground">
          如果你已安装扩展但仍看到此提示，请确保扩展已在
          <code className="px-1 py-0.5 bg-muted rounded mx-1">localhost:3000</code>
          上激活。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🗂️ Tab 管理台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI 自动归组所有窗口的标签页，一键收藏到待学习或工具箱
          </p>
        </div>
        <button
          onClick={loadAndGroupTabs}
          disabled={loading}
          className="button button-outline"
        >
          {loading ? '归组中...' : '🔄 重新归组'}
        </button>
      </div>

      {/* 操作反馈 Toast：固定在视口顶部居中，滚动到底部也能看到 */}
      {(enrichMsg || error) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-sm w-full px-4">
          {enrichMsg && (
            <div className="rounded-lg border border-primary/20 bg-background shadow-lg px-4 py-3 text-sm text-primary">
              {enrichMsg}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-background shadow-lg px-4 py-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
          <p>AI 正在归组标签页...</p>
        </div>
      )}

      {!loading && tabs.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">📭</div>
          <p>暂无可管理的 HTTP/HTTPS 标签页</p>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group, gi) => {
            const expanded = expandedGroups.has(gi);
            return (
              <div key={gi} className="card overflow-hidden p-0">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(gi)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {expanded ? '▼' : '▶'}
                    </span>
                    <span className="font-semibold">{group.name}</span>
                    <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {group.tab_indices.length}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseGroup(group);
                    }}
                    className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    🗑 整组关闭
                  </button>
                </div>

                {expanded && (
                  <>
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {group.tab_indices.map((ti) => {
                        const tab = tabs[ti];
                        if (!tab) return null;
                        const isEnriching = enriching === ti;
                        return (
                          <div
                            key={ti}
                            className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                          >
                            <span className="text-lg">🌐</span>
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => handleActivateTab(tab.id)}
                              title={tab.title}
                            >
                              <div className="font-medium text-sm truncate">
                                {tab.title || '无标题'}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {tab.url}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() =>
                                  handleCollectToLearning(ti, 'article')
                                }
                                disabled={isEnriching}
                                className="text-xs px-2 py-1 rounded border border-border hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                                title="收藏为知识卡片"
                              >
                                📄 卡片
                              </button>
                              <button
                                onClick={() =>
                                  handleCollectToLearning(ti, 'tool')
                                }
                                disabled={isEnriching}
                                className="text-xs px-2 py-1 rounded border border-border hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                                title="收藏为工具"
                              >
                                🔧 工具
                              </button>
                              <button
                                onClick={() => handleCloseTab(tab.id)}
                                className="text-xs px-2 py-1 rounded border border-border hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                                title="关闭标签"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
