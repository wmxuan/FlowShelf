'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Sparkles, Calendar, ExternalLink, Trash2, Search, Plus } from 'lucide-react';
import { cardsApi } from '@/services/api';
import type { Card, SearchResult, TagCount } from '@/types';
import AddItemModal from '@/components/AddItemModal';
import CardDetailModal from '@/components/CardDetailModal';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';
import SearchBar, { SearchStatus } from '@/components/SearchBar';
import TagFilter from '@/components/TagFilter';
import { EmptyState, CardGridSkeleton } from '@/components/StateDisplays';
import { useListPage } from '@/hooks/useListPage';

// SearchResult → Card 适配层：搜索态用 searchApi 返回的 SearchResult 渲染卡片，
// 这里把搜索结果字段映射回 Card 结构，复用既有卡片渲染逻辑。
const adaptSearchResultToCard = (r: SearchResult): Card => ({
  id: r.id,
  source_url: r.url,
  title: r.title,
  ai_summary: r.summary || '',
  key_points: r.key_points || [],
  ai_tags: r.tags,
  source_type: 'article',
  read_at: null,
  created_at: r.created_at || new Date().toISOString(),
  updated_at: r.created_at || new Date().toISOString(),
});

export default function CardsPage() {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const list = useListPage<Card>({
    fetchList: (opts) =>
      cardsApi.list({ limit: 50, tag: opts.tag, ...(opts.query ? { query: opts.query } : {}) }),
    fetchTags: cardsApi.tags as () => Promise<TagCount[]>,
    adaptSearchResult: adaptSearchResultToCard,
    deleteItem: async (id) => { await cardsApi.delete(id); },
    searchType: 'cards',
  });

  const {
    items: cards,
    isLoading,
    searchInput, setSearchInput, searchQuery, setSearchQuery, isSearching,
    clearSearch,
    allTags, activeTag, setActiveTag,
    handleDelete, refresh, refreshTags,
  } = list;

  const handleUpdated = (updated: Card) => {
    list.setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedCard(updated);
    refreshTags();
  };

  return (
    <div className="space-y-8">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            知识卡片库
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            已沉淀 {cards.length} 张卡片，AI 自动生成摘要和标签
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="button button-primary">
          <Plus className="mr-2 h-4 w-4" />
          新增卡片
        </button>
      </div>

      {/* 搜索框 */}
      <SearchBar
        placeholder="在卡片库中搜索（标题 / 标签 / 摘要）"
        searchQuery={searchQuery}
        searchInput={searchInput}
        onInputChange={setSearchInput}
        onSubmit={(val) => {
          // 对应原 handleSearchSubmit：e.preventDefault() → setSearchQuery(searchInput)
          setSearchQuery(val);
        }}
        onClear={clearSearch}
      />

      {/* 搜索状态提示 */}
      {isSearching && (
        <SearchStatus searchQuery={searchQuery} resultCount={cards.length} onClear={clearSearch} unit="张卡片" />
      )}

      {/* 标签筛选（搜索时隐藏，搜索优先） */}
      {allTags.length > 0 && !isSearching && (
        <TagFilter allTags={allTags as TagCount[]} activeTag={activeTag} onTagChange={setActiveTag} />
      )}

      {/* 卡片列表 */}
      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={isSearching ? <Search className="h-8 w-8 text-primary" /> : <FileText className="h-8 w-8 text-primary" />}
          title={isSearching ? '没有匹配的卡片' : '还没有卡片'}
          description={isSearching ? '换个关键词试试，或清除搜索查看全部卡片' : '输入一个 URL，让 AI 为你生成第一张知识卡片'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <div key={card.id} className="card group cursor-pointer" onClick={() => setSelectedCard(card)}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="card-title line-clamp-2 flex-1">{card.title}</h3>
                <div className="flex items-center gap-1">
                  <Link href={card.source_url} target="_blank" onClick={(e) => e.stopPropagation()}
                    className="rounded p-1 hover:bg-muted transition-colors" title="查看原文">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  <DeleteConfirmButton
                    onConfirm={() => handleDelete(card.id)}
                    buttonClassName="rounded p-1 hover:bg-destructive/10 hover:text-destructive transition-colors"
                    buttonTitle="删除"
                    stopPropagation
                  >
                    <Trash2 className="h-4 w-4" />
                  </DeleteConfirmButton>
                </div>
              </div>

              {/* 摘要 */}
              <div className="mb-3">
                <p className="text-sm text-muted-foreground line-clamp-3">{card.ai_summary}</p>
              </div>

              {/* 关键观点 */}
              {card.key_points && card.key_points.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    关键观点
                  </h4>
                  <ul className="text-xs space-y-1">
                    {card.key_points.slice(0, 2).map((point, i) => (
                      <li key={i} className="text-muted-foreground line-clamp-1">
                        • {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 标签和时间 */}
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(card.ai_tags || []).map((tag, i) => (
                    <span key={i} className="badge badge-secondary text-xs">{tag}</span>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(card.created_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 详情/编辑弹窗 */}
      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} onUpdated={handleUpdated} />

      {/* 新增卡片弹窗 */}
      <AddItemModal
        kind="card"
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={() => { refresh(); refreshTags(); }}
      />
    </div>
  );
}