'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Wrench,
  Calendar,
  Sparkles,
  ExternalLink,
  Trash2,
  Clock,
  Shuffle,
} from 'lucide-react';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import { learningApi } from '@/services/api';
import type { LearningItem } from '@/types';

type TabKey = 'unspecified' | 'article' | 'tool';

export default function LearningPage() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // key = `${id}` 或 `${id}-${overrideType}`
  const [converting, setConverting] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<TabKey>('unspecified');

  const loadItems = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await learningApi.list();
      const safeData = (Array.isArray(data) ? data : []).map((item: LearningItem) => ({
        ...item,
        key_points: Array.isArray(item.key_points) ? item.key_points : [],
        ai_tags: Array.isArray(item.ai_tags) ? item.ai_tags : [],
      }));
      setItems(safeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  // 如果有 AI 未就绪且类型已明确的条目，每 5 秒轮询一次
  // unspecified 条目不会被后台 AI 处理，不必轮询（节省资源）
  useEffect(() => {
    const hasPending = items.some(
      (i) =>
        !i.is_ready &&
        !i.is_converted &&
        i.item_type !== 'unspecified'
    );
    if (!hasPending) return;
    const timer = setTimeout(() => {
      loadItems(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [items]);

  const handleConvert = async (id: number, overrideType?: 'article' | 'tool') => {
    const key = overrideType ? `${id}-${overrideType}` : `${id}`;
    setConverting((prev) => ({ ...prev, [key]: true }));
    try {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      const body: Record<string, unknown> = {};
      if (overrideType) body.item_type = overrideType;
      if (item.ai_summary) body.ai_summary = item.ai_summary;
      if (item.key_points && item.key_points.length > 0) body.key_points = item.key_points;
      if (item.ai_tags && item.ai_tags.length > 0) body.ai_tags = item.ai_tags;
      if (item.tool_description) body.tool_description = item.tool_description;

      await learningApi.convert(id, body as Parameters<typeof learningApi.convert>[1]);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '转换失败');
    } finally {
      setConverting((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleEnrich = async (id: number) => {
    try {
      await learningApi.enrich(id);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await learningApi.delete(id);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 按类型分桶：严格三态区分，unspecified 不混入 article
  const unspecifiedItems = items.filter((i) => i.item_type === 'unspecified');
  const articleItems = items.filter((i) => i.item_type === 'article');
  const toolItems = items.filter((i) => i.item_type === 'tool');
  const tabItems: LearningItem[] =
    activeTab === 'unspecified'
      ? unspecifiedItems
      : activeTab === 'article'
        ? articleItems
        : toolItems;

  const unspecifiedPendingCount = unspecifiedItems.filter((i) => !i.is_converted).length;
  const articlePendingCount = articleItems.filter((i) => !i.is_ready && !i.is_converted).length;
  const toolPendingCount = toolItems.filter((i) => !i.is_ready && !i.is_converted).length;

  const renderUnspecifiedCard = (item: LearningItem) => {
    const articleKey = `${item.id}-article`;
    const toolKey = `${item.id}-tool`;
    const busyArticle = !!converting[articleKey];
    const busyTool = !!converting[toolKey];
    let domain = '';
    try {
      domain = new URL(item.source_url).hostname;
    } catch {}
    return (
      <div
        key={item.id}
        className="rounded-lg border border-border bg-card p-4 hover:border-purple-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm line-clamp-2 flex-1">{item.title}</h3>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs">
            <Shuffle className="h-3 w-3" />
            待分类
          </span>
        </div>
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary truncate block mb-3"
        >
          {item.source_url}
        </a>

        {/* 待分类提示：AI 暂未生成，等用户选择类型后同步生成 */}
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 mb-3">
          <div className="text-xs text-purple-700">
            🗂️ 尚未选择归档类型，转正时 AI 会按所选类型同步生成内容
          </div>
        </div>

        {/* 通用标签兜底展示（即便 unspecified 也可能用户未来手动编辑——此处不渲染空标签，省区域） */}

        {item.is_converted && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 mb-3">
            <div className="text-xs text-green-700">
              ✅ 已转为{item.item_type === 'tool' ? '工具' : '卡片'}
              {item.converted_id && ` #${item.converted_id}`}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(item.created_at)}
            {domain ? <span className="opacity-60">· {domain}</span> : null}
          </span>
          <div className="flex items-center gap-2">
            {!item.is_converted && (
              <>
                <button
                  onClick={() => handleConvert(item.id, 'article')}
                  disabled={busyArticle || busyTool}
                  className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  title="以知识卡片形式转正"
                >
                  {busyArticle ? '...' : '📄 转为知识卡片'}
                </button>
                <button
                  onClick={() => handleConvert(item.id, 'tool')}
                  disabled={busyArticle || busyTool}
                  className="text-xs px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-50"
                  title="以工具形式转正"
                >
                  {busyTool ? '...' : '🔧 转为工具'}
                </button>
              </>
            )}
            <DeleteConfirmButton
              onConfirm={() => handleDelete(item.id)}
              buttonClassName="text-xs px-2 py-1 rounded border border-border hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
              buttonTitle="删除"
              confirmText="确认删除这个条目吗？"
            >
              删除
            </DeleteConfirmButton>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📥 暂存区</h1>
          <p className="text-sm text-muted-foreground mt-1">
            快速收藏的内容在此排队，AI 后台生成摘要和标签，读完后转为卡片或工具
          </p>
        </div>
        <button onClick={() => loadItems()} className="button button-outline">
          🔄 刷新
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
          <button
            onClick={() => setError('')}
            className="ml-2 text-red-500 hover:underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* Tab 切换：待分类 / 知识卡片 / 工具 */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton
          active={activeTab === 'unspecified'}
          onClick={() => setActiveTab('unspecified')}
          icon={<Shuffle className="h-4 w-4" />}
          label="待分类"
          count={unspecifiedItems.length}
          pending={unspecifiedPendingCount}
        />
        <TabButton
          active={activeTab === 'article'}
          onClick={() => setActiveTab('article')}
          icon={<FileText className="h-4 w-4" />}
          label="知识卡片"
          count={articleItems.length}
          pending={articlePendingCount}
        />
        <TabButton
          active={activeTab === 'tool'}
          onClick={() => setActiveTab('tool')}
          icon={<Wrench className="h-4 w-4" />}
          label="工具"
          count={toolItems.length}
          pending={toolPendingCount}
        />
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
          <p>加载中...</p>
        </div>
      )}

      {!loading && tabItems.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">
            {activeTab === 'unspecified'
              ? '🗂️'
              : activeTab === 'article'
                ? '📭'
                : '🧰'}
          </div>
          <p>
            {activeTab === 'unspecified'
              ? '暂无需分类的内容'
              : activeTab === 'article'
                ? '暂存区还没有知识类内容'
                : '暂存区还没有工具类内容'}
          </p>
          <p className="text-sm mt-2">
            {activeTab === 'unspecified'
              ? '通过⭐️书签或 FlowShelf 书签小按钮收藏的内容会出现在这里，等你选择归档类型'
              : `点击浏览器扩展图标，快速收藏${activeTab === 'article' ? '文章' : '工具'}到这里`}
          </p>
        </div>
      )}

      {/* 待分类 tab：列表视图 + 双按钮 */}
      {!loading && tabItems.length > 0 && activeTab === 'unspecified' && (
        <div className="grid gap-4 md:grid-cols-2">
          {tabItems.map((item) => renderUnspecifiedCard(item))}
        </div>
      )}

      {/* 知识卡片 tab：原卡片布局，保持单按钮 */}
      {!loading && tabItems.length > 0 && activeTab === 'article' && (
        <div className="grid gap-4 md:grid-cols-2">
          {tabItems.map((item) => (
            <div key={item.id} className="card overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm line-clamp-2 flex-1">
                    {item.title}
                  </h3>
                </div>

                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary truncate block mb-3"
                >
                  {item.source_url}
                </a>

                {!item.is_ready && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
                    <div className="text-xs text-amber-700 flex items-center gap-2">
                      <span className="inline-block animate-pulse">⏳</span>
                      AI 正在生成摘要和标签...
                    </div>
                    <button
                      onClick={() => handleEnrich(item.id)}
                      className="text-xs text-amber-600 hover:underline mt-1"
                    >
                      手动触发生成
                    </button>
                  </div>
                )}

                {item.is_ready && item.ai_summary && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {item.ai_summary}
                  </p>
                )}

                {item.is_ready && item.key_points && item.key_points.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      关键观点
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {item.key_points.slice(0, 3).map((kp, i) => (
                        <li key={i} className="line-clamp-1">
                          • {kp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.is_ready && item.ai_tags && item.ai_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {item.ai_tags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {item.is_converted && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 mb-3">
                    <div className="text-xs text-green-700">
                      ✅ 已转为{item.item_type === 'tool' ? '工具' : '卡片'}
                      {item.converted_id && ` #${item.converted_id}`}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(item.created_at)}
                  </span>
                  <div className="flex items-center gap-2">
                    {!item.is_converted && (
                      <button
                        onClick={() => handleConvert(item.id)}
                        disabled={!!converting[`${item.id}`]}
                        className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {converting[`${item.id}`] ? '转换中...' : '转为正式'}
                      </button>
                    )}
                    <DeleteConfirmButton
                      onConfirm={() => handleDelete(item.id)}
                      buttonClassName="text-xs px-2 py-1 rounded border border-border hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                      buttonTitle="删除"
                      confirmText="确认删除这个条目吗？"
                    >
                      删除
                    </DeleteConfirmButton>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 工具 tab：原工具列表，保持单按钮 */}
      {!loading && tabItems.length > 0 && activeTab === 'tool' && (
        <div className="space-y-2">
          {tabItems.map((item) => {
            let domain = '';
            try {
              domain = new URL(item.source_url).hostname;
            } catch {
              domain = '';
            }
            const faviconUrl = domain
              ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
              : '';

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
                  {faviconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={faviconUrl}
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5 rounded-sm"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const sibling = (e.currentTarget.parentElement?.querySelector('.fallback-icon')) as HTMLElement | null;
                        if (sibling) sibling.style.display = 'block';
                      }}
                    />
                  ) : null}
                  <Wrench
                    className="fallback-icon h-5 w-5 text-muted-foreground"
                    style={{ display: faviconUrl ? 'none' : 'block' }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium hover:text-primary transition-colors"
                    title={item.title}
                  >
                    {item.title}
                  </a>
                  {domain && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {domain}
                    </span>
                  )}
                </div>

                {!item.is_ready && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs">
                    <span className="animate-pulse">⏳</span>
                    生成中
                  </span>
                )}

                {item.is_converted && (
                  <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs">
                    ✅ 已转工具
                    {item.converted_id && ` #${item.converted_id}`}
                  </span>
                )}

                <div className="hidden sm:flex shrink-0 items-center gap-1">
                  {(item.ai_tags || []).slice(0, 3).map((tag, i) => (
                    <span key={i} className="badge badge-secondary text-xs">
                      {tag}
                    </span>
                  ))}
                </div>

                <span className="hidden lg:flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(item.created_at)}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  {!item.is_ready && (
                    <button
                      onClick={() => handleEnrich(item.id)}
                      className="rounded px-2 py-1 text-xs hover:bg-amber-50 hover:text-amber-600 transition-colors"
                      title="手动触发生成"
                    >
                      生成
                    </button>
                  )}
                  {!item.is_converted && (
                    <button
                      onClick={() => handleConvert(item.id)}
                      disabled={!!converting[`${item.id}`]}
                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      title="转为正式工具"
                    >
                      {converting[`${item.id}`] ? '...' : '转为正式'}
                    </button>
                  )}
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1.5 hover:bg-muted transition-colors"
                    title="打开来源"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                  <DeleteConfirmButton
                    onConfirm={() => handleDelete(item.id)}
                    buttonClassName="rounded p-1.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                    buttonTitle="删除"
                    confirmText="确认删除这个条目吗？"
                  >
                    <Trash2 className="h-4 w-4" />
                  </DeleteConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  pending?: number;
}

function TabButton({ active, onClick, icon, label, count, pending }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
      {pending && pending > 0 ? (
        <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-medium">
          {pending}
        </span>
      ) : null}
    </button>
  );
}
