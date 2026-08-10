'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Sparkles, Loader2, Bookmark, Wrench, FileText } from 'lucide-react';
import { cardsApi, toolsApi } from '@/services/api';
import Modal from './Modal';

// ============ 类型定义 ============

type AddItemKind = 'card' | 'tool';

/** 单个可编辑字段的 schema */
interface FieldSpec {
  /** 字段唯一 ID（用于 editFields 状态键） */
  id: string;
  /** UI 标签（带 emoji） */
  label: string;
  /** text 或 textarea */
  type: 'text' | 'textarea';
  /** textarea 最小高度（px） */
  minHeightPx?: number;
  /** placeholder */
  placeholder?: string;
  /** 预览时对应的 AI 返回字段 key（若为 key_points 则 join('\n')） */
  previewKey?: string;
}

interface AddItemKindConfig {
  kind: AddItemKind;
  /** 弹窗标题前图标 */
  headerIcon: ReactNode;
  /** 弹窗标题文字 */
  headerTitle: string;
  /** URL input label */
  urlLabel: string;
  /** URL input placeholder */
  urlPlaceholder: string;
  /** AI 生成按钮初始文字 */
  generateBtnInit: string;
  /** AI 生成按钮已生成后的文字 */
  generateBtnRegen: string;
  /** AI 生成 loading 时描述 */
  generateLoadingText: string;
  /** AI 生成 loading 时副标题 */
  generateLoadingSub: string;
  /** 未生成时空状态主文案 */
  emptyPrompt: string;
  /** 未生成时空状态副标题 */
  emptySub: string;
  /** 保存按钮图标 */
  saveIcon: ReactNode;
  /** 保存按钮文字 */
  saveBtnText: string;
  /** 可编辑字段配置 */
  fields: FieldSpec[];
  /** AI generate API */
  generateApi: (url: string) => Promise<Record<string, unknown>>;
  /**
   * 把 editFields 状态 + preview 标签 + preview 原始数据 → 保存 API。
   * 逻辑与各自 Modal 中的 handleSave 完全一致。
   * preview 是 generateApi 返回的原始对象，用于 save 时取 AI 生成兜底值（如标题）。
   */
  saveApi: (url: string, editFields: Record<string, string>, tags: string[], preview: Record<string, unknown> | null) => Promise<void>;
}

// ============ 两种类型的配置 ============

const CARD_CONFIG: AddItemKindConfig = {
  kind: 'card',
  headerIcon: <Bookmark className="h-5 w-5 text-primary" />,
  headerTitle: '新增卡片',
  urlLabel: '网页 URL',
  urlPlaceholder: 'https://example.com/article',
  generateBtnInit: 'AI 生成卡片',
  generateBtnRegen: '重新生成',
  generateLoadingText: '正在分析文章内容，生成卡片信息...',
  generateLoadingSub: '标题 / 摘要 / 关键观点 / 标签',
  emptyPrompt: '输入 URL 并点击「AI 生成卡片」',
  emptySub: 'AI 将自动生成标题、摘要、关键观点与标签',
  saveIcon: <FileText className="mr-2 h-4 w-4" />,
  saveBtnText: '保存为卡片',
  fields: [
    { id: 'title', label: '📌 标题', type: 'text', previewKey: 'title' },
    { id: 'summary', label: '📝 摘要', type: 'textarea', minHeightPx: 100, previewKey: 'summary' },
    { id: 'key_points', label: '💡 关键观点（每行一条）', type: 'textarea', minHeightPx: 120, placeholder: '每行一条观点', previewKey: 'key_points' },
  ],
  generateApi: async (url) => {
    const r = await cardsApi.generate(url);
    return r as unknown as Record<string, unknown>;
  },
  saveApi: async (url, editFields, tags, preview) => {
    const keyPoints = editFields.key_points
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    // 标题优先级：用户编辑 > AI 生成预览 > 空兜底
    const p = preview as { title?: string; summary?: string } | null;
    await cardsApi.create(url, {
      title: editFields.title.trim() || p?.title || url,
      summary: editFields.summary.trim() || p?.summary || '',
      key_points: keyPoints,
      tags: tags,
    });
  },
};

const TOOL_CONFIG: AddItemKindConfig = {
  kind: 'tool',
  headerIcon: <Wrench className="h-5 w-5 text-primary" />,
  headerTitle: '添加工具',
  urlLabel: '工具 URL',
  urlPlaceholder: 'https://example.com',
  generateBtnInit: 'AI 创建工具',
  generateBtnRegen: '重新生成',
  generateLoadingText: '正在分析页面内容，生成工具信息...',
  generateLoadingSub: '名称 / 描述 / 标签',
  emptyPrompt: '输入 URL 并点击「AI 创建工具」',
  emptySub: 'AI 将自动识别工具并生成名称、描述与标签',
  saveIcon: <Wrench className="mr-2 h-4 w-4" />,
  saveBtnText: '保存为工具',
  fields: [
    { id: 'title', label: '工具名称', type: 'text', previewKey: 'title' },
    { id: 'description', label: '工具描述', type: 'textarea', minHeightPx: 80, placeholder: '工具用途说明', previewKey: 'description' },
  ],
  generateApi: async (url) => {
    const r = await toolsApi.generate(url);
    return r as unknown as Record<string, unknown>;
  },
  saveApi: async (url, editFields, tags, _preview) => {
    await toolsApi.create(url, editFields.title.trim() || url, editFields.description.trim() || undefined, tags);
  },
};

function getConfig(kind: AddItemKind): AddItemKindConfig {
  return kind === 'card' ? CARD_CONFIG : TOOL_CONFIG;
}

// ============ 组件 Props ============

interface AddItemModalProps {
  kind: AddItemKind;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * 通用新增资源弹窗：合并 AddCardModal + AddToolModal。
 *
 * 两者重复度 >90%，仅通过 `kind` 配置切换：
 *   - UI 文案（标题、按钮、占位符、loading 提示）
 *   - 可编辑字段（cards: 3 个 fields，tools: 2 个 fields）
 *   - generate / save API 调用
 *
 * 逻辑与原两个 Modal 完全一致：
 *   1. open 时重置全部状态
 *   2. handleGenerate: 校验 URL → generateApi → 同步 editFields + hasGenerated
 *   3. handleSave: 解析 key_points（cards 专属）→ saveApi → onCreated → onClose
 *   4. Enter（非 shift）在未生成时触发 generate
 *   5. ESC + 点击外部关闭（通过 Modal 组件）
 *   6. loading 态、空状态、预览编辑态（带 AI 标签只读）
 */
export default function AddItemModal({ kind, open, onClose, onCreated }: AddItemModalProps) {
  const config = getConfig(kind);

  const [url, setUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewTags, setPreviewTags] = useState<string[]>([]);

  // 可编辑字段：初始空，AI 生成后同步；用户直接编辑
  const [editFields, setEditFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    config.fields.forEach((f) => (init[f.id] = ''));
    return init;
  });

  // 打开时重置所有状态（与原 AddCardModal useEffect 完全一致）
  useEffect(() => {
    if (!open) return;
    setUrl('');
    setIsGenerating(false);
    setIsSaving(false);
    setError(null);
    setPreview(null);
    setPreviewTags([]);
    setHasGenerated(false);
    const init: Record<string, string> = {};
    config.fields.forEach((f) => (init[f.id] = ''));
    setEditFields(init);
  }, [open, config]);

  const handleGenerate = useCallback(async () => {
    if (!url.trim()) {
      setError('请输入有效的 URL');
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const result = await config.generateApi(url);
      // 同步到可编辑字段 + 预览 tags
      setPreview(result);
      const tags = Array.isArray(result.tags) ? (result.tags as string[]) : [];
      setPreviewTags(tags);
      const newEdit: Record<string, string> = { ...editFields };
      config.fields.forEach((f) => {
        const val = f.previewKey ? result[f.previewKey] : undefined;
        if (f.id === 'key_points') {
          newEdit[f.id] = Array.isArray(val) ? (val as string[]).join('\n') : '';
        } else if (typeof val === 'string') {
          newEdit[f.id] = val;
        } else if (val != null) {
          newEdit[f.id] = String(val);
        } else {
          newEdit[f.id] = '';
        }
      });
      setEditFields(newEdit);
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  }, [url, config, editFields]);

  const handleSave = useCallback(async () => {
    if (!url.trim() || !preview) return;
    setIsSaving(true);
    setError(null);
    try {
      await config.saveApi(url, editFields, previewTags, preview);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }, [url, preview, config, editFields, previewTags, onCreated, onClose]);

  // Enter 触发 generate（已生成后 Enter 不会触发）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !hasGenerated) {
      e.preventDefault();
      handleGenerate();
    }
  };

  if (!open) return null;

  const busy = isGenerating || isSaving;

  // 头部
  const header = (
    <h2 className="flex items-center gap-2 text-xl font-bold">
      {config.headerIcon}
      {config.headerTitle}
    </h2>
  );

  // 底部
  const footer = (
    <>
      <button onClick={onClose} className="button button-outline">
        取消
      </button>
      <button onClick={handleSave} disabled={busy || !preview} className="button button-primary">
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            保存中...
          </>
        ) : (
          <>
            {config.saveIcon}
            {config.saveBtnText}
          </>
        )}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} header={header} footer={footer}>
      {/* URL 输入区（内容区顶部，保持原 flex-shrink-0 语义） */}
      <div>
        <label className="label mb-2 block">{config.urlLabel}</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={config.urlPlaceholder}
            className="input flex-1"
            disabled={busy}
          />
          <button
            onClick={handleGenerate}
            disabled={busy || !url.trim()}
            className="button button-primary"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {hasGenerated ? config.generateBtnRegen : config.generateBtnInit}
              </>
            )}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {/* 预览区：下方滚动区域，原代码 mt-5 */}
      <div className="mt-5">
        {isGenerating ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center text-muted-foreground">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">{config.generateLoadingText}</p>
            <p className="mt-1 text-xs">{config.generateLoadingSub}</p>
          </div>
        ) : !hasGenerated ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center text-muted-foreground">
            <Sparkles className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">{config.emptyPrompt}</p>
            <p className="mt-1 text-xs">{config.emptySub}</p>
          </div>
        ) : preview ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 生成预览（可编辑）
            </h3>
            <div className="space-y-4">
              {config.fields.map((field) => (
                <div key={field.id}>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    {field.label}
                  </h4>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={editFields[field.id] || ''}
                      onChange={(e) =>
                        setEditFields((p) => ({ ...p, [field.id]: e.target.value }))
                      }
                      className={`input min-h-[${field.minHeightPx || 100}px] resize-y`}
                      placeholder={field.placeholder}
                      disabled={isSaving}
                    />
                  ) : (
                    <input
                      type="text"
                      value={editFields[field.id] || ''}
                      onChange={(e) =>
                        setEditFields((p) => ({ ...p, [field.id]: e.target.value }))
                      }
                      className="input"
                      disabled={isSaving}
                    />
                  )}
                </div>
              ))}

              {/* 标签：始终只读（AI 生成）*/}
              <div>
                <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                  🏷️ 标签（AI 生成）
                </h4>
                <div className="flex flex-wrap gap-2">
                  {previewTags.length > 0 ? (
                    previewTags.map((tag, i) => (
                      <span key={i} className="badge badge-secondary">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">AI 未返回标签</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
