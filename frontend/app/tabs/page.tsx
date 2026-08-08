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
  onGroupEvent,
  groupTabs,
  getTabGroups,
  type ChromeTabInfo,
  type TabGroupRequest,
  type GroupEventData,
} from '@/lib/chrome-bridge';

interface TabGroup {
  name: string;
  tab_indices: number[];
  color?: string;
}

interface TabGroupResponse {
  groups: TabGroup[];
  total: number;
  group_count: number;
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

/** Chrome 原生群组颜色名 → hex 映射 */
const CHROME_COLOR_MAP: Record<string, string> = {
  grey: '#9ca3af',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#10b981',
  pink: '#ec4899',
  purple: '#8b5cf6',
  orange: '#f97316',
};

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
  /** Chrome 原生群组缓存：groupId → { name, color }，供事件处理查群组名 */
  const chromeGroupsRef = useRef<Map<number, { name: string; color: string }>>(
    new Map()
  );
  /** 编辑模式 ref：事件监听器中读取最新值，决定是否忽略群组级事件 */
  const editModeRef = useRef(false);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  const showEnrichMsg = useCallback((msg: string, ms = 4000) => {
    setEnrichMsg(msg);
    if (enrichMsgTimer.current) clearTimeout(enrichMsgTimer.current);
    enrichMsgTimer.current = setTimeout(() => setEnrichMsg(''), ms);
  }, []);

  /** 加载标签：按 Chrome 原生群组或窗口分组，不调用 AI */
  const loadTabs = useCallback(async () => {
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

      // 始终拉取并缓存 Chrome 群组信息，供后续事件通过 groupId 查名称/颜色
      const chromeGroups = await getTabGroups();
      const groupInfoMap = new Map<number, { name: string; color: string }>();
      for (const g of chromeGroups) {
        groupInfoMap.set(g.id, {
          name: g.title || '未命名分组',
          color: CHROME_COLOR_MAP[g.color] || GROUP_COLORS[0],
        });
      }
      chromeGroupsRef.current = groupInfoMap;

      if (httpTabs.length === 0) {
        setGroups([]);
        return;
      }

      // 检查是否有 Chrome 原生群组
      const hasChromeGroups = httpTabs.some(
        (t) => t.groupId != null && t.groupId !== -1
      );

      if (hasChromeGroups) {
        // 按 Chrome 群组分组
        const groupByName = new Map<string, { indices: number[]; color?: string }>();
        const ungroupedIndices: number[] = [];
        for (let i = 0; i < httpTabs.length; i++) {
          const gid = httpTabs[i].groupId;
          if (gid != null && gid !== -1) {
            const info = groupInfoMap.get(gid);
            const name = info?.name || '未命名分组';
            if (!groupByName.has(name)) {
              groupByName.set(name, { indices: [], color: info?.color });
            }
            groupByName.get(name)!.indices.push(i);
          } else {
            ungroupedIndices.push(i);
          }
        }

        const newGroups: TabGroup[] = Array.from(groupByName.entries()).map(
          ([name, { indices, color }]) => ({
            name,
            tab_indices: indices,
            color,
          })
        );
        // 未分组放在最后
        if (ungroupedIndices.length > 0) {
          newGroups.push({ name: '未分组', tab_indices: ungroupedIndices });
        }
        setGroups(newGroups);
        setExpandedGroups(new Set(newGroups.map((_, i) => i)));
      } else {
        // 无 Chrome 群组 → 按窗口分组
        const windowMap = new Map<number, number[]>();
        for (let i = 0; i < httpTabs.length; i++) {
          const wid = httpTabs[i].windowId ?? 0;
          if (!windowMap.has(wid)) windowMap.set(wid, []);
          windowMap.get(wid)!.push(i);
        }

        const newGroups: TabGroup[] = Array.from(windowMap.entries()).map(
          ([, indices], idx) => ({
            name: `窗口 ${idx + 1}`,
            tab_indices: indices,
          })
        );
        setGroups(newGroups);
        setExpandedGroups(new Set(newGroups.map((_, i) => i)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, []);

  /** AI 智能分组：调用后端 AI 对当前标签重新归组 */
  const handleAIGroup = useCallback(async () => {
    if (tabs.length === 0) return;
    setLoading(true);
    setError('');
    try {
      if (tabs.length <= 1) {
        setGroups([{ name: '全部标签', tab_indices: tabs.map((_, i) => i) }]);
        setExpandedGroups(new Set([0]));
        return;
      }
      const res = await fetch(`${API_BASE}/api/tabs/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabs: tabs.map((t) => ({ url: t.url, title: t.title })),
        }),
      });
      if (!res.ok) throw new Error(`AI 归组失败: ${res.status}`);
      const data: TabGroupResponse = await res.json();
      setGroups(data.groups);
      setExpandedGroups(new Set(data.groups.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 分组失败');
    } finally {
      setLoading(false);
    }
  }, [tabs]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const available = await checkBridgeAvailable(2000);
      if (!mounted) return;
      setBridgeAvailable(available);
      if (available) {
        loadTabs();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadTabs]);

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
    // 编辑模式下：过滤空组 + 清理编辑状态 + 退出编辑
    if (editMode) {
      setGroups((prev) => prev.filter((g) => g.tab_indices.length > 0));
      setEditingGroupIdx(null);
      setEditingGroupName('');
      setEditMode(false);
    }
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

  // ---------- 实时同步：新标签 / 换群组 / 群组事件 ----------

  /**
   * 根据 tab.groupId 决定插入到哪个分组：
   * - 有 Chrome 群组（groupId !== -1）且缓存中有该群组 → 加入对应分组（不存在则创建）
   * - 无群组或缓存未命中 → 加入「未分组」（不存在则末尾创建）
   * 编辑模式下始终加入「未分组」，保护用户的手动分组编辑。
   */
  function addTabToState(tab: ChromeTabInfo, tabIndex: number) {
    const inEditMode = editModeRef.current;
    const gid = tab.groupId;
    const hasGroup = !inEditMode && gid != null && gid !== -1;
    const info = hasGroup
      ? chromeGroupsRef.current.get(gid as number)
      : undefined;
    const targetName = hasGroup ? info?.name || '未命名分组' : '未分组';
    const targetColor = hasGroup ? info?.color : undefined;

    setGroups((prevGroups) => {
      // 已存在同名分组 → 加入
      const existingIdx = prevGroups.findIndex((g) => g.name === targetName);
      if (existingIdx !== -1) {
        return prevGroups.map((g, i) =>
          i === existingIdx && !g.tab_indices.includes(tabIndex)
            ? { ...g, tab_indices: [...g.tab_indices, tabIndex] }
            : g
        );
      }
      // 不存在 → 创建新分组。「未分组」始终放末尾；具名分组插入到「未分组」之前
      const newGroup: TabGroup = { name: targetName, tab_indices: [tabIndex] };
      if (targetColor) newGroup.color = targetColor;

      const ungroupedIdx = prevGroups.findIndex((g) => g.name === '未分组');
      if (ungroupedIdx === -1 || targetName === '未分组') {
        // 末尾追加
        const updated = [...prevGroups, newGroup];
        setExpandedGroups((prev) => new Set([...prev, updated.length - 1]));
        return updated;
      }
      // 插入到「未分组」之前，并调整 expandedGroups 中的索引
      const updated = [...prevGroups];
      updated.splice(ungroupedIdx, 0, newGroup);
      setExpandedGroups((prev) => {
        const next = new Set<number>();
        for (const i of prev) {
          if (i < ungroupedIdx) next.add(i);
          else next.add(i + 1);
        }
        next.add(ungroupedIdx);
        return next;
      });
      return updated;
    });
  }

  /**
   * 处理 'grouped' 事件：tab 在浏览器中换群组。
   * 非编辑模式下：从原分组移除 → 加入新 groupId 对应分组（或「未分组」）。
   * 编辑模式下：忽略（保护用户编辑）。
   */
  function handleTabGrouped(tab: ChromeTabInfo) {
    if (editModeRef.current) return; // 编辑模式忽略群组级事件

    const tabIndex = tabsRef.current.findIndex((t) => t.id === tab.id);
    if (tabIndex === -1) return;

    // 同步 tab 的 groupId 到 state
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id ? { ...t, groupId: tab.groupId } : t))
    );

    const gid = tab.groupId;
    const hasGroup = gid != null && gid !== -1;
    const info = hasGroup
      ? chromeGroupsRef.current.get(gid as number)
      : undefined;
    const targetName = hasGroup ? info?.name || '未命名分组' : '未分组';
    const targetColor = hasGroup ? info?.color : undefined;

    setGroups((prevGroups) => {
      // 找到 tab 当前所在分组
      const srcGi = prevGroups.findIndex((g) =>
        g.tab_indices.includes(tabIndex)
      );
      if (srcGi === -1) return prevGroups;
      // 已在目标分组 → 无需操作
      if (prevGroups[srcGi].name === targetName) return prevGroups;

      // 1. 从所有分组中移除该 tab index
      const withoutTab = prevGroups.map((g) => ({
        ...g,
        tab_indices: g.tab_indices.filter((ti) => ti !== tabIndex),
      }));

      // 2. 加入目标分组（已有则追加，无则新建）
      const targetExistingIdx = withoutTab.findIndex(
        (g) => g.name === targetName
      );
      let nextGroups: TabGroup[];
      if (targetExistingIdx !== -1) {
        nextGroups = withoutTab.map((g, i) =>
          i === targetExistingIdx
            ? { ...g, tab_indices: [...g.tab_indices, tabIndex] }
            : g
        );
      } else {
        const newGroup: TabGroup = {
          name: targetName,
          tab_indices: [tabIndex],
        };
        if (targetColor) newGroup.color = targetColor;
        const ungroupedIdx = withoutTab.findIndex((g) => g.name === '未分组');
        if (ungroupedIdx === -1 || targetName === '未分组') {
          nextGroups = [...withoutTab, newGroup];
        } else {
          nextGroups = [...withoutTab];
          nextGroups.splice(ungroupedIdx, 0, newGroup);
        }
        setExpandedGroups((prev) => {
          const newIdx =
            targetName === '未分组'
              ? nextGroups.length - 1
              : withoutTab.findIndex((g) => g.name === '未分组');
          return new Set([...prev, newIdx >= 0 ? newIdx : nextGroups.length - 1]);
        });
      }

      // 3. 过滤掉变空的分组（Chrome 解散空群组，state 同步）
      return nextGroups.filter((g) => g.tab_indices.length > 0);
    });
  }

  /**
   * 处理 Chrome 原生群组事件：
   * - created → 更新缓存（tabs 会通过自己的事件到达）
   * - updated → 更新缓存 + 改名/改色
   * - removed → 删除缓存 + 把该组所有 tab 移入「未分组」
   * 编辑模式下：全部忽略。
   */
  function handleGroupEvent(data: GroupEventData) {
    if (editModeRef.current) return; // 编辑模式忽略群组级事件

    const { event, group } = data;
    const groupName = group.title || '未命名分组';
    const groupColor = CHROME_COLOR_MAP[group.color] || GROUP_COLORS[0];

    if (event === 'created') {
      chromeGroupsRef.current.set(group.id, {
        name: groupName,
        color: groupColor,
      });
      return;
    }

    if (event === 'updated') {
      const oldInfo = chromeGroupsRef.current.get(group.id);
      const oldName = oldInfo?.name;
      chromeGroupsRef.current.set(group.id, {
        name: groupName,
        color: groupColor,
      });
      if (!oldName || oldName === groupName) return;
      setGroups((prev) =>
        prev.map((g) =>
          g.name === oldName ? { ...g, name: groupName, color: groupColor } : g
        )
      );
      return;
    }

    if (event === 'removed') {
      chromeGroupsRef.current.delete(group.id);
      setGroups((prev) => {
        const targetGroup = prev.find((g) => g.name === groupName);
        if (!targetGroup) return prev; // 该组已不在 state（可能已通过 grouped 事件处理）

        const movingIndices = targetGroup.tab_indices;
        const withoutGroup = prev.filter((g) => g.name !== groupName);

        const ungroupedIdx = withoutGroup.findIndex((g) => g.name === '未分组');
        if (ungroupedIdx !== -1) {
          return withoutGroup.map((g, i) =>
            i === ungroupedIdx
              ? {
                  ...g,
                  tab_indices: [...g.tab_indices, ...movingIndices],
                }
              : g
          );
        }
        // 不存在「未分组」→ 末尾创建
        const updated = [
          ...withoutGroup,
          { name: '未分组', tab_indices: movingIndices },
        ];
        setExpandedGroups((prevExp) =>
          new Set([...prevExp, updated.length - 1])
        );
        return updated;
      });
      // 同步这些 tab 的 groupId 为 -1（ungrouped）
      setTabs((prev) =>
        prev.map((t) =>
          t.groupId === group.id ? { ...t, groupId: -1 } : t
        )
      );
    }
  }

  useEffect(() => {
    const unsubscribe = onTabEvent((data) => {
      if (!loadedRef.current) return;

      const { event, tab } = data;

      if (event === 'removed') {
        removeTabFromState(tab.id);
        return;
      }

      // 'grouped' 事件：tab 换群组（编辑模式由 handleTabGrouped 内部忽略）
      if (event === 'grouped') {
        handleTabGrouped(tab);
        return;
      }

      if (event === 'created') {
        if (!isHttpTab(tab.url)) return;
        if (tabsRef.current.some((t) => t.id === tab.id)) return;
        const newTabIndex = tabsRef.current.length;
        setTabs((prev) => [...prev, tab]);
        addTabToState(tab, newTabIndex);
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
            addTabToState(tab, newTabIndex);
          }
          return;
        }

        if (!httpNow) {
          removeTabFromState(tab.id);
          return;
        }

        // 无论 URL/标题/favicon/groupId 变更，仅原地更新 tab 信息，不改变分组归属。
        // 分组变更由独立的 'grouped' 事件处理。
        if (
          changeInfo.url ||
          changeInfo.title ||
          changeInfo.favIconUrl ||
          changeInfo.groupId !== undefined
        ) {
          setTabs((prev) => prev.map((t) => (t.id === tab.id ? tab : t)));
        }
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onGroupEvent((data) => {
      if (!loadedRef.current) return;
      handleGroupEvent(data);
    });
    return unsubscribe;
  }, []);

  // ---------- 编辑模式：进入 / 取消 ----------

  function enterEditMode() {
    setEditMode(true);
  }

  function cancelEditMode() {
    // 取消编辑 = 回归真实：重新拉取浏览器最新状态，用户本次所有编辑丢弃
    setEditingGroupIdx(null);
    setEditingGroupName('');
    setEditMode(false);
    loadTabs();
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
                onClick={handleAIGroup}
                disabled={loading}
                className="button button-outline"
                title="调用 AI 对当前标签重新智能分组"
              >
                {loading ? 'AI 分组中...' : '🤖 AI智能分组'}
              </button>
              <button
                onClick={cancelEditMode}
                disabled={loading}
                className="button button-outline"
                title="恢复编辑前的分组，退出编辑"
              >
                ✕ 取消编辑
              </button>
              <button
                onClick={handleOrganizeTabs}
                disabled={organizing || loading || groups.length === 0}
                className="button button-primary"
                title="同步当前分组到 Chrome 浏览器，并退出编辑"
              >
                {organizing ? '同步中...' : '✨ 一键同步'}
              </button>
            </>
          ) : (
            <button
              onClick={enterEditMode}
              disabled={loading}
              className="button button-outline"
              title="编辑：调整分组、AI 分组、同步到浏览器"
            >
              ✏️ 编辑
            </button>
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
          <p>正在加载标签页...</p>
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
              const groupColor = group.color || GROUP_COLORS[gi % GROUP_COLORS.length];
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
