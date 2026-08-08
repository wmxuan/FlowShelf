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
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'card' | 'tool'>('all');
  const autoRan = useRef(false);

  const handleSearch = async (q?: string) => {
    const searchTerm = (q ?? query).trim();
    if (!searchTerm) return;

    setIsLoading(true);
    setHasSearched(true);
    setActiveTab('all');

    try {
      // 始终以 all 拉取，分类在前端按 result.type 分桶
      const data = await searchApi.semantic(searchTerm, 'all', 20);
      setResults(data.results);
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
      handleSearch(initialQ);
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

  // 按 result.type 分桶，前端过滤（不混杂）
  const cardResults = results.filter((r) => r.type === 'card');
  const toolResults = results.filter((r) => r.type === 'tool');
  const filteredResults =
    activeTab === 'all' ? results : activeTab === 'card' ? cardResults : toolResults;

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

        </div>
      </div>

      {/* 搜索结果 */}
      {hasSearched && !isLoading && (
        <div className="space-y-4">
          {/* Tab 切换：全部 / 知识卡片 / 工具 —— 前端按 result.type 分桶，不混杂 */}
          {results.length > 0 && (
            <div className="flex items-center gap-1 border-b border-border">
              <TabButton
                active={activeTab === 'all'}
                onClick={() => setActiveTab('all')}
                icon={<Search className="h-4 w-4" />}
                label="全部"
                count={results.length}
              />
              <TabButton
                active={activeTab === 'card'}
                onClick={() => setActiveTab('card')}
                icon={<FileText className="h-4 w-4" />}
                label="知识卡片"
                count={cardResults.length}
              />
              <TabButton
                active={activeTab === 'tool'}
                onClick={() => setActiveTab('tool')}
                icon={<Wrench className="h-4 w-4" />}
                label="工具"
                count={toolResults.length}
              />
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            找到 <span className="font-semibold text-foreground">{filteredResults.length}</span> 个相关结果
            {activeTab !== 'all' && results.length > 0 && (
              <span className="ml-1">（共 {results.length} 个）</span>
            )}
          </p>

          {filteredResults.length === 0 ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {results.length === 0 ? '没有找到相关结果' : '当前分类下没有结果'}
              </h3>
              <p className="text-muted-foreground">
                {results.length === 0
                  ? '换个关键词试试，或者先去收藏一些内容'
                  : '切换到其他分类或"全部"查看结果'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResults.map((result, idx) => (
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

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}

function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
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
    </button>
  );
}