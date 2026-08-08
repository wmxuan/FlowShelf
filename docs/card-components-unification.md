# 卡片组件统一化设计文档（2026-08-08）

> 状态：**已落地**（2026-08-08 第二轮迭代：调整 AI 重新生成 / 编辑 / 查看 三类按钮的可见性策略）
> 影响范围：暂存区（`/learning`）、知识库（`/cards`）、工具箱（`/toolbox`）
> 核心目标：将「知识类」「工具类」各 2 处内联卡片 JSX 抽成统一 UI 组件，补齐跨场景共通的 查看/编辑/AI 重新生成 能力，并保持各页面原有业务逻辑不被破坏。

---

## 1. 改造前的问题

### 1.1 代码重复

暂存区与知识库都渲染「知识卡片」，暂存区与工具箱都渲染「工具卡片」，4 处
内联 JSX 高度相似（域名提取、favicon、标签渲染、日期格式化等 100% 重复），
但因为字段名不同（`source_url` vs `url`、`tool_description` vs `description`、
`ai_summary` vs `summary`）而被独立维护。

### 1.2 功能不一致

| 功能               | 知识库（card）        | 暂存区 article            | 工具箱（tool）        | 暂存区 tool |
| ------------------ | --------------------- | ------------------------- | --------------------- | ----------- |
| 查看详情           | ✅ 点卡片弹窗         | ❌ 缺失                   | ❌ 仅行列表无详情     | ❌ 缺失     |
| 编辑（改 AI 内容） | ✅ 弹窗内编辑         | ❌ 缺失（无 update 接口） | ❌ 缺失               | ❌ 缺失     |
| AI 重新生成        | ❌ 缺失，只能删了重加 | ✅ enrich                 | ❌ 缺失，只能删了重加 | ✅ enrich   |
| 删除               | ✅                    | ✅                        | ✅                    | ✅          |
| 转为正式           | N/A                   | ✅                        | N/A                   | ✅          |

改造目标：补齐缺失能力，且不破坏「待分类（unspecified）」tab 的分流逻辑。

### 1.3 第二轮迭代调整（按钮可见性收敛）

落地后用户反馈三点优化：

1. **AI 重新生成按钮的范围收紧**：原方案在所有场景的卡片底部和详情弹窗都暴露「AI 重新生成」。第二轮收敛为——
   - 知识库（cards）、工具箱（toolbox）：**完全不暴露** AI 重新生成入口（这两类已是终点站，重新生成会破坏用户已编辑的内容；如需重做直接删了重加）。
   - 暂存区（learning）：**仅在 AI 生成失败时**显示重新生成入口。失败判定 = `is_ready === true && AI 内容字段为空`（article 看 `ai_summary`，tool 看 `tool_description`）。
2. **编辑入口收敛到详情弹窗**：移除卡片底部的「编辑」按钮（KnowledgeCard）和「查看详情」眼睛按钮（ToolCard）。编辑只在弹窗内进行。卡片本身的点击交互即「查看详情」。
3. **详情弹窗编辑态去掉标题上方 label**：编辑态头部直接用 input + placeholder（"标题" / "工具名称"），避免 label 文案导致样式错乱。

### 1.4 「AI 生成失败」的判定方式

后端 `learning_service._enqueue_ai_enrich` 异常路径原本只 log 错误，不修改数据库条目，导致失败的条目 `is_ready` 永远为 `false`，前端误判为「生成中」无限轮询。

第二轮在异常分支新增：

```python
update(LearningItem).where(id == item_id).values(is_ready=True, updated_at=now)
```

失败时设置 `is_ready=True`（标记"已尝试"），AI 内容字段保持 null。前端判定：

```ts
const isArticleFailed =
  source === "learning" && is_ready === true && !ai_summary;
const isToolFailed =
  source === "learning" && is_ready === true && !tool_description;
```

这样无需新增数据库字段、无需 Alembic 迁移，且失败状态明确（不会再误显示"生成中"）。

---

## 2. 总体架构：中间类型 + 适配函数抹平差异

用"统一数据类型"在组件与页面之间做一层解耦，组件完全不感知数据来源。

```
                    ┌─────────────────────────────────┐
                    │  KnowledgeCardData / ToolCardData │  ← 统一中间类型
                    └──────────▲───────▲────────────────┘
                               │       │
          adaptLearningArticle │       │ adaptCard      adaptLearningTool │ adaptTool
             （暂存区 article）│       │（知识库）         （暂存区 tool）│ （工具箱）
  ─────────────────────────────┘       └───────────────   ──────────────────────┘    └───────┐

   pages/learning/page.tsx              pages/cards/page.tsx     pages/learning/page.tsx          pages/toolbox/page.tsx
```

所有组件接收 actions 回调对象（场景专属按钮通过插槽 `extraActions` / `statusBadge` 注入），
避免组件内部出现 `if (source === 'learning')` 的分支。

### 2.1 共享模块

文件：`frontend/components/cards/shared.ts`

| 导出项                                          | 作用                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `KnowledgeCardData`                             | 知识卡片统一类型（id/source/title/source_url/ai_summary/key_points/ai_tags/created_at + learning 专属：is_ready/is_converted/converted_id）    |
| `ToolCardData`                                  | 工具卡片统一类型（id/source/title/url/ai_tags/description/created_at + toolbox 专属：visit_count/last_visited_at + learning 专属：is_ready/…） |
| `adaptLearningArticle(item): KnowledgeCardData` | LearningItem → KnowledgeCardData                                                                                                               |
| `adaptCard(card): KnowledgeCardData`            | Card → KnowledgeCardData                                                                                                                       |
| `adaptLearningTool(item): ToolCardData`         | LearningItem → ToolCardData                                                                                                                    |
| `adaptTool(tool): ToolCardData`                 | Tool → ToolCardData                                                                                                                            |
| `extractDomain(url): { domain, faviconUrl }`    | 两处重复的 favicon 提取合并                                                                                                                    |

---

## 3. 统一 UI 组件

### 3.1 KnowledgeCard（知识类网格卡片）

文件：`frontend/components/cards/KnowledgeCard.tsx`

**Props**

```ts
data: KnowledgeCardData;
actions: {
  onView?:        (data) => void;  // 点击卡片主体（查看详情，弹窗内才有编辑按钮）
  onRegenerate?:  (data) => void;  // 仅 learning 失败时由父组件传入；渲染在失败提示块内
  isRegenerating?: boolean;         // 控制刷新图标旋转
  onDelete?:      (id) => void;     // 底部工具栏删除（DeleteConfirmButton）
  statusBadge?:   ReactNode;        // 标题右侧状态徽标插槽（生成中 / 已转正等）
  extraActions?:  ReactNode;        // 底部工具栏额外按钮（如：转为正式）
}
```

**布局（选项 A，第二轮收敛后）**：

- 点卡片主体 → `onView`（查看详情）
- 标题右侧：`statusBadge` 插槽 + 内置 `✅ 已转卡片` 徽标（learning 场景）
- 生成中提示（仅 `source=learning && !is_ready`）：琥珀色内嵌卡片，⏳ 动画
- **生成失败提示**（仅 `source=learning && is_ready && !ai_summary`）：红色内嵌卡片，左侧 "AI 生成失败"，右侧内嵌「重新生成」按钮（仅当 `onRegenerate` 由父组件传入时渲染）
- AI 摘要 + 关键观点（最多 3 条）
- 标签 chips + 创建日期
- 底部工具栏（横向右对齐）：`🔗 查看原文` · `[extraActions]` · `🗑️ 删除`
  - **已移除**：编辑按钮（收敛到弹窗内）、AI 重新生成按钮（仅在失败提示块内）

**不处理的逻辑**（由父组件/插槽负责）：

- 转为正式按钮
- 生成中 / 失败状态的判定（基于 `data.is_ready` + AI 内容字段在组件内自洽）

### 3.2 ToolCard（工具类紧凑行列表）

文件：`frontend/components/cards/ToolCard.tsx`

**Props**

```ts
data: ToolCardData;
actions: {
  onView?:         (data) => void;   // 整行点击 → 查看详情（弹窗内才有编辑按钮）
  onRegenerate?:   (data) => void;   // 仅 learning 失败时由父组件传入；渲染在失败 chip 内
  isRegenerating?: boolean;
  onOpenExternal?: (data) => void;   // 打开链接（工具箱会调 visit API）
  onDelete?:       (id) => void;
  statusBadge?:    ReactNode;
  extraActions?:   ReactNode;        // 如：转为正式
}
```

**布局**：横向 1 行（左→右），整行可点击 → `onView`

```
[favicon / Wrench fallback]  标题(span)+域名   [statusBadge]  [生成中/失败chip(内嵌重试)/已转正]  [标签×3]  [访问数]  [最近使用]  [打开/extraActions/删除]
```

**条件列显示**：

- `source === 'toolbox'` 时显示 visit_count、last_visited_at（`md:flex` / `lg:flex`）
- `source === 'learning'` 时显示 created_at（`lg:flex`）
- 工具 favicon 加载失败时隐藏 `<img>` 并显示 fallback Wrench 图标
- **生成失败 chip**（仅 `source=learning && is_ready && !description`）：红色边框 + "AI 生成失败" + 内嵌「重试」按钮（仅当 `onRegenerate` 由父组件传入时渲染）
- **已移除**：查看详情眼睛按钮（整行点击即查看）、底部 AI 重生成按钮（仅在失败 chip 内）

### 3.3 KnowledgeDetailModal（查看 + 编辑 + AI 重新生成）

文件：`frontend/components/cards/KnowledgeDetailModal.tsx`

**Props**

```ts
data: { id, source: 'learning'|'cards', title, source_url, ai_summary, key_points, ai_tags, created_at } | null
onClose:      () => void
onUpdated:    (updated) => void                  // 保存成功，同步回父组件 state
onRegenerate?:(id, source) => Promise<void>      // AI 重新生成（父实现）
isFailed?:    boolean                             // 仅 learning 失败时为 true，控制 AI 重新生成按钮是否显示
```

**三种模式（第二轮收敛后）**：

1. **查看**：只读渲染 摘要 / 关键观点 / 标签 / 元信息。Footer：`[AI 重新生成(仅 isFailed)]` + `编辑`
   - 知识库 / 暂存区成功 / 暂存区生成中：Footer 只有「编辑」
   - 暂存区失败：Footer 多出「AI 重新生成」按钮
2. **编辑**：
   - 标题 → `input`（**无 label，使用 placeholder="标题"**，避免样式错乱）
   - 摘要 → `textarea`
   - 关键观点 → `textarea`（每行 1 条）
   - Footer：`取消` + `保存`
   - 保存时根据 `source` 走不同 API：
     - `cards`：`cardsApi.update(id, {title, ai_summary, key_points})`
     - `learning`：`learningApi.update(id, {title, ai_summary, key_points})`
3. **AI 重新生成**（仅 `isFailed && onRegenerate` 时按钮可见）：调用 `onRegenerate`，完成后关闭弹窗（父组件刷新列表）
   - 父组件实现：learning 走 `learningApi.enrich(id)`；cards 已不传 onRegenerate（不暴露）

### 3.4 ToolDetailModal（查看 + 编辑 + AI 重新生成）

文件：`frontend/components/cards/ToolDetailModal.tsx`

结构与 KnowledgeDetailModal 对应，区别：

| 模块                      | KnowledgeDetailModal                       | ToolDetailModal                                     |
| ------------------------- | ------------------------------------------ | --------------------------------------------------- |
| 可编辑字段                | title / ai_summary / key_points            | title / description                                 |
| 编辑态标题 placeholder    | "标题"                                     | "工具名称"                                          |
| 标签                      | 只读（AI 生成）                            | 只读（AI 生成）                                     |
| source=cards 保存         | cardsApi.update + fields1                  | N/A                                                 |
| source=learning 保存      | learningApi.update(ai_summary, key_points) | learningApi.update(tool_description)                |
| source=toolbox 保存       | N/A                                        | toolsApi.update + fields2                           |
| 额外元信息                | 创建时间 + 原文链接                        | 创建时间 + visit_count + last_visited_at + 打开工具 |
| AI 重新生成按钮显示条件   | `isFailed && onRegenerate`                 | `isFailed && onRegenerate`                          |
| isFailed 判定（learning） | `is_ready && !ai_summary`                  | `is_ready && !tool_description`                     |

---

## 4. 后端新增接口

为支持暂存区的编辑持久化，新增一条接口：

```
PUT /api/learning/{id}
{
  title?:           string
  ai_summary?:      string
  key_points?:      string[]
  ai_tags?:         string[]
  tool_description?: string | null
}
→ 返回 LearningItemResponse
```

**核心服务方法**（`learning_service.py` / `update_item`）：
只更新传入的非 None 字段（`exclude_unset`），在 convert 时这些被编辑的字段会
透传到 cards/tools 表，保证用户修正在暂存阶段就生效。

对应 schema：`LearningItemUpdateRequest`（`schemas.py`）。

前端 API：`learningApi.update(id, {title, ai_summary, key_points, ai_tags, tool_description})`，
其中 `tool_description` 允许 `null`（清空工具描述）。

---

## 5. 各页面改造点（第二轮收敛后）

### 5.1 `pages/cards/page.tsx` —— 知识库

| 区域         | 改造前                               | 改造后（第二轮收敛后）                                                              |
| ------------ | ------------------------------------ | ----------------------------------------------------------------------------------- |
| 卡片渲染     | 内联 ~60 行 JSX（网格 + 底部工具栏） | `<KnowledgeCard data={adaptCard(card)} actions={cardActions} />`                    |
| 详情弹窗     | `CardDetailModal`（已删除）          | `KnowledgeDetailModal`（**不传 onRegenerate**，isFailed 默认 false → 不显示重生成） |
| 卡片底部按钮 | 原文 / 编辑 / 重生成 / 删除 / extra  | 原文 / 删除（**编辑 / 重生成 已移除**）                                             |
| onDelete     | 旧 `handleDelete` 直接传             | 走 `cardActions.onDelete`                                                           |

### 5.2 `pages/toolbox/page.tsx` —— 工具箱

| 区域              | 改造前                                                             | 改造后（第二轮收敛后）                                                   |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 列表渲染          | 内联 ~100 行 JSX（favicon + 标题+域名 + 标签 + 访问数 + 删除按钮） | `<ToolCard data={adaptTool(tool)} actions={toolActions} />`              |
| 详情弹窗          | 无                                                                 | 新增 `ToolDetailModal`（**不传 onRegenerate**，isFailed 默认 false）     |
| 编辑              | 无                                                                 | `ToolDetailModal` 内编辑，调 `toolsApi.update`，`onUpdated` 同步回 state |
| 行交互            | 点 a 标签跳转                                                      | **整行点击 → onView**（弹窗），独立的「打开」a 标签保留                  |
| 卡片底部按钮      | 查看 / 重生成 / 打开 / 删除 / extra                                | 打开 / 删除（**查看 / 重生成 已移除**）                                  |
| 打开工具+记录访问 | 点卡片 a 标签 + onClick `handleVisit`                              | `onOpenExternal` → `handleVisit(id)` 保持原有逻辑                        |
| 排序 sortBy 依赖  | `useListPage` extraDeps                                            | 保持不变                                                                 |

### 5.3 `pages/learning/page.tsx` —— 暂存区（三 tab）

> 「待分类 unspecified」tab **保持不变**（它本质是分流入口，不适配通用 UI）。
> article、tool 两个 tab 分别切换到统一组件。

| 区域                 | 改造点（第二轮收敛后）                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab 切换             | 保留原有三态过滤（unspecified / article / tool / tabItems 映射）                                                                                                                                    |
| article tab 渲染     | `<KnowledgeCard data={adaptLearningArticle(item)} actions=... />`；`extraActions` 注入「转为正式」按钮；**仅当 `item.is_ready && !ai_summary` 时**传 `onRegenerate`（卡片内嵌失败 chip + 重试按钮） |
| tool tab 渲染        | `<ToolCard data={adaptLearningTool(item)} actions=... />`；`extraActions` 注入「转为正式」按钮；**仅当 `item.is_ready && !tool_description` 时**传 `onRegenerate`（行内失败 chip + 重试按钮）       |
| unspecified tab 渲染 | `renderUnspecifiedCard` 100% 原样保留（双按钮「转为知识卡片 / 转为工具」逻辑未动）                                                                                                                  |
| 轮询逻辑             | `!is_ready && !is_converted && item_type !== 'unspecified'` 每 5s 拉取，保持不变                                                                                                                    |
| handleConvert        | 保持原有逻辑：优先传 item 上已存在的 ai_summary/key_points/ai_tags/tool_description 以实现「convert 时透传编辑结果」                                                                                |
| onRegenerate 实现    | 统一走 `learningApi.enrich(id)` → `loadItems()`（复用原有 enrich）                                                                                                                                  |
| 详情弹窗 isFailed    | `<KnowledgeDetailModal isFailed={selectedArticle?.is_ready && !selectedArticle?.ai_summary} />`；ToolDetailModal 对应 `!description`                                                                |

---

## 6. 删除的文件

- `frontend/components/CardDetailModal.tsx` —— 已由 `KnowledgeDetailModal` 替代。
  新文件统一了 source 分支（cards / learning）和 AI 重新生成能力，旧文件只支持 cards。

---

## 7. 功能矩阵（第二轮收敛后）

| 功能                             | 知识库 card    | 暂存区 article                         | 工具箱 tool    | 暂存区 tool                            | 暂存区 unspecified    |
| -------------------------------- | -------------- | -------------------------------------- | -------------- | -------------------------------------- | --------------------- |
| 👁️ 查看详情                      | ✅ 点卡片      | ✅ 点卡片                              | ✅ 整行点击    | ✅ 整行点击                            | N/A（分流页）         |
| ✏️ 编辑 title/摘要/关键观点/描述 | ✅ 弹窗内      | ✅ 弹窗内（learningApi.update）        | ✅ 弹窗内      | ✅ 弹窗内                              | N/A                   |
| 🔄 AI 重新生成                   | ❌ 不暴露      | ✅ 仅失败时（卡片 chip + 弹窗按钮）    | ❌ 不暴露      | ✅ 仅失败时（行内 chip + 弹窗按钮）    | N/A                   |
| 🔗 查看原文 / 打开工具           | ✅ 卡片 / 弹窗 | ✅ 卡片 / 弹窗                         | ✅ 行内 / 弹窗 | ✅ 行内 / 弹窗                         | ✅（原链接保留）      |
| 🗑️ 删除                          | ✅             | ✅                                     | ✅             | ✅                                     | ✅（原）              |
| 📄 转为正式卡片                  | N/A            | ✅ extraActions 插槽                   | N/A            | N/A                                    | ✅ 双按钮分流（原）   |
| 🔧 转为正式工具                  | N/A            | N/A                                    | N/A            | ✅ extraActions 插槽                   | ✅ 双按钮分流（原）   |
| ⏳ AI 生成中提示                 | N/A            | ✅ 内置琥珀色提示（is_ready=false）    | N/A            | ✅ 内置琥珀色提示（is_ready=false）    | N/A（未选类型不生成） |
| ⚠️ AI 生成失败提示               | N/A            | ✅ 内置红色 chip（is_ready && 无内容） | N/A            | ✅ 内置红色 chip（is_ready && 无内容） | N/A                   |
| ✅ 已转正提示                    | N/A            | ✅ 内置 badge                          | N/A            | ✅ 内置 badge                          | ✅ 保留原有提示       |
| 访问计数 / 最近使用              | N/A            | N/A                                    | ✅ 列          | N/A                                    | N/A                   |

---

## 8. 验证清单

执行命令：

```bash
cd frontend && npx tsc --noEmit      # TypeScript 编译检查
# GetDiagnostics：无错误
cd backend && ./venv/bin/python -c "from app.db.schemas.schemas import LearningItemUpdateRequest; from app.api.routes.learning import router"  # 后端导入
```

手动检查项：

- [ ] 知识库卡片点击 → 弹窗内编辑 → 保存后列表 / 弹窗内容同步更新
- [ ] 知识库卡片底部 / 弹窗都**没有** AI 重新生成按钮（已收敛）
- [ ] 工具箱行点击 → 弹窗内编辑；行内保留独立的「打开」a 标签
- [ ] 工具箱卡片底部 / 弹窗都**没有** AI 重新生成按钮（已收敛）
- [ ] 暂存区 article tab 新卡片 → 点卡片弹窗 → 保存调 `PUT /learning/:id`
- [ ] 暂存区 article 「转为正式」按钮 → 逻辑不变 → convert 后不消失
- [ ] 暂存区 article 失败条目（is_ready=true && 无 ai_summary）→ 卡片内嵌红色 chip + 重试按钮；点卡片弹窗底部也有 AI 重新生成按钮
- [ ] 暂存区 article 成功条目 → 卡片 / 弹窗都**没有** AI 重新生成按钮
- [ ] 暂存区 tool tab 行列表 → 整行点击查看弹窗 / 失败时行内 chip 重试 / 转为正式 都工作
- [ ] 暂存区 unspecified tab → 双按钮分流完全不变
- [ ] 所有卡片的 favicon → 加载失败 fallback Wrench 正常显示
- [ ] 详情弹窗编辑态标题输入框上方**无 label 文案**（仅 placeholder）
- [ ] 筛选标签 / 搜索 / 排序在改造后仍然生效
