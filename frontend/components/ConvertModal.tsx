'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Wrench, Loader2, Sparkles, Check } from 'lucide-react';
import Modal from '@/components/Modal';
import { learningApi } from '@/services/api';
import type { LearningItem } from '@/types';

// ============ 类型 ============

type TargetType = 'article' | 'tool';

/** 可编辑字段配置（与 AddItemModal 的 FieldSpec 类同，增加 AI 标注） */
interface FieldSpec {
  id: string;
  label: string;
  type: 'text' | 'textarea';
  rows?: number;
  placeholder?: string;
  /** AI 生成时对应的响应字段 key */
  aiKey?: string;
  /** key_points 特殊处理：数组 → 换行拼接 */
  isArray?: boolean;
}

interface ConvertConfig {
  headerIcon: React.ReactNode;
  fields: FieldSpec[];
}

interface ConvertModalProps {
  open: boolean;
  item: LearningItem | null;
  aiMode: boolean;
  /** 从 unspecified 卡片点击时的预设类型 */
  initialTargetType?: 'article' | 'tool';
  onClose: () => void;
  onConverted: () => void;
}

// ============ 配置 ============

const ARTICLE_CONFIG: ConvertConfig = {
  headerIcon: <FileText className="h-5 w-5 text-blue-600" />,
  fields: [
    { id: 'title', label: '标题', type: 'text', aiKey: 'title' },
    { id: 'summary', label: '摘要', type: 'textarea', rows: 4, placeholder: '请输入摘要...', aiKey: 'summary' },
    { id: 'keyPoints', label: '关键观点', type: 'textarea', rows: 3, placeholder: '每行一条观点...', aiKey: 'key_points', isArray: true },
    { id: 'tags', label: '标签', type: 'text', placeholder: '用逗号分隔，如：React, 前端, 架构', aiKey: 'tags', isArray: true },
  ],
};

const TOOL_CONFIG: ConvertConfig = {
  headerIcon: <Wrench className="h-5 w-5 text-orange-600" />,
  fields: [
    { id: 'title', label: '标题', type: 'text', aiKey: 'title' },
    { id: 'description', label: '描述', type: 'textarea', rows: 4, placeholder: '请输入工具描述...', aiKey: 'description' },
    { id: 'tags', label: '标签', type: 'text', placeholder: '用逗号分隔，如：开发, 调试, 性能', aiKey: 'tags', isArray: true },
  ],
};

function getConfig(type: TargetType): ConvertConfig {
  return type === 'article' ? ARTICLE_CONFIG : TOOL_CONFIG;
}

// ============ 辅助函数 ============

/** 解析标签字符串 → string[] */
function parseTags(raw: string): string[] {
  return raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
}

/** AI 返回值 → editFields 字符串（数组 join 换行/逗号） */
function aiValueToString(val: unknown, isArray?: boolean): string {
  if (isArray && Array.isArray(val)) return val.join(', ');
  if (typeof val === 'string') return val;
  if (val != null) return String(val);
  return '';
}

// ============ 主组件 ============

export default function ConvertModal({ open, item, aiMode, initialTargetType, onClose, onConverted }: ConvertModalProps) {
  const [targetType, setTargetType] = useState<TargetType>('article');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const config = getConfig(targetType);

  // 通用字段状态：{ title, summary, keyPoints, tags } 等
  const [editFields, setEditFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    config.fields.forEach((f) => (init[f.id] = ''));
    return init;
  });

  // item/open 变化时重置
  useEffect(() => {
    if (!item) return;
    const initial = initialTargetType || (item.item_type === 'tool' ? 'tool' : 'article');
    setTargetType(initial);
    setGenerated(false);
    setError('');

    const cfg = getConfig(initial);
    const init: Record<string, string> = { title: item.title };
    cfg.fields.forEach((f) => { if (f.id !== 'title') init[f.id] = ''; });

    // 如果后台已生成 AI 内容，预填充（不再重复调用 AI）
    const hasExistingAi = initial === 'article'
      ? !!(item as { ai_summary?: string }).ai_summary
      : !!(item as { tool_description?: string }).tool_description;

    if (hasExistingAi) {
      if (initial === 'article') {
        const aiItem = item as { ai_summary?: string; key_points?: string[]; ai_tags?: string[] };
        if (aiItem.ai_summary) init.summary = aiItem.ai_summary;
        if (aiItem.key_points?.length) init.keyPoints = aiItem.key_points.join('\n');
        if (aiItem.ai_tags?.length) init.tags = aiItem.ai_tags.join(', ');
      } else {
        const aiItem = item as { tool_description?: string; ai_tags?: string[] };
        if (aiItem.tool_description) init.description = aiItem.tool_description;
        if (aiItem.ai_tags?.length) init.tags = aiItem.ai_tags.join(', ');
      }
      setEditFields(init);
      setGenerated(true);
    } else {
      setEditFields(init);
      // AI 模式：无已有 AI 内容时，自动触发生成
      if (aiMode && (item.item_type !== 'unspecified' || initialTargetType)) {
        triggerGenerate(initial, cfg, init);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, open, initialTargetType]);

  // 切换目标类型
  const handleTargetTypeChange = useCallback((t: TargetType) => {
    setTargetType(t);
    setGenerated(false);
    setError('');
    const cfg = getConfig(t);
    const init: Record<string, string> = { title: item?.title || '' };
    cfg.fields.forEach((f) => { if (f.id !== 'title') init[f.id] = ''; });
    setEditFields(init);
    if (aiMode && item) {
      triggerGenerate(t, cfg, init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMode, item?.id]);

  /** 触发 AI 生成 */
  const triggerGenerate = async (type: TargetType, cfg?: ConvertConfig, fields?: Record<string, string>) => {
    if (!item) return;
    const usedCfg = cfg || getConfig(type);
    const usedFields = fields || editFields;
    setGenerating(true);
    setError('');
    const startTime = Date.now();
    try {
      const result = await learningApi.aiGenerate(item.id, type) as Record<string, unknown>;
      const newFields: Record<string, string> = { ...usedFields };
      usedCfg.fields.forEach((f) => {
        if (f.aiKey && result[f.aiKey] != null) {
          newFields[f.id] = aiValueToString(result[f.aiKey], f.isArray);
        }
      });
      setEditFields(newFields);
      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 生成失败');
    } finally {
      // 保证 generating 状态至少展示 800ms，避免瞬间失败时 UI 闪烁
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((r) => setTimeout(r, 800 - elapsed));
      }
      setGenerating(false);
    }
  };

  /** 确认转换 */
  const handleConfirm = async () => {
    if (!item) return;
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = { item_type: targetType };
      // 按 field spec 映射到后端字段名
      if (targetType === 'article') {
        body.title = editFields.title;
        body.ai_summary = editFields.summary;
        body.key_points = editFields.keyPoints.split('\n').map((s) => s.trim()).filter(Boolean);
        body.ai_tags = parseTags(editFields.tags);
      } else {
        body.title = editFields.title;
        body.tool_description = editFields.description;
        body.ai_tags = parseTags(editFields.tags);
      }
      await learningApi.convert(item.id, body as Parameters<typeof learningApi.convert>[1]);
      onConverted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '转换失败');
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  const formDisabled = saving || generating;
  const hasContent = editFields.title?.trim() || editFields.summary?.trim() || editFields.description?.trim();
  // AI 模式：AI 生成成功后可保存；AI 失败后用户手动填写内容也可保存
  // 基础模式：有内容即可保存
  const canSave = !formDisabled && (aiMode ? (generated || !!hasContent) : !!hasContent);

  return (
    <Modal
      open={open}
      onClose={onClose}
      header={
        <div className="flex items-center gap-2">
          {config.headerIcon}
          <span className="text-lg font-semibold">
            {targetType === 'article' ? '转为知识卡片' : '转为工具'}
          </span>
          {!aiMode && (
            <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">基础模式</span>
          )}
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {aiMode && (generated || error) && !generating && (
              <button
                onClick={() => triggerGenerate(targetType)}
                className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                重新生成
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded border border-border px-4 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canSave}
              className="inline-flex items-center gap-1 rounded bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? '保存中...' : '确认保存'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* URL 显示 */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-xs text-muted-foreground mb-1">来源</div>
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
            {item.source_url}
          </a>
        </div>

        {/* 类型选择（仅 unspecified 且外层未指定类型时显示） */}
        {item.item_type === 'unspecified' && !initialTargetType && (
          <div className="flex gap-2">
            <button
              onClick={() => handleTargetTypeChange('article')}
              className={`flex-1 rounded-lg border p-3 text-sm transition-colors ${
                targetType === 'article'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-border hover:border-blue-200'
              }`}
            >
              <FileText className="h-4 w-4 inline mr-1" />
              知识卡片
            </button>
            <button
              onClick={() => handleTargetTypeChange('tool')}
              className={`flex-1 rounded-lg border p-3 text-sm transition-colors ${
                targetType === 'tool'
                  ? 'border-orange-300 bg-orange-50 text-orange-700'
                  : 'border-border hover:border-orange-200'
              }`}
            >
              <Wrench className="h-4 w-4 inline mr-1" />
              工具
            </button>
          </div>
        )}

        {/* AI 生成中提示 */}
        {generating && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <Loader2 className="h-4 w-4 inline mr-1 animate-spin" />
            AI 正在生成内容...
          </div>
        )}

        {/* 基础模式提示 */}
        {!aiMode && !generating && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            请手动填写以下信息，或配置 AI Key 解锁自动生成
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
            <span className="text-xs text-red-500 ml-2">你可以手动填写内容后保存，或点击「重新生成」重试</span>
            <button onClick={() => setError('')} className="ml-2 text-red-500 hover:underline">关闭</button>
          </div>
        )}

        {/* 统一字段渲染（替代 ArticleFormFields + ToolFormFields） */}
        {config.fields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm font-medium mb-1">
              {field.label}
              {generated && field.aiKey && field.id !== 'title' && (
                <span className="ml-1 text-xs text-amber-600">(AI 生成，可编辑)</span>
              )}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                value={editFields[field.id] || ''}
                onChange={(e) => setEditFields((p) => ({ ...p, [field.id]: e.target.value }))}
                disabled={formDisabled}
                rows={field.rows || 3}
                placeholder={field.placeholder}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm resize-y disabled:opacity-60"
              />
            ) : (
              <input
                type="text"
                value={editFields[field.id] || ''}
                onChange={(e) => setEditFields((p) => ({ ...p, [field.id]: e.target.value }))}
                disabled={formDisabled}
                placeholder={field.placeholder}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
