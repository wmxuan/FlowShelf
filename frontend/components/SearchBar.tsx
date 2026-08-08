'use client';

import { Search, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SearchBarProps {
  /** input 内占位提示（根据资源类型定制） */
  placeholder: string;
  /** 受控值：搜索关键词（submit 后的值） */
  searchQuery: string;
  /** searchInput onChange */
  onInputChange: (val: string) => void;
  /** 提交时（按钮或回车）把 input 提交为 query */
  onSubmit: (inputVal: string) => void;
  /** 清除搜索（把 searchQuery 和 input 都清空） */
  onClear: () => void;
  /** 受控 input 值（searchInput） */
  searchInput: string;
  className?: string;
}

/**
 * 通用搜索框：Search 图标 + input + 清除按钮 + 提交按钮。
 * 与 cards/page.tsx / toolbox/page.tsx 原搜索框 CSS 完全一致，逻辑：
 *   - input value = searchInput（受控），onChange 调 onInputChange
 *   - 提交按钮/回车 onSubmit(searchInput)
 *   - 右侧清除按钮在有值时显示，onClick 调 onClear
 *   - 提交按钮在 searchInput 为空时 disabled
 */
export default function SearchBar({
  placeholder,
  searchQuery,
  onInputChange,
  onSubmit,
  onClear,
  searchInput,
  className = '',
}: SearchBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(searchInput);
  };

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder}
          className="input pl-9 pr-9"
        />
        {searchInput && (
          <button
            type="button"
            onClick={onClear}
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
  );
}

/**
 * 搜索状态提示条：显示「搜索「xxx」找到 N 个结果」+ 清除按钮。
 * 仅在 isSearching=true 时渲染。
 */
export function SearchStatus({
  searchQuery,
  resultCount,
  onClear,
  unit = '条',
}: {
  searchQuery: string;
  resultCount: number;
  onClear: () => void;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>
        搜索「<span className="font-medium text-foreground">{searchQuery}</span>」
        找到 {resultCount} {unit}
      </span>
      <button onClick={onClear} className="badge badge-secondary hover:bg-muted">
        清除搜索
      </button>
    </div>
  );
}
