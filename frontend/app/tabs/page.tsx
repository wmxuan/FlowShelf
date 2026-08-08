'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import {
  getAllTabs,
  closeTab,
  activateTab,
  getTabContent,
  checkBridgeAvailable,
  onTabEvent,
  groupTabs,
  type ChromeTabInfo,
  type TabGroupRequest,
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

/** tab 拖拽时的稳定唯一 id：g-{gi}-i-{tabIndex} */
function tabDragId(gi: number, tabIndex: number) {
  return `g-${gi}-i-${tabIndex}`;
}

/** 组容器 id，用于 dnd-kit 中把 tab 拖到组头或组空白区时识别归属 */
function groupContainerId(gi: number) {
  return `group-${gi}`;
}

/** 解析 tabDragId → { gi, tabIndex } */
function parseTabDragId(id: string): { gi: number; tabIndex: number } | null {
  const m = id.match(/^g-(-?\d+)-i-(-?\d+)$/);
  if (!m) return null;
  return { gi: Number(m[1]), tabIndex: Number(m[2]) };
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

/** 分组卡片顶部边条颜色循环（与 background 中 Chrome 群组颜色一致） */
const GROUP_COLORS = [
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#ef4444', // red
  '#f59e0b', // yellow
  '#10b981', // green
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#f97316', // orange
];

function isHttpTab(url?: string): boolean {
  return !!url && (url.startsWith('http') || url.startsWith('https'));
}

// ---------- 可拖拽 tab 行 ----------

interface SortableTabRowProps {
  gi: number;
  tabIndex: number;
  tab: ChromeTabInfo;
  isDragging?: boolean;
  editMode: boolean;
  enriching: boolean;
  onActivate: () => void;
  onCollect: (type: 'article' | 'tool') => void;
  onClose: () => void;
}

function SortableTabRow({
  gi,
  tabIndex,
  tab,
  isDragging,
  editMode,
  enriching,
  onActivate,
  onCollect,
  onClose,
}: SortableTabRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableDragging,
  } = useSortable({ id: tabDragId(gi, tabIndex), data: { type: 'tab', gi, tabIndex } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: sortableDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors ${
        isDragging ? 'shadow-lg ring-2 ring-primary/50 bg-muted/80' : ''
      }`}
    >
      {editMode ? (
        <span
          className="text-lg cursor-grab active:cursor-grabbing select-none touch-none"
          title="拖拽调整分组或顺序"
          {...attributes}
          {...listeners}
        >
          ⠿
        </span>
      ) : (
        <span className="text-lg">🌐</span>
      )}
      <div
        className={`flex-1 min-w-0 ${editMode ? '' : 'cursor-pointer'}`}
        onClick={editMode ? undefined : onActivate}
        title={tab.title}
      >
        <div className="font-medium text-sm truncate">{tab.title || '无标题'}</div>
        <div className="text-xs text-muted-foreground truncate">{tab.url}</div>
      </div>
      {!editMode && (
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onCollect.bind(null, 'article')}
            disabled={enriching}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
            title="收藏为知识卡片"
          >
            📄 卡片
          </button>
          <button
            onClick={onCollect.bind(null, 'tool')}
            disabled={enriching}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
            title="收藏为工具"
          >
            🔧 工具
          </button>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
            title="关闭标签"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 组容器 droppable（让空组也能接收拖入）----------

function GroupDropZone({
  gi,
  children,
}: {
  gi: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupContainerId(gi) });
  return (
    <div
      ref={setNodeRef}
      id={groupContainerId(gi)}
      className={`border-t border-border/50 min-h-[40px] transition-colors ${
        isOver ? 'bg-primary/5 ring-1 ring-primary/20' : ''
      }`}
    >
      {children}
    </div>
  );
}

// ---------- 页面主体 ----------

export default function TabsPage() {
  const [tabs, setTabs] = useState<ChromeTabInfo[]>([]);
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [bridgeAvailable, setBridgeAvailable] = useState(false);
  const [enriching, setEnriching] = useState<number | null>(null);
  const [enrichMsg, setEnrichMsg] = useState('');
  const [organizing, setOrganizing] = useState(false);
  const enrichMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editMode, setEditMode] = useState(false);
  /** 编辑前快照：取消编辑时恢复 */
  const [editSnapshot, setEditSnapshot] = useState<{
    groups: TabGroup[];
    expanded: Set<number>;
  } | null>(null);
  /** 当前处于编辑状态的组下标：显示组名输入框 */
  const [editingGroupIdx, setEditingGroupIdx] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  /** 正在拖拽的 tab 定位信息（用于 DragOverlay 展示） */
  const [activeDrag, setActiveDrag] = useState<{
    gi: number;
    tabIndex: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Refs：事件监听器中读取最新状态
  const tabsRef = useRef(tabs);
  const groupsRef = useRef(groups);
  const loadedRef = useRef(false);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const showEnrichMsg = useCallback((msg: string, ms = 4000) => {
    setEnrichMsg(msg);
    if (enrichMsgTimer.current) clearTimeout(enrichMsgTimer.current);
    enrichMsgTimer.current = setTimeout(() => setEnrichMsg(''), ms);
  }, []);

  const loadAndGroupTabs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let allTabs = await getAllTabs();
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
          tabs: httpTabs.map((t) => ({ url: t.url, title: t.title })),
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
      showEnrichMsg('✅ 已保存到待学习队列，AI 正在后台生成摘要...', 3000);
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
    removeGroupFromState(group);
  };

  /** 一键整理：使用当前（编辑后）最新的 groups 应用为 Chrome 原生标签群组 */
  const handleOrganizeTabs = async () => {
    // 编辑模式下点整理：先退出编辑模式，再执行整理
    if (editMode) setEditMode(false);
    setOrganizing(true);
    setError('');
    try {
      const requestGroups: TabGroupRequest[] = groups
        .map((g) => ({
          name: g.name.trim() || '未命名分组',
          tabIds: g.tab_indices
            .map((i) => tabs[i]?.id)
            .filter((id): id is number => id != null),
        }))
        .filter((g) => g.tabIds.length > 0);

      if (requestGroups.length === 0) {
        setError('没有可整理的标签');
        return;
      }

      const result = await groupTabs(requestGroups);
      if (result.success) {
        const groupCount = new Set(result.results?.map((r) => r.groupId)).size;
        showEnrichMsg(`✅ 已创建 ${groupCount} 个标签群组，查看浏览器标签栏`, 4000);
      } else {
        setError(result.error || '整理失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '整理失败');
    } finally {
      setOrganizing(false);
    }
  };

  /** 删除单个 tab：本地即时移除，不重新触发 AI 归组 */
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

  // ---------- 实时同步：单标签分组 ----------

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

  useEffect(() => {
    const unsubscribe = onTabEvent((data) => {
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

  // ---------- 编辑模式：进入 / 取消 / 完成 ----------

  function enterEditMode() {
    setEditSnapshot({
      groups: groups.map((g) => ({ ...g, tab_indices: [...g.tab_indices] })),
      expanded: new Set(expandedGroups),
    });
    setEditMode(true);
  }

  function cancelEditMode() {
    if (editSnapshot) {
      setGroups(editSnapshot.groups);
      setExpandedGroups(editSnapshot.expanded);
    }
    setEditSnapshot(null);
    setEditingGroupIdx(null);
    setEditingGroupName('');
    setEditMode(false);
  }

  function saveEditMode() {
    // 自动删除空组
    setGroups((prev) => prev.filter((g) => g.tab_indices.length > 0));
    setEditSnapshot(null);
    setEditingGroupIdx(null);
    setEditingGroupName('');
    setEditMode(false);
  }

  const toggleGroup = (gi: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(gi) ? next.delete(gi) : next.add(gi);
      return next;
    });
  };

  // ---------- 组名编辑 ----------

  function startEditGroupName(gi: number) {
    setEditingGroupIdx(gi);
    setEditingGroupName(groups[gi]?.name ?? '');
  }

  function commitGroupName(gi: number) {
    const newName = editingGroupName.trim() || `分组 ${gi + 1}`;
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, name: newName } : g))
    );
    setEditingGroupIdx(null);
    setEditingGroupName('');
  }

  function cancelEditGroupName() {
    setEditingGroupIdx(null);
    setEditingGroupName('');
  }

  // ---------- 拖拽处理：组内排序 + 跨组移动 ----------

  function handleDragStart(event: DragStartEvent) {
    const parsed = parseTabDragId(String(event.active.id));
    if (!parsed) return;
    setActiveDrag(parsed);
  }

  function handleDragOver(event: DragOverEvent) {
    // 跨组移动：实时把源 tab 插入到目标组的目标位置（或者在悬停到组容器时追加到组尾）
    const { active, over } = event;
    const src = parseTabDragId(String(active.id));
    if (!src) return;
    if (!over) return;

    const overId = String(over.id);
    let targetGi: number;
    let insertAtEnd = false;

    const overTab = parseTabDragId(overId);
    if (overTab) {
      targetGi = overTab.gi;
    } else if (overId.startsWith('group-')) {
      const m = overId.match(/^group-(-?\d+)$/);
      if (!m) return;
      targetGi = Number(m[1]);
      insertAtEnd = true;
    } else {
      return;
    }

    const srcGi = src.gi;
    const srcTabIndex = src.tabIndex;

    setGroups((prev) => {
      if (targetGi >= prev.length || srcGi >= prev.length) return prev;
      if (!prev[srcGi].tab_indices.includes(srcTabIndex)) return prev;

      if (srcGi === targetGi) {
        // 同组：在 onDragEnd 里做排序（arrayMove 更精确），此处不处理
        return prev;
      }

      // 跨组：先从源组移除，再插入到目标组
      const srcGroup = prev[srcGi];
      const srcIndicesArr = [...srcGroup.tab_indices];
      const posInSrc = srcIndicesArr.indexOf(srcTabIndex);
      if (posInSrc === -1) return prev;
      srcIndicesArr.splice(posInSrc, 1);

      const dstGroup = prev[targetGi];
      let dstIndicesArr = [...dstGroup.tab_indices];
      if (insertAtEnd) {
        dstIndicesArr.push(srcTabIndex);
      } else {
        const overParsed = parseTabDragId(overId);
        if (!overParsed) {
          dstIndicesArr.push(srcTabIndex);
        } else {
          const posInDst = dstIndicesArr.indexOf(overParsed.tabIndex);
          if (posInDst === -1) {
            dstIndicesArr.push(srcTabIndex);
          } else {
            dstIndicesArr.splice(posInDst, 0, srcTabIndex);
          }
        }
      }

      const next = [...prev];
      next[srcGi] = { ...srcGroup, tab_indices: srcIndicesArr };
      next[targetGi] = { ...dstGroup, tab_indices: dstIndicesArr };
      // 不删除空组：避免 gi 偏移导致 dnd-kit active/over id 映射错乱。
      // 源组变空后保留，用户可手动「删除组」。
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);

    const src = parseTabDragId(String(active.id));
    if (!src || !over) return;

    const overId = String(over.id);
    if (overId.startsWith('group-')) return; // 已在 dragOver 中处理过"追加到组尾"

    const dst = parseTabDragId(overId);
    if (!dst) return;

    // 同组排序（跨组已经在 dragOver 中处理，但 dragEnd 得到最终位置更准确）
    if (src.gi === dst.gi) {
      setGroups((prev) => {
        if (src.gi >= prev.length) return prev;
        const srcGroup = prev[src.gi];
        const srcList = [...srcGroup.tab_indices];
        const oldPos = srcList.indexOf(src.tabIndex);
        const newPos = srcList.indexOf(dst.tabIndex);
        if (oldPos === -1 || newPos === -1) return prev;
        if (oldPos === newPos) return prev;
        const moved = arrayMove(srcList, oldPos, newPos);
        const next = [...prev];
        next[src.gi] = { ...srcGroup, tab_indices: moved };
        return next;
      });
    }
  }

  // ---------- 新增 / 删除分组 ----------

  function handleAddNewGroup() {
    setGroups((prev) => [...prev, { name: `新分组 ${prev.length + 1}`, tab_indices: [] }]);
    setExpandedGroups((prev) => new Set([...prev, groups.length]));
  }

  function handleDeleteGroup(gi: number) {
    setGroups((prev) => {
      // 把该组的 tab 放回"未分组"状态——但系统中没有"未分组"组。
      // 折中：若该组仍有 tab，则拒绝删除（提示先把 tab 移到其他组）；若空组则直接删。
      if (prev[gi]?.tab_indices.length > 0) {
        setError('该分组下还有标签，请先把标签移到其他分组再删除');
        return prev;
      }
      const next = prev.filter((_, i) => i !== gi);
      // 调整 expandedGroups
      setExpandedGroups((prevExp) => {
        const nextExp = new Set<number>();
        let deletedBefore = 0;
        for (let i = 0; i < prev.length; i++) {
          if (i === gi) {
            deletedBefore++;
            continue;
          }
          if (prevExp.has(i)) nextExp.add(i - deletedBefore);
        }
        return nextExp;
      });
      return next;
    });
  }

  if (!bridgeAvailable) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-6xl mb-6">🔌</div>
        <h1 className="text-2xl font-bold mb-4">需要安装 FlowShelf 浏览器扩展</h1>
        <p className="text-muted-foreground mb-6">
          Tab 管理功能需要通过 FlowShelf Chrome 扩展与浏览器通信。请先安装扩展后刷新此页面。
        </p>
        <p className="text-sm text-muted-foreground">
          如果你已安装扩展但仍看到此提示，请确保扩展已在
          <code className="px-1 py-0.5 bg-muted rounded mx-1">localhost:3000</code>
          上激活。
        </p>
      </div>
    );
  }

  const activeTab =
    activeDrag && tabs[activeDrag.tabIndex] ? tabs[activeDrag.tabIndex] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">🗂️ Tab 管理台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI 自动归组所有窗口的标签页。
            {editMode && (
              <span className="text-primary font-medium">
                {' '}
                · 编辑模式：拖拽 ⠿ 调整顺序/分组，点击组名可改名
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editMode ? (
            <>
              <button
                onClick={cancelEditMode}
                disabled={loading}
                className="button button-outline"
                title="清除本次所有编辑操作，退出编辑"
              >
                ✕ 取消编辑
              </button>
              <button
                onClick={saveEditMode}
                disabled={loading}
                className="button button-primary"
                title="保存本次所有编辑操作，退出编辑"
              >
                ✓ 完成编辑
              </button>
            </>
          ) : (
            <>
              <button
                onClick={enterEditMode}
                disabled={loading}
                className="button button-outline"
                title="编辑：调整分组顺序和改名"
              >
                ✏️ 编辑
              </button>
              <button
                onClick={handleOrganizeTabs}
                disabled={organizing || loading || groups.length === 0}
                className="button button-primary"
                title="按当前分组结果创建 Chrome 标签群组"
              >
                {organizing ? '整理中...' : '✨ 一键整理'}
              </button>
              <button
                onClick={loadAndGroupTabs}
                disabled={loading}
                className="button button-outline"
              >
                {loading ? '归组中...' : '🔄 重新归组'}
              </button>
            </>
          )}
        </div>
      </div>

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={editMode ? handleDragStart : undefined}
          onDragOver={editMode ? handleDragOver : undefined}
          onDragEnd={editMode ? handleDragEnd : undefined}
        >
          <div
            className="grid gap-4 items-start"
            style={{
              gridTemplateColumns:
                'repeat(auto-fit, minmax(max(260px, 25%), 1fr))',
              maxWidth: '1400px',
            }}
          >
            {groups.map((group, gi) => {
              const expanded = expandedGroups.has(gi);
              const isEditingName = editingGroupIdx === gi;
              const groupColor = GROUP_COLORS[gi % GROUP_COLORS.length];
              return (
                <div
                  key={gi}
                  className="card p-0"
                  data-group-idx={gi}
                  style={{ borderTop: `4px solid ${groupColor}` }}
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleGroup(gi)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: groupColor }}
                      />
                      <span className="text-sm text-muted-foreground flex-shrink-0">
                        {expanded ? '▼' : '▶'}
                      </span>
                      {isEditingName ? (
                        <input
                          autoFocus
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitGroupName(gi);
                            if (e.key === 'Escape') cancelEditGroupName();
                          }}
                          onBlur={() => commitGroupName(gi)}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold bg-muted px-2 py-1 rounded outline-none ring-1 ring-primary/30 focus:ring-primary min-w-0"
                          placeholder="分组名"
                        />
                      ) : editMode ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditGroupName(gi);
                          }}
                          className="font-semibold text-left hover:underline decoration-dotted min-w-0 truncate"
                          title="点击编辑组名"
                        >
                          {group.name}
                        </button>
                      ) : (
                        <span className="font-semibold truncate">{group.name}</span>
                      )}
                      <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary flex-shrink-0">
                        {group.tab_indices.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {editMode && group.tab_indices.length === 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(gi);
                          }}
                          className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                          title="删除空分组"
                        >
                          🗑 删除组
                        </button>
                      )}
                      {!editMode && (
                        <DeleteConfirmButton
                          onConfirm={() => handleCloseGroup(group)}
                          buttonClassName="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                          buttonTitle="整组关闭"
                          confirmText={`是否关闭"${group.name}"分组下的所有标签？`}
                          stopPropagation
                        >
                          ✕ 整组关闭
                        </DeleteConfirmButton>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <GroupDropZone gi={gi}>
                      <SortableContext
                        items={group.tab_indices.map((ti) => tabDragId(gi, ti))}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="divide-y divide-border/30">
                          {group.tab_indices.map((ti) => {
                            const tab = tabs[ti];
                            if (!tab) return null;
                            return (
                              <SortableTabRow
                                key={`${gi}-${ti}`}
                                gi={gi}
                                tabIndex={ti}
                                tab={tab}
                                editMode={editMode}
                                enriching={enriching === ti}
                                onActivate={() => handleActivateTab(tab.id)}
                                onCollect={(type) => handleCollectToLearning(ti, type)}
                                onClose={() => handleCloseTab(tab.id)}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                      {group.tab_indices.length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-3 border-t border-border/30">
                          {editMode ? '拖拽标签到此处加入该分组' : '暂无标签'}
                        </div>
                      )}
                    </GroupDropZone>
                  )}
                </div>
              );
            })}
            {editMode && (
              <button
                onClick={handleAddNewGroup}
                className="card p-0 border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center min-h-[120px] cursor-pointer"
                title="新建空分组"
              >
                <span className="text-muted-foreground text-sm font-medium">➕ 新建分组</span>
              </button>
            )}
          </div>

          <DragOverlay>
            {activeDrag && activeTab ? (
              <div className="card shadow-2xl border-primary/50">
                <SortableTabRow
                  gi={activeDrag.gi}
                  tabIndex={activeDrag.tabIndex}
                  tab={activeTab}
                  editMode
                  enriching={false}
                  isDragging
                  onActivate={() => {}}
                  onCollect={() => {}}
                  onClose={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
