'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Tag, Calendar, Sparkles, ExternalLink, Trash2 } from 'lucide-react';
import { cardsApi } from '@/services/api';
import type { Card } from '@/types';
import URLInput from '@/components/URLInput';

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const fetchCards = async (tag?: string) => {
    setIsLoading(true);
    try {
      const data = await cardsApi.list({ limit: 50, tag: tag || undefined });
      setCards(data);
    } catch (err) {
      console.error('获取卡片失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCards(activeTag || undefined);
  }, [activeTag]);

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这张卡片吗？')) return;
    try {
      await cardsApi.delete(id);
      fetchCards(activeTag || undefined);
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  // 提取所有标签
  const allTags = Array.from(
    new Set(cards.flatMap((c) => c.ai_tags || []))
  ).sort();

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
      </div>

      {/* URL 输入 */}
      <URLInput onCardCreated={() => fetchCards(activeTag || undefined)} />

      {/* 标签筛选 */}
      {allTags.length > 0 && (
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
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`badge ${tag === activeTag ? 'badge-primary' : 'badge-secondary'}`}
            >
              {tag}
            </button>
          ))}
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
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">还没有卡片</h3>
          <p className="text-muted-foreground mb-4">
            输入一个 URL，让 AI 为你生成第一张知识卡片
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <div key={card.id} className="card group">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="card-title line-clamp-2 flex-1">
                  {card.title}
                </h3>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    href={card.source_url}
                    target="_blank"
                    className="rounded p-1 hover:bg-muted transition-colors"
                    title="查看原文"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  <button
                    onClick={() => handleDelete(card.id)}
                    className="rounded p-1 hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
    </div>
  );
}