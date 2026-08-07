'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Sparkles, ExternalLink, FileText, Wrench, Loader2 } from 'lucide-react';
import { searchApi } from '@/services/api';
import type { SearchResult } from '@/types';

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">加载中...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchType, setSearchType] = useState<'all' | 'cards' | 'tools'>('all');
  const autoRan = useRef(false);

  const handleSearch = async (q?: string, type?: 'all' | 'cards' | 'tools') => {
    const searchTerm = (q ?? query).trim();
    if (!searchTerm) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      const data = await searchApi.semantic(searchTerm, type ?? searchType, 20);
      setResults(data.results);
      setTotal(data.total);
    } catch (err) {
      console.error('搜索失败:', err);
      alert('搜索失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 从 Header 全局搜索跳转来时（URL 带 q），自动执行一次搜索
  useEffect(() => {
    if (autoRan.current) return;
    if (initialQ.trim()) {
      autoRan.current = true;
      handleSearch(initialQ, 'all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const scoreToPercentage = (score: number) => {
    // 将 cosine similarity (-1 到 1) 转换为百分比
    return Math.round((score + 1) * 50);
  };

  return (
    <div className="space-y-8">
      {/* 头部 */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="h-7 w-7 text-primary" />
          AI 语义搜索
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          用自然语言描述你要找的内容，AI 进行语义匹配
        </p>
      </div>

      {/* 搜索框 */}
      <div className="card">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：能去图片背景的网站..."
              className="input flex-1"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSearch()}
              disabled={isLoading || !query.trim()}
              className="button button-primary"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  搜索中
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 搜索
                </>
              )}
            </button>
          </div>

          {/* 搜索类型 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">搜索范围：</span>
            <button
              onClick={() => setSearchType('all')}
              className={`badge ${searchType === 'all' ? 'badge-primary' : 'badge-secondary'}`}
            >
              全部
            </button>
            <button
              onClick={() => setSearchType('cards')}
              className={`badge ${searchType === 'cards' ? 'badge-primary' : 'badge-secondary'}`}
            >
              📚 卡片
            </button>
            <button
              onClick={() => setSearchType('tools')}
              className={`badge ${searchType === 'tools' ? 'badge-primary' : 'badge-secondary'}`}
            >
              🛠️ 工具
            </button>
          </div>
        </div>
      </div>

      {/* 搜索结果 */}
      {hasSearched && !isLoading && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            找到 <span className="font-semibold text-foreground">{total}</span> 个相关结果
          </p>

          {results.length === 0 ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">没有找到相关结果</h3>
              <p className="text-muted-foreground">
                换个关键词试试，或者先去收藏一些内容
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((result, idx) => (
                <div key={idx} className="card flex gap-4">
                  {/* 相关性条 */}
                  <div className="flex flex-col items-center justify-center w-8">
                    <div className="text-xs text-muted-foreground mb-1">
                      {scoreToPercentage(result.score)}%
                    </div>
                    <div className="w-1 h-16 bg-muted rounded-full overflow-hidden">
                      <div
                        className="w-full bg-primary"
                        style={{ height: `${scoreToPercentage(result.score)}%`, marginTop: 'auto' }}
                      />
                    </div>
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {result.type === 'card' ? (
                          <FileText className="h-4 w-4 text-primary" />
                        ) : (
                          <Wrench className="h-4 w-4 text-primary" />
                        )}
                        <h3 className="font-medium truncate">{result.title}</h3>
                      </div>
                      <a
                        href={result.url}
                        target="_blank"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="访问"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>

                    {result.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {result.summary}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {result.tags.map((tag, i) => (
                        <span key={i} className="badge badge-secondary text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 使用说明 */}
      {!hasSearched && (
        <div className="card bg-gradient-to-r from-primary/5 to-primary/10">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            使用提示
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• 用<span className="font-medium">自然语言</span>描述你要找的内容</li>
            <li>• AI 会将你的描述转化为向量，与已保存内容进行<span className="font-medium">语义匹配</span></li>
            <li>• 支持跨卡片库和工具箱的<span className="font-medium">统一搜索</span></li>
            <li>• 例如："我收藏过一个关于 React Server Components 的教程"</li>
          </ul>
        </div>
      )}
    </div>
  );
}