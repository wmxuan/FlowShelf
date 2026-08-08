'use client';

import { useState } from 'react';
import { FileText, Search, Plus } from 'lucide-react';
import { cardsApi } from '@/services/api';
import type { Card, SearchResult, TagCount } from '@/types';
import AddItemModal from '@/components/AddItemModal';
import SearchBar, { SearchStatus } from '@/components/SearchBar';
import TagFilter from '@/components/TagFilter';
import { EmptyState, CardGridSkeleton } from '@/components/StateDisplays';
import { useListPage } from '@/hooks/useListPage';
import KnowledgeCard, { KnowledgeCardActions } from '@/components/cards/KnowledgeCard';
import KnowledgeDetailModal from '@/components/cards/KnowledgeDetailModal';
import { adaptCard, type KnowledgeCardData } from '@/components/cards/shared';

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
  const [selectedCard, setSelectedCard] = useState<KnowledgeCardData | null>(null);
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

  const handleView = (data: KnowledgeCardData) => {
    setSelectedCard(data);
  };

  const handleUpdated = (updated: { id: number; source: 'learning' | 'cards'; title: string; source_url: string; ai_summary: string; key_points: string[]; ai_tags: string[]; created_at: string }) => {
    list.setItems((prev) =>
      prev.map((c) =>
        c.id === updated.id
          ? {
              ...c,
              title: updated.title,
              source_url: updated.source_url,
              ai_summary: updated.ai_summary,
              key_points: updated.key_points,
              ai_tags: updated.ai_tags,
            }
          : c
      )
    );
    // 同步更新弹窗内数据
    setSelectedCard((prev) =>
      prev && prev.id === updated.id
        ? { ...prev, title: updated.title, ai_summary: updated.ai_summary, key_points: updated.key_points, ai_tags: updated.ai_tags }
        : prev
    );
    refreshTags();
  };

  // 构建卡片 actions（知识库不暴露 AI 重新生成，仅在弹窗内编辑）
  const cardActions: KnowledgeCardActions = {
    onView: handleView,
    onDelete: (id) => handleDelete(id),
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
        onSubmit={(val) => setSearchQuery(val)}
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
            <KnowledgeCard
              key={card.id}
              data={adaptCard(card)}
              actions={cardActions}
            />
          ))}
        </div>
      )}

      {/* 详情/编辑弹窗 */}
      <KnowledgeDetailModal
        data={selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdated={handleUpdated}
      />

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
