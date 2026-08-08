'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Tag, Calendar, Sparkles, ExternalLink, Trash2, Search, X, Plus } from 'lucide-react';
import { cardsApi, searchApi } from '@/services/api';
import type { Card, SearchResult, TagCount } from '@/types';
import AddCardModal from '@/components/AddCardModal';
import CardDetailModal from '@/components/CardDetailModal';
import DeleteConfirmButton from '@/components/DeleteConfirmButton';

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
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const isSearching = searchQuery.trim().length > 0;

  // 搜索态走 searchApi（混合检索），非搜索态走 cardsApi.list（标签筛选）
  const fetchCards = async (tag?: string, query?: string) => {
    setIsLoading(true);
    try {
      if (query && query.trim()) {
        const resp = await searchApi.semantic(query.trim(), 'cards', 50);
        setCards(resp.results.map(adaptSearchResultToCard));
      } else {
        const data = await cardsApi.list({
          limit: 50,
          tag: tag || undefined,
        });
        setCards(data);
      }
    } catch (err) {
      console.error('获取卡片失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const data = await cardsApi.tags();
      setAllTags(data);
    } catch (err) {
      console.error('获取标签失败:', err);
    }
  };

  // 搜索优先：有搜索词走 searchApi（忽略标签筛选），无搜索词走标签筛选
  useEffect(() => {
    fetchCards(isSearching ? undefined : activeTag || undefined, isSearching ? searchQuery.trim() : undefined);
  }, [activeTag, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await cardsApi.delete(id);
      fetchCards(
        isSearching ? undefined : activeTag || undefined,
        isSearching ? searchQuery.trim() : undefined
      );
      fetchTags();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  const handleUpdated = (updated: Card) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedCard(updated);
    fetchTags();
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
        <button
          onClick={() => setShowAddModal(true)}
          className="button button-primary"
        >
          <Plus className="mr-2 h-4 w-4" />
          新增卡片
        </button>
      </div>

      {/* 搜索框 */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="在卡片库中搜索（标题 / 标签 / 摘要）"
            className="input pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted transition-colors"
              title="清除搜索"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <button type="submit" className="button button-primary" disabled={!searchInput.trim()}>
          搜索
        </button>
      </form>

      {/* 搜索状态提示 */}
      {isSearching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            搜索「<span className="font-medium text-foreground">{searchQuery}</span>」
            找到 {cards.length} 张卡片
          </span>
          <button onClick={clearSearch} className="badge badge-secondary hover:bg-muted">
            清除搜索
          </button>
        </div>
      )}

      {/* 标签筛选（搜索时隐藏，搜索优先） */}
      {allTags.length > 0 && !isSearching && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <Tag className="h-4 w-4" />
            筛选标签：
          </span>
          <button
            onClick={() => setActiveTag(null)}
            className={`badge ${!activeTag ? 'badge-primary' : 'badge-secondary'}`}
          >
            全部
          </button>
          {(showAllTags ? allTags : allTags.slice(0, 15)).map((t) => (
            <button
              key={t.name}
              onClick={() => setActiveTag(t.name === activeTag ? null : t.name)}
              className={`badge ${t.name === activeTag ? 'badge-primary' : 'badge-secondary'}`}
            >
              {t.name}
              <span className="ml-1 opacity-60">{t.count}</span>
            </button>
          ))}
          {allTags.length > 15 && (
            <button
              onClick={() => setShowAllTags(!showAllTags)}
              className="badge badge-secondary"
            >
              {showAllTags ? '收起' : `+${allTags.length - 15} 更多`}
            </button>
          )}
        </div>
      )}

      {/* 卡片列表 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="mb-4 h-4 w-3/4 bg-muted rounded" />
              <div className="space-y-2">
                <div className="h-3 w-full bg-muted rounded" />
                <div className="h-3 w-5/6 bg-muted rounded" />
                <div className="h-3 w-4/6 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {isSearching ? (
              <Search className="h-8 w-8 text-primary" />
            ) : (
              <FileText className="h-8 w-8 text-primary" />
            )}
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {isSearching ? '没有匹配的卡片' : '还没有卡片'}
          </h3>
          <p className="text-muted-foreground mb-4">
            {isSearching
              ? '换个关键词试试，或清除搜索查看全部卡片'
              : '输入一个 URL，让 AI 为你生成第一张知识卡片'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className="card group cursor-pointer"
              onClick={() => setSelectedCard(card)}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="card-title line-clamp-2 flex-1">
                  {card.title}
                </h3>
                <div className="flex items-center gap-1">
                  <Link
                    href={card.source_url}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-1 hover:bg-muted transition-colors"
                    title="查看原文"
                  >
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
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {card.ai_summary}
                </p>
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
                    <span key={i} className="badge badge-secondary text-xs">
                      {tag}
                    </span>
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
      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdated={handleUpdated}
      />

      {/* 新增卡片弹窗 */}
      <AddCardModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={() => {
          fetchCards(
            isSearching ? undefined : activeTag || undefined,
            isSearching ? searchQuery.trim() : undefined
          );
          fetchTags();
        }}
      />
    </div>
  );
}