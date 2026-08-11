# FlowShelf Day4 阶段开发记录

> **阶段**：基础模式 vs AI 模式双模分离 + 语义搜索修复 + 全局状态管理重构 + API 基址统一
> **日期**：2026-08-11
> **状态**：双模式功能完整分离，语义搜索与关键词搜索差异显著，全局状态管理统一为 TanStack Query

---

## 一、总体进度概览

| Phase                    | Day3 完成度 | Day4 完成度 | 变化 | 说明                                                      |
| ------------------------ | ----------- | ----------- | ---- | --------------------------------------------------------- |
| **Phase 1：AI 核心链路** | 100%        | **100%**    | —    | 稳定运行                                                  |
| **Phase 2：浏览器扩展**  | ~75%        | **~85%**    | +10% | 一键同步优化（窗口tab上限10）、书签双写去重修复、基础分组 |
| **双模式完整度**         | 未评估      | **95%**     | 新增 | 基础/AI 模式全链路分离，搜索结果差异显著                  |
| **前端架构质量**         | 4.0/5       | **4.5/5**   | +0.5 | TanStack Query 统一状态管理 + API 基址统一 + 无闪烁切换   |

**当前位置**：基础模式与 AI 模式从"导航半隐藏+数据混用"升级为"功能完整分离+数据质量可控"。语义搜索（bge-small-zh）与关键词搜索结果差异明显，全局状态从分散 `useState` 统一为 TanStack Query，切换模式零闪烁。

---

## 二、Day4 实际完成工作（10 大项，跨 25 文件）

### 2.1 后端修复（5 项）

| #   | 任务                       | 修复前                                                                   | 修复后                                                                                                           | 涉及文件                     |
| --- | -------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | **语义搜索本地 embedding** | `_get_query_embedding` 检查 `ai_provider.is_demo`，基础模式跳过向量生成  | 优先使用本地 embedding provider（bge-small-zh），独立于 API Key，保证无 Key 时语义检索仍可用                     | `services/search_service.py` |
| 2   | **搜索混合阈值调优**       | 向量阈值 0.3，召回过多弱相关噪声                                         | 向量阈值提升至 0.35，混合阈值 0.35，关键词阈值 0.3；"网页开发"从 14 条降至 9 条，噪声精准过滤                    | `services/search_service.py` |
| 3   | **关键词评分算法优化**     | 所有弱匹配分数 ~0.433 无区分度                                           | 按匹配位置分桶（标题/标签=高位，摘要=低位）+ `high_ratio` + `continuity_bonus`，拉开"真正相关"与"勉强沾边"的差距 | `services/search_utils.py`   |
| 4   | **Provider 条件修复**      | `if demo_mode and not has_valid_key` 导致基础模式下仍创建 RealAIProvider | 改为 `if not has_valid_key`，无有效 Key 始终返回 DemoAIProvider                                                  | `providers/base.py`          |
| 5   | **AI 生成端点**            | 暂存区转换与 AI 生成耦合在 convert 接口                                  | 新增 `POST /api/learning/{id}/ai-generate`，基础模式返回空字段，AI 模式触发 LLM 生成                             | `api/routes/learning.py`     |

### 2.2 前端重构（5 项）

| #   | 任务                          | 重构前                                           | 重构后                                                                                                               | 涉及文件                                                                     |
| --- | ----------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 6   | **全局状态管理重构**          | 各组件分散 `useState(aiMode)` + `useEffect` 轮询 | `useAiMode()` hook 基于 TanStack Query（queryKey: `['ai-mode']`），`useAiModeInvalidate()` 触发全局刷新 + 跨标签广播 | `hooks/useAiMode.ts`（新建）、`Header.tsx`、`Providers.tsx`                  |
| 7   | **API 基址统一**              | 4 处重复定义 `API_BASE`，硬编码 `port==='3000'`  | 统一收归 `services/api.ts`，`port!=='8972'` 判断，支持环境变量覆盖；其他文件 import 引用                             | `services/api.ts`、`Header.tsx`、`tabs/page.tsx`、`useAiMode.ts`、`page.tsx` |
| 8   | **搜索语义参数 + 无闪烁切换** | `useSemantic` 变化触发全页 loading 骨架屏        | `useListPage` 增加 `silent` 参数，`useSemantic` 变化时静默刷新保留旧数据；`search/page.tsx` 同理静默重搜             | `hooks/useListPage.ts`、`search/page.tsx`                                    |
| 9   | **ConvertModal 配置驱动重构** | `ArticleFormFields` + `ToolFormFields` 重复组件  | 统一 `ConvertModal`，`ARTICLE_CONFIG`/`TOOL_CONFIG` 配置驱动渲染；已分类不显示类型切换器                             | `components/ConvertModal.tsx`（新建）                                        |
| 10  | **暂存区 UI 优化**            | Tab 上有黄色 pending 数字标签；卡片有"基础"标识  | 移除黄色 pending 标签（冗余）；移除 Tab 上的"基础"标识；按钮文案按模式切换（"转为"/"收藏"）                          | `learning/page.tsx`、`tabs/page.tsx`                                         |

### 2.3 扩展修复（1 项）

| #   | 任务                    | 修复前                                                  | 修复后                                                                                                | 涉及文件                                      |
| --- | ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 11  | **一键同步 + 书签双写** | 全部 tab 合到一个窗口（拥挤）；URL 末尾斜杠导致去重失败 | 单窗口上限 10 个 tab；种子 tab 创建窗口避免空白页；URL 归一化去末尾斜杠；FlowShelf 自身页面不参与同步 | `flowshelf-extension/src/background/index.ts` |

---

## 三、公共状态管理全量梳理

### 3.1 `aiMode` — AI 模式开关

| 属性      | 值                                                                          |
| --------- | --------------------------------------------------------------------------- |
| 定义位置  | `hooks/useAiMode.ts`                                                        |
| 管理方式  | TanStack Query（queryKey: `['ai-mode']`）                                   |
| 数据来源  | `GET /api/health` → `data.ai_mode === 'real'`                               |
| 刷新机制  | `useAiModeInvalidate()` → `invalidateQueries` + BroadcastChannel 跨标签广播 |
| staleTime | 0（每次组件挂载都 refetch）                                                 |

**消费者（6 处）：**

| 组件                | 用途                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `Header.tsx`        | 模式按钮 `✨ AI 模式` / `📦 基础模式`；切换时调 API 清空/保存 Key                         |
| `cards/page.tsx`    | 传 `useSemantic: aiMode` 给 useListPage                                                   |
| `toolbox/page.tsx`  | 同上                                                                                      |
| `learning/page.tsx` | 按钮文案切换 + 传给 ConvertModal                                                          |
| `search/page.tsx`   | 搜索传 `useSemantic: aiMode`；aiMode 变化静默重搜；匹配百分比仅 AI 模式显示；排序标签切换 |
| `tabs/page.tsx`     | 自己从 health API 取 `aiMode: string`（不走 useAiMode hook），决定 AI/基础分组按钮        |

### 3.2 `API_BASE` / `API_BASE_URL` — API 基址

| 属性     | 值                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 定义位置 | `services/api.ts`（全局唯一定义）                                                                              |
| 管理方式 | 模块级常量（非响应式）                                                                                         |
| 数据来源 | 优先 `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_BASE` 环境变量，否则 `port !== '8972'` → `http://localhost:8972` |

### 3.3 `QueryClient` — 全局缓存策略

| 属性                 | 值                   | 理由                     |
| -------------------- | -------------------- | ------------------------ |
| staleTime            | 2min                 | 跨标签实时性要求高       |
| gcTime               | 10min                | 离开视口后回收缓存       |
| retry                | 4xx 不重试/5xx ≤2 次 | 客户端错误重试无意义     |
| refetchOnWindowFocus | true                 | 切回标签页时立即刷新     |
| 跨标签同步           | BroadcastChannel     | 零延迟 invalidation 广播 |

### 3.4 `useListPage` — 列表页通用状态

| 属性     | 值                                                        |
| -------- | --------------------------------------------------------- |
| 定义位置 | `hooks/useListPage.ts`                                    |
| 管理方式 | `useState`（items, isLoading, searchQuery, activeTag...） |
| 关键参数 | `searchType`, `useSemantic`, `extraDeps`                  |

**内部状态：** `items` / `isLoading` / `searchInput` / `searchQuery` / `isSearching` / `activeTag` / `allTags`

---

## 四、类别参数驱动的逻辑判断

### 4.1 参数 A：`aiMode`（boolean）

| 位置                     | 条件         | AI 模式 (true)                    | 基础模式 (false)                   |
| ------------------------ | ------------ | --------------------------------- | ---------------------------------- |
| `Header.tsx#L148-L154`   | 按钮渲染     | 绿色 `✨ AI 模式`，点击清 Key     | 黄色 `📦 基础模式`，点击弹窗输 Key |
| `tabs/page.tsx#L1311`    | 分组按钮     | `🤖 AI智能分组` → `handleAIGroup` | `🌐 基础分组` → `handleBasicGroup` |
| `tabs/page.tsx#L653`     | 收藏 toast   | "AI 正在后台生成摘要..."          | 无 AI 提示                         |
| `learning/page.tsx#L229` | 按钮文案     | "转为知识卡片" / "转为工具"       | "收藏到卡片库" / "收藏到工具箱"    |
| `learning/page.tsx#L200` | 待分类提示   | "AI 会按所选类型同步生成内容"     | "选择后可收藏到卡片库或工具箱"     |
| `ConvertModal.tsx#L113`  | 自动 AI 生成 | 自动触发 `triggerGenerate`        | 不触发，手动填写                   |
| `ConvertModal.tsx#L190`  | 保存条件     | AI 生成后才可保存 (`generated`)   | 有内容即可保存 (`hasContent`)      |
| `ConvertModal.tsx#L202`  | 弹窗标签     | 无"基础模式"标签                  | 显示灰色"基础模式"标签             |
| `ConvertModal.tsx#L210`  | 重新生成按钮 | 显示                              | 隐藏                               |
| `search/page.tsx#L42`    | 搜索 API     | `semantic=true`                   | `semantic=false`                   |
| `search/page.tsx#L190`   | 排序标签     | 绿色 `✨ 语义排序`                | 灰色 `🔤 关键词排序`               |
| `search/page.tsx#L214`   | 匹配百分比条 | 显示                              | 隐藏                               |

### 4.2 参数 B：`useSemantic`（boolean = aiMode）

| 位置                     | `true`（AI 模式）                            | `false`（基础模式）    |
| ------------------------ | -------------------------------------------- | ---------------------- |
| `api.ts#L252`            | `semantic=true`                              | `semantic=false`       |
| `useListPage.ts#L100`    | 走语义检索                                   | 走关键词检索           |
| `useListPage.ts#L143`    | 静默刷新（`silent=true`），不闪骨架屏        | 同上                   |
| `search_service.py` 后端 | 混合分数（向量×0.7 + 关键词×0.3），阈值 0.35 | 纯关键词分数，阈值 0.3 |

### 4.3 参数 C：`searchType`（'cards' | 'tools'）

| 位置               | 值        | 作用               |
| ------------------ | --------- | ------------------ |
| `cards/page.tsx`   | `'cards'` | 搜索仅命中卡片库   |
| `toolbox/page.tsx` | `'tools'` | 搜索仅命中工具箱   |
| `search/page.tsx`  | 并行两次  | 同时搜 cards+tools |

### 4.4 参数 D：`item_type`（'unspecified' | 'article' | 'tool'）

| 位置                     | 条件                          | 逻辑                                                          |
| ------------------------ | ----------------------------- | ------------------------------------------------------------- |
| `learning/page.tsx#L87`  | 三态分桶                      | unspecified→待分类Tab；article→知识卡片Tab；tool→工具Tab      |
| `learning/page.tsx#L171` | `item_type === 'unspecified'` | 渲染待分类卡片（紫色标签 + 双按钮）                           |
| `ConvertModal.tsx#L102`  | 初始类型推断                  | `item_type === 'tool'` → 默认 tool，否则 article              |
| `ConvertModal.tsx#L113`  | AI 自动生成条件               | `item_type !== 'unspecified'` 或有 initialTargetType 时才触发 |
| `ConvertModal.tsx#L250`  | 类型选择器                    | 仅 unspecified 且无 initialTargetType 时显示                  |
| `ConvertModal.tsx#L166`  | 保存字段映射                  | article→`ai_summary`+`key_points`；tool→`tool_description`    |

### 4.5 参数 E：`targetType`（'article' | 'tool'，ConvertModal 内部）

| 条件     | `article`                                   | `tool`                          |
| -------- | ------------------------------------------- | ------------------------------- |
| 配置选择 | `ARTICLE_CONFIG`（标题/摘要/关键观点/标签） | `TOOL_CONFIG`（标题/描述/标签） |
| 弹窗标题 | "转为知识卡片"                              | "转为工具"                      |
| 保存字段 | `ai_summary` + `key_points` + `ai_tags`     | `tool_description` + `ai_tags`  |

---

## 五、Day4 技术决策亮点

### 5.1 语义搜索独立于 API Key — 本地 embedding 优先

**问题**：`_get_query_embedding()` 检查 `ai_provider.is_demo`，基础模式（无 API Key）直接跳过向量生成，语义搜索完全不可用。但 bge-small-zh 是本地模型，不依赖 API Key。

**方案**：`_get_query_embedding()` 优先尝试本地 embedding provider，与 LLM API Key 无关。只有本地模型不可用时才降级为纯关键词。

**效果**：搜索"网页开发"，AI 模式返回 9 条（语义扩展召回 shadcn/ui、ChatGPT 等），基础模式返回 3 条（仅标题/标签精确匹配），差异明显。

### 5.2 混合阈值调优 — 从"召回率优先"到"精度优先"

**问题**：向量阈值 0.3 导致弱相关噪声过多（go-sql、智谱AI、A16Z 等"网页开发"的弱关联条目均被召回）。

**方案**：向量阈值 0.35 + 混合阈值 0.35 + 关键词阈值 0.3。bge 中文模型上 0.5 是"明显相关"分界线，0.35 是"有一定语义关联"的下限。

**效果**："网页开发"从 14 条降至 9 条，噪声精准过滤；"前端框架"等强语义查询不受影响。

### 5.3 全局状态从分散 useState 到 TanStack Query

**问题**：`aiMode` 分散在 Header、cards、toolbox、learning、search 各自的 `useState` + `useEffect` 轮询中，切换模式后各页面状态不同步。

**方案**：`useAiMode()` hook 基于 TanStack Query，`queryKey: ['ai-mode']`，`staleTime: 0`。任何组件调用 `useAiModeInvalidate()` 触发全局 refetch + BroadcastChannel 跨标签广播。

**效果**：Header 切换模式 → 所有消费者即时刷新 → 搜索参数 `useSemantic` 自动更新 → 列表页静默重搜 → 零闪烁。

### 5.4 API 基址从硬编码到统一判断

**问题**：4 处重复定义 `API_BASE`，硬编码 `port === '3000'`。前端跑在 3001 端口时所有 API 请求失败。

**方案**：统一收归 `services/api.ts`，判断逻辑改为 `port !== '8972'`（不在后端端口上 = 开发模式 = 拼完整后端地址）。支持 `NEXT_PUBLIC_API_URL` 环境变量覆盖部署场景。

### 5.5 ConvertModal 配置驱动 — 消除重复组件

**问题**：`ArticleFormFields` + `ToolFormFields` 两个组件逻辑 90% 相同，仅字段列表不同。

**方案**：`ARTICLE_CONFIG` / `TOOL_CONFIG` 定义字段规格（id/label/type/rows/placeholder/aiKey/isArray），`config.fields.map()` 统一渲染。已分类条目不显示类型切换器，未分类条目可选。

---

## 六、修复的 Bug 与根因

| #   | Bug                                            | 根因                                                                                        | 修复                                                        |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | 基础模式添加内容至暂存区显示 "Failed to fetch" | `get_ai_provider()` 条件 `demo_mode and not has_valid_key` 导致空 Key 仍创建 RealAIProvider | 改为 `if not has_valid_key`，无 Key 始终返回 DemoAIProvider |
| 2   | 切换模式后搜索参数 semantic 未实时更新         | `aiMode` 状态分散各组件，未全局共享                                                         | TanStack Query `useAiMode` + `useAiModeInvalidate` 全局刷新 |
| 3   | 切换模式后搜索结果未变化                       | `useListPage` 的 `doRefresh` 和主 effect 缺少 `useSemantic` 依赖                            | 添加 `useSemantic` 到依赖数组                               |
| 4   | `useAiMode.tsx` 文件引用错误                   | 重构时删除 `.tsx` 文件但 `.next` 缓存仍引用旧路径                                           | 清除 `frontend/.next` 缓存目录                              |
| 5   | 一键同步窗口过于拥挤                           | 所有 tab 合入同一窗口                                                                       | 单窗口上限 10 个 tab，种子 tab 创建窗口避免空白页           |
| 6   | URL 末尾斜杠导致书签去重失败                   | `example.com/path/` 与 `example.com/path` 视为不同 URL                                      | URL 归一化去末尾斜杠后匹配                                  |
| 7   | 语义搜索与关键词搜索结果相同                   | `_get_query_embedding` 在基础模式跳过本地 embedding                                         | 优先使用本地 embedding，不依赖 API Key                      |

---

## 七、综合评分

| 维度                  | Day3   | Day4      | 变化 | 说明                                                                 |
| --------------------- | ------ | --------- | ---- | -------------------------------------------------------------------- |
| **双模式完整度**      | 未评估 | **4.5/5** | 新增 | 基础/AI 全链路分离，搜索差异显著，暂存区转换逻辑独立                 |
| **全局状态管理**      | 3.0/5  | **4.5/5** | +1.5 | TanStack Query 统一 aiMode，跨标签同步，零闪烁切换                   |
| **搜索质量**          | 3.5/5  | **4.5/5** | +1.0 | 语义/关键词结果差异明显，混合阈值调优降噪，本地 embedding 不依赖 Key |
| **前端架构质量**      | 4.0/5  | **4.5/5** | +0.5 | API 基址统一，ConvertModal 配置驱动，消除重复代码                    |
| **整体（Day4 结束）** | 4.5/5  | **4.5/5** | —    | 功能质量显著提升，为全链路验收和测试基建打下基础                     |

---

## 八、数据流总览

```
用户点击模式切换
     │
     ▼
Header.tsx → POST /api/settings/api-key → invalidateAiMode()
     │
     ▼
TanStack Query broadcast → 所有 useAiMode() 消费者 refetch
     │
     ├── cards/page.tsx ──→ useListPage(useSemantic: aiMode) ──→ searchApi.semantic(q, 'cards', limit, aiMode)
     ├── toolbox/page.tsx ──→ useListPage(useSemantic: aiMode) ──→ searchApi.semantic(q, 'tools', limit, aiMode)
     ├── search/page.tsx ──→ 静默重搜 semantic(q, 'cards', limit, aiMode) + semantic(q, 'tools', limit, aiMode)
     ├── learning/page.tsx ──→ 按钮文案切换 + ConvertModal 行为切换
     └── tabs/page.tsx ──→ 分组按钮切换 + toast 文案切换
```

---

**Day4 阶段结束。双模式完整分离（基础模式=关键词搜索+手动填写+基础分组，AI模式=语义搜索+AI生成+智能分组），全局状态统一为 TanStack Query（跨标签同步+零闪烁），API 基址统一（端口无关+环境变量覆盖），语义搜索本地 embedding 独立于 API Key，混合阈值调优降噪，ConvertModal 配置驱动消除重复。从"功能跑通"进阶到"模式分离+质量可控"。**
