# FlowShelf 开发决策日志

> **用途**：记录所有技术选型、Prompt 迭代、踩坑经验、成本数据
> **目标**：沉淀面试素材和项目知识

---

## 使用说明

每完成一个重要决策或发现一个问题时，更新本日志。格式：

```
### [日期] 标题
- **决策类型**：技术选型 / Prompt 迭代 / 踩坑记录 / 成本数据 / 用户反馈
- **问题描述**：
- **决策内容**：
- **理由分析**：
- **备选方案**：
- **影响范围**：
- **后续改进**：
```

"开发思路实录"章节用叙事格式，记录完整思考链路：

```
### 案例 N：标题（日期）
**功能背景** → **异常表现** → **觉得不合理** → **调研步骤** → **与 AI 交流决策** → **实施验证** → **反思**
```

---

## 日志记录

### [2026-08-06] 项目启动与技术栈选型

- **决策类型**：技术选型
- **问题描述**：确定 Frontend、Backend、AI 三层技术栈
- **决策内容**：
  - 前端：Next.js 14 + React 18 + TypeScript + TailwindCSS + shadcn/ui
  - 后端：FastAPI + Pydantic + SQLAlchemy + SQLite（Phase 1）
  - AI：GPT-4o-mini + text-embedding-3-small
  - 扩展：Chrome MV3 + Plasmo 框架
- **理由分析**：
  1. Next.js 14：App Router 性能好，SEO 友好，适合 Web 应用
  2. shadcn/ui：组件质量高，可自定义，适合快速构建专业 UI
  3. FastAPI：异步支持好，自动生成 API 文档，适合 AI 应用
  4. SQLite（Phase 1）：零配置，快速启动，后续可升级 PostgreSQL
  5. GPT-4o-mini：成本低（$0.15/1M tokens），速度快（300-500ms），质量足够
  6. Plasmo：Chrome 扩展开发框架，支持 React，开发体验好
- **备选方案**：
  - 前端用 Vite + React：性能更好但缺少 SSR，不利于 SEO
  - 后端用 Node.js（Express）：团队更熟悉但 Python 生态更适合 AI
  - GPT-4：质量最好但成本高（$2.5/1M tokens），延迟高（1-2s）
  - SQLite → PostgreSQL：Phase 2 升级，适合生产环境
- **影响范围**：全项目
- **后续改进**：Phase 2 考虑升级到 PostgreSQL + pgvector

---

### [2026-08-06] 项目目录结构设计

- **决策类型**：技术选型
- **问题描述**：确定 monorepo 还是多仓库
- **决策内容**：monorepo 结构，包含 `frontend/`、`backend/`、`flowshelf-extension/` 三个子目录
- **理由分析**：
  1. 便于统一管理和协作
  2. 文档、脚本可以共享
  3. 适合个人项目
- **备选方案**：多仓库（frontend、backend、extension 各自独立）
- **影响范围**：项目结构
- **后续改进**：后期可考虑用 pnpm workspace 统一管理依赖

---

### [2026-08-06] 数据库存储方案：Phase 1 用手动向量检索

- **决策类型**：技术选型
- **问题描述**：Phase 1 是否需要引入 pgvector 或 ChromaDB
- **决策内容**：Phase 1 用 SQLite + 手动实现 cosine similarity 向量检索
- **理由分析**：
  1. **快速启动**：零配置，不需要安装 PostgreSQL 扩展
  2. **面试价值**：可以在面试中解释"为什么选择手动实现而非专用向量数据库"
  3. **足够使用**：卡片数量 < 1000 时，手动实现性能足够
  4. **易于迁移**：后期可平滑升级到 pgvector
- **备选方案**：
  - pgvector：专业向量数据库，适合生产环境，但需要额外配置
  - ChromaDB：轻量级向量数据库，Python 原生，但生态不如 pgvector
  - FAISS：Facebook 开源库，性能最好，但集成复杂
- **影响范围**：Phase 1 语义搜索功能
- **后续改进**：Phase 2 升级到 pgvector

---

### [2026-08-06] AI Provider 抽象层设计

- **决策类型**：技术选型
- **问题描述**：如何实现 DEMO_MODE 与真实模式的切换
- **决策内容**：设计 BaseProvider 接口，RealProvider 和 DemoProvider 实现该接口
- **理由分析**：
  1. **面试价值**：展示"技术抽象"能力，在面试中讲解设计思路
  2. **开发效率**：DEMO_MODE 下不需要真实 API Key，可快速开发 UI
  3. **可测试性**：DemoProvider 可用于自动化测试
  4. **可扩展性**：后期可添加通义千问等备选模型
- **备选方案**：
  - 环境变量直接切换：简单但不符合开闭原则
  - 工厂模式创建 Provider：更灵活但过度设计
- **影响范围**：全项目 AI 能力
- **后续改进**：添加 Provider 配置文件，支持动态切换

---

### [2026-08-06] 标签治理：候选词表 + 字符串相似度去重

- **决策类型**：技术选型
- **决策内容**：标签膨胀治理采用"两道闸门"——闸门 1 在 Prompt 注入 Top-30 高频标签引导 AI 复用；闸门 2 用 `normalize_tags` 做字符串相似度去重（归一化精确匹配 / 包含关系 0.9 / difflib 序列相似度，阈值 0.85）
- **理由分析**：当前 deepseek 无 Embedding API，`_safe_embedding` 降级为无语义的 hash 向量，无法做真正的语义相似度。字符串相似度零依赖、立即可用，能覆盖 60-70% 同义标签（"SQL" / "SQL语言"）。`_similarity` 设计为可替换函数，Embedding 服务接入后升级为余弦相似度即可
- **影响范围**：`tag_service.py`（新建）、`card_service` / `tool_service` 建卡/建工具流程
- **未做**：Phase C 定期聚类 + 低频清理（待挂到周报任务）

### [2026-08-07] 三处搜索逻辑统一为单一 /api/search API

- **决策类型**：架构重构 / 技术选型
- **问题描述**：三个搜索入口（卡片库 `/cards`、工具箱 `/toolbox`、顶部 `/search`）用两套不同算法——卡片库/工具箱走 `/api/cards?q=`、`/api/tools?q=` 纯关键词（jieba+子串），顶部走 `/api/search` 混合检索（向量0.7+关键词0.3）。搜「智谱」三处结果数不一致（2/0/6），用户无法预期哪个是"正确"结果
- **决策内容**：合并为单一 `/api/search` API，通过 `type` 参数（card/tool/all）区分；移除 `/api/cards`、`/api/tools` 的 `q` 参数，回归"纯列表+筛选"职责；SearchResult schema 扩展 4 个 Optional 字段（key_points/created_at 给 card，visit_count/last_visited_at 给 tool）；前端搜索态改调 searchApi + 适配层映射回 Card/Tool 复用渲染
- **理由分析**：
  1. **一致性**：搜索逻辑只在 SearchService 一处，天然保证三处结果一致
  2. **职责清晰**：`/api/cards`、`/api/tools` 不再承担搜索，只做列表+标签/天数筛选
  3. **可维护**：未来升级（如加 Cross-Encoder 重排）改一处全局生效
  4. **向后兼容**：适配层复用既有渲染组件，渲染层零改动
- **备选方案**：把混合检索逻辑下沉到 CardService/ToolService（否决：重复代码，且两处都要改才能保证一致）
- **影响范围**：8 文件——后端 `schemas.py`/`search_service.py`/`cards.py`+`card_service.py`/`tools.py`+`tool_service.py`；前端 `types/index.ts`/`api.ts`/`cards/page.tsx`/`toolbox/page.tsx`
- **验证**：浏览器三处搜「智谱」，卡片库=3、工具箱=3、顶部=6（3+3），三处一致 ✅。完整思考链路见"开发思路实录"案例 1

### [2026-08-07] Chrome MV3 扩展脚手架 + 4 入口职责划分

- **决策类型**：技术选型 / 架构
- **决策内容**：Chrome MV3（非 Plasmo，避免额外框架），用 Vite + TypeScript + React 纯手写。4 入口职责划分：`action.default_popup`（快速收藏+Tab 归组，双视图）、`chrome_url_overrides.newtab`（纯跳板重定向 Web `/tabs`，Chrome 不允许直接指外部 URL）、`content_scripts.bridge.ts`（仅注入 localhost:3000 / \*.flowshelf.app，做 Web ↔ chrome.tabs 消息桥）、`background.service_worker`（右键菜单+快捷键+书签双写）
- **理由分析**：
  - MV3 是未来方向，直接用原生；Plasmo 等框架后续再迁不影响业务代码
  - NewTab 纯重定向：把"Tab 管理主界面"放在 Web 应用，避免扩展内复制一套 React/Tailwind
  - Bridge 注入域仅白名单，不注入任意网页，合规+安全
- **影响范围**：`flowshelf-extension/` 新建目录（manifest+5 src 子目录）
- **CORS 特殊处理**：后端 `allow_origin_regex=r"chrome-extension://.*"`，开发期扩展 ID 不稳定，不用硬编码

### [2026-08-07] 快速收藏"先保存后生成"（方案 C）：asyncio.create_task 独立 DB 会话

- **决策类型**：交互体验 / 并发架构
- **问题描述**：popup 点击"保存"若同步等待 AI 生成摘要/标签（3-5s），用户体验不可接受
- **决策内容**：POST `/api/learning` 只写入轻量记录（source*url+title+原始正文），<500ms 返回；AI 内容补全通过 `asyncio.create_task(_ai_enrich(item_id, content, item_type))` 后台异步执行。**核心技术点**：后台任务创建独立 `async_sessionmaker(engine, class*=AsyncSession, expire_on_commit=False)` 新会话，不依赖请求生命周期内的 db session（否则请求结束 session 关闭导致 commit 失败）
- **理由分析**：方案 A "同步等 AI"体验差；方案 B "前端轮询先拿到占位再等"仍需多次往返；方案 C 后端异步最干净，popup 立刻显示"已收藏"，后台默默补全，前端暂存区 `is_ready=False` 显示"AI 生成中"，5s 轮询静默刷新后出现 AI 结果
- **影响范围**：`learning_service.py` 的 `create_item` + `_ai_enrich`（独立 session_maker）、`learning.py` 路由、暂存区页 5s 静默轮询、popup 保存逻辑

### [2026-08-07] 正文提取优先走扩展端预提取（content script 注入 innerText）

- **决策类型**：技术选型 / 反爬规避
- **问题描述**：后端 `content_extractor.extract` 用 httpx 抓取，遇到 JS 渲染、登录墙、重定向循环（TooManyRedirects）、反爬 UA 封禁经常失败
- **决策内容**：所有需要正文的链路（智能分流 classify、快速收藏 learning、Tab 单卡收卡、书签双写）都**优先传扩展端预提取的 content**——扩展端通过 `chrome.scripting.executeScript` 注入当前 Tab 的 `document.body.innerText.slice(0, 50000)`；后端抓到失败时降级为 url+title 不阻断流程
- **理由分析**：这是浏览器扩展形态相对纯 Web 的**结构性优势**——Chrome 已经拿到了渲染完成的 DOM，不需要后端重新请求一遍 + 处理登录态 + 对抗反爬。50K 字截断已覆盖 99% 的单篇文章（约 30-50 页）。DeepSeek 输入 128K 上下文，50K 字约 10K tokens，绰绰有余
- **影响范围**：`flowshelf-extension/src/lib/content-extractor.ts`（新建）、`classify.py` 路由 request.content 分支、`CardCreate.content` 字段 + `cards.py` 路由、`LearningItemCreate.content` 字段 + `learning.py` 路由、popup/background 各收藏入口

### [2026-08-07] Content Script Bridge：Web 页拿到 chrome.tabs API 的可行方案

- **决策类型**：架构（跨边界通信）
- **问题描述**：Web 应用的 Tab 管理页 `/tabs` 需要实时获取当前所有 Tab 列表、关闭 Tab、激活 Tab、提取 Tab 正文。但 Web 页面受浏览器沙箱限制，无法直接调用 chrome.tabs API
- **决策内容**：扩展 content script 在 localhost:3000 和 \*.flowshelf.app 注入 bridge.ts，做双向消息桥：
  - Web → Bridge：`window.postMessage({type:'flowshelf:action', action:'getAllTabs', ...}, '*')`
  - Bridge → Background：`chrome.runtime.sendMessage`
  - Background → chrome.tabs.query / remove / update / executeScript
  - 结果沿原路返回
  - 桥空兜底：Web 端首次 `getAllTabs()` 为空，等 1s 重试一次（Service Worker 刚唤醒延迟）
- **理由分析**：
  - 方案 A "Tab 管理页放到扩展 newtab 内做"，意味着要在扩展内重写一套 React+Tailwind+API 封装 + 分组组件，重复成本极高
  - 方案 B（本方案）"Web 页 + Bridge"：Web 端界面 0 重复，Bridge 仅 ~50 行代码
  - 注入域严格白名单（localhost/flowshelf.app），不影响任何第三方网页
- **影响范围**：`flowshelf-extension/src/content/bridge.ts`（新建）+ `frontend/lib/chrome-bridge.ts`（Web 端封装：getAllTabs/closeTab/activateTab/getTabContent/checkBridgeAvailable/onTabEvent）+ `tabs/page.tsx` 所有 Tab 操作

### [2026-08-07] 书签双写：尊重用户习惯的 0 迁移成本同步

- **决策类型**：产品交互
- **决策内容**：不替代原生收藏，而是追加监听。background 监听 `chrome.bookmarks.onCreated` → 3s Map 去抖（避免 Chrome 同步重复触发 DEDUP_WINDOW_MS=3000）→ 同步 POST `/api/learning` → `chrome.notifications` 推送"已同步到 FlowShelf 待学习队列"结果。**不删除原生书签**，FlowShelf 只追加
- **理由分析**：
  - 用户有长年积累的 ⭐️ 肌肉记忆。替代它意味着"教育用户改习惯"，迁移成本极高
  - 双写 0 成本：用户"按以往习惯点 ⭐️"，FlowShelf 自动同步，不需要任何动作
  - 去抖 3s：经验值，实测 Chrome 在跨设备同步时可能在 2s 内对同一书签触发 2 次 onCreated
- **影响范围**：`background/index.ts` 书签事件监听 + 去抖 Map + 通知、`learning.py` 快速保存路由

### [2026-08-07] 三池流动中间层 LearningItem：Tab → 待学习 → 卡片/工具

- **决策类型**：数据模型 / 流程设计
- **决策内容**：新增 `learning_queue` 表（模型 `LearningItem`），作为"快速收藏"→"正式沉淀"的中间流动层。字段：`source_url / title / item_type(article|tool) / content / ai_summary / key_points / ai_tags / tool_description + is_ready(AI 是否补全) + is_converted(是否已转卡片/工具) + converted_id(转换后的 ID) + embedding + 时间戳`。流转规则：快速收藏 → 写 learning_queue（is_ready=False, is_converted=False）→ AI 异步补全 is_ready=True → 用户在 Web 暂存区点"生成知识卡片/加入工具箱"→ convert 写入 Card/Tool → is_converted=True + converted_id=新 ID（learning_queue 记录保留作流转历史，不删除）
- **理由分析**：
  1. **价值门槛落地**：PRD 决策 7"读+生成卡片才进知识库"——待学习队列是"未读"池，knowledge card 是"已沉淀"池，中间必须有门槛；LearningItem 就是门槛载体
  2. **快速收藏（<500ms）可行**：若直接写 Card/Tool 表，空 title/summary 的垃圾数据会污染知识库；LearningItem 隔离未完成状态
  3. **失败重试/手动 enrich**：AI 异步补全失败时，learning_queue 保留 URL+content，用户手动触发 `POST /{id}/enrich` 就能重跑，无需重新收藏
  4. **流转历史**：is_converted 字段可统计"待学习 → 已沉淀"转化率，后续做周报数据支撑
- **影响范围**：`models.py` LearningItem 模型、`schemas.py` LearningItemCreate/Response/ConvertRequest、`learning.py` 6 个端点、`learning_service.py` 服务层、暂存区页 `/learning`（list + convert）

---

## Prompt 迭代记录

### [2026-08-06] 卡片生成 Prompt v0.1（初稿）

- **决策类型**：Prompt 迭代
- **问题描述**：设计卡片生成的初始 Prompt
- **决策内容**：

  ```python
  CARD_GENERATION_PROMPT = """你是一个专业的内容分析助手。请分析以下网页内容，生成结构化的知识卡片。

  ## 任务
  1. 生成摘要：100-200字，概括文章核心观点和价值
  2. 抽取关键观点：3-5条，每条用一句话表达，聚焦核心洞察
  3. 生成标签：3-5个，用于检索，标签应该具体且有区分度

  ## 要求
  - 摘要必须包含文章的核心结论
  - 关键观点应该是文章中的"金句"或核心论点
  - 标签应该是名词性短语，避免太泛的词（如"文章"、"内容"）
  - 输出必须严格遵循 JSON 格式

  ## 输出格式
  {
    "summary": "100-200字摘要",
    "key_points": ["观点1", "观点2", "观点3"],
    "tags": ["标签1", "标签2", "标签3"]
  }

  ## 网页内容
  {content}
  """
  ```

- **测试结果**：待测试
- **改进方向**：
  1. 添加 few-shot 示例
  2. 增加负面示例（避免泛标签）
  3. 增加领域适配

### [2026-08-06] 标签治理 Prompt v0.2（候选词表注入）

- **决策类型**：Prompt 迭代
- **问题描述**：AI 自由生成标签导致同义标签泛滥（SQL / SQL语言 / SQL查询），长尾膨胀使标签筛选栏失效。1000 条内容预计产生 800-1500 个标签，60%+ 为 count=1
- **决策内容**：在 `card_generation.txt` / `tool_classification.txt` 注入 `{candidate_tags}` 占位符，传入现有 Top-30 高频标签；Prompt 明确要求"优先复用现有标签，严禁输出语义重复新标签"
- **效果**：实测创建 SQLZoo 工具，AI 返回 4 个标签全部复用现有标签（SQL / 教程 / 交互式学习 / 数据库），0 个新增同义标签，计数 1→2
- **配套机制**：Prompt 引导（闸门 1）+ `normalize_tags` 字符串相似度去重（闸门 2）双保险
- **后续改进**：接入独立 Embedding 服务后，闸门 2 的字符串相似度可升级为余弦相似度，覆盖跨语言同义（"数据库" / "database"）

### [2026-08-07] 卡片生成 Prompt v1.0（字数硬约束 + 反罗列 + 自检）

- **决策类型**：Prompt 迭代
- **问题描述**：v0.2 在 5 个真实网页上跑基线测试，暴露 3 个质量问题：
  1. **摘要频繁超字**：5 篇中 3 篇摘要超 200 字上限（236/246/261 字），最严重超 61 字
  2. **观点超字**：5 篇中共 6 条 key_points 超 50 字限制（最长 69 字）
  3. **摘要偏"功能清单罗列"**：FastAPI / 智谱 API / React Hooks 三篇摘要用"介绍了 A、B、C，其中 A 用于…，B 用于…"句式罗列功能点，而非提炼主张与结论
- **v0.2 基线数据**（5 篇平均）：摘要超字率 60%，观点超字率 23%（6/26），质量总均 3.3/5
- **决策内容**（v1.0 改动，仅改 `card_generation.txt`）：
  1. **字数硬约束**：summary 从"100-200 字"改为"100-200 字，硬性要求：严禁超过 200 字，宁可精简也不要超字数"；key_points 从"不超过 50 字"改为"严格不超过 50 字，超过时必须精简"
  2. **反罗列导向**：summary 加"必须提炼文章的「核心主张与结论」，而非罗列功能点、参数清单或操作步骤"，并给出正反示例——
     - 反面（禁止）：「文章介绍了 A、B、C、D 等参数，其中 A 用于…，B 用于…」（罗列）
     - 正面（提倡）：「文章主张 X 是解决 Y 问题的关键，其核心论据是 Z。」（提炼）
  3. **观点删操作细节**：key_points 加"只保留「核心洞察 / 关键结论」，删去操作细节与实现步骤"
  4. **输出前自检**：末尾加"输出前自检：summary 是否 ≤200 字？每条 key_points 是否 ≤50 字？若超出请精简后再输出"
- **v1.0 效果**（同 5 篇对比）：
  - 摘要超字率 60% → 0%（5/5 合规，字数 136/117/177/177/145）
  - 观点超字率 23% → 0%（0/24 条超 50 字）
  - 摘要句式从"文章介绍了…"转为"文章主张…/文章指出…"，罗列问题消除
  - 质量总均 3.3 → 4.6（+1.3），其中简洁性 2.4 → 5.0（+2.6 提升最大）
- **成本影响**：v1.0 Prompt 更长导致 input tokens 略增（7104 → 7297，+2.7%），但 output tokens 下降（250 → 211，-15.6%，因摘要更精简），单卡成本基本持平（$0.001065 → $0.001081，+1.5%）
- **未解决**：准确性维度无变化（4.2 → 4.2），因 v1.0 改动聚焦格式约束，未改事实抽取逻辑；v2 可考虑加"事实核对"约束
- **测试脚本**：`scripts/test_prompt_quality.py`，结果存 `prompt_test_v0.2.json` / `prompt_test_v1.0.json`

---

## 踩坑记录

### [2026-08-06] SQLite 存储中文标签导致 LIKE 匹配失效

- **决策类型**：踩坑记录
- **问题描述**：工具箱/卡片库按标签筛选时，中文标签（如"文章"、"待学习"）始终返回空结果，英文标签正常
- **原因**：SQLite 存 JSON 时 `ensure_ascii=True`，中文被转义成 `\uXXXX`，`LIKE` / `cast` 字符串匹配全部失效
- **解决方案**：改用 `json_each` 表值函数解析 JSON 数组、按值精确匹配，不受存储编码影响。模板见 `card_service.get_cards`
- **影响范围**：`card_service.get_cards`、`tool_service.get_tools`、标签聚合接口 `get_tags_with_count`
- **后续改进**：迁移 PostgreSQL 时改用 `@>` 操作符即可，`json_each` 方案兼容性好且无需改业务层

### [2026-08-06] 路由层 get_ai_provider 调用残缺导致 AI 全降级

- **决策类型**：踩坑记录
- **问题描述**：`DEMO_MODE=false` + deepseek 环境下，工具箱标签返回空数组、语义检索失效（看似接口正常，实际 AI 没工作）
- **原因**：`tools.py` / `search.py` 的 `get_ai_provider` 调用只传 `demo_mode + api_key`，未传 `base_url` / `model`，导致 deepseek 的 key 去调默认的 `api.openai.com`，必然 401，AI 调用走降级路径返回空结果
- **解决方案**：补全 `base_url` / `model` / `embedding_model` / `max_tokens` / `temperature` 参数，与 `cards.py` 保持一致
- **影响范围**：`tools.py` 全部路由、`search.py` 语义检索
- **教训**：路由层 provider 初始化应统一抽取为 FastAPI 依赖注入，避免复制粘贴遗漏参数。此类 bug 隐蔽——接口返回 200 但数据为空，易误判为 AI 质量问题

### [2026-08-06] 真语义搜索落地：jieba 关键词匹配无法跨越语义鸿沟

- **决策类型**：踩坑记录 / 技术选型
- **问题描述**：搜「UI」搜不到「蓝湖」（tags=["设计协作","产品设计","团队协作"]）。`search_service` 注释自述"deepseek 无 Embedding API，降级为关键词匹配"，实际 `search_utils.keyword_score` 是 jieba 分词 + 子串匹配，"ui" 在 title/tags/description 任何字段都无子串重叠，必然 0 分。这类查询属于"语义相关但字面无关"（同义词 / 上下位词 / 缩写，是关键词方案的结构性盲区
- **根因**：DeepSeek 官方 API 不支持 embeddings 接口；之前用 `_hash_embedding` 降级生成的 1536 维假向量（用 MD5 字节归一化），存在 Card.embedding 字段但从未真正用于检索。真正的语义检索
- **决策过程（竞品分析 + 方案对比 + 多轮决策）**：

  问题一：搜索架构——「语义鸿沟的行业标准实现是「召回层（Recall） + 重排层（Re-rank） + 生成层（Generate）」三层流水线（Notion AI / Cubox / RAGFlow 等 2024-2025 行业共识架构）。针对 FlowShelf，拆解为三阶段：

  | 层                                          | 作用                                  | Notion AI Q&A 怎么做                         | Cubox / 飞书多维表格怎么做 | FlowShelf MVP 要不要做                    |
  | ------------------------------------------- | ------------------------------------- | -------------------------------------------- | -------------------------- | ----------------------------------------- |
  | **召回层**：向量检索（Bi-Encoder，bge/GTE） | 粗筛，别漏掉正确结果                  | ✅ bi-encoder + turbopuffer 向量库           | ✅ bge 系列，余弦          | ✅ **必做（本次做**                       |
  | **召回层**：关键词检索（BM25/jieba）        | 兜底实体/编号精确匹配                 | ✅ + BM25，用 RRF 与向量融合                 | ✅ jieba + BM25 混合       | ✅ **必做（保留 jieba，混合权重 0.3）**   |
  | **重排层**：Cross-Encoder（bge-reranker）   | 精排，把最相关顶到前面                | ✅ Cross-Encoder 重排 Top-50                 | ⏸️ 收藏量级小，少用        | ⏸️ **MVP 暂不做**（千级数据纯召回已干净） |
  | **重排层**：LLM 重排（Chat API 筛选 ID）    | 用户最初方案：把 Top-N 再喂 LLM 挑 ID | ❌ 不推荐（Chat 做重排贵且慢 10×，稳定性差） | ❌ 不用                    | ❌ **否决（否决原因见下）**               |
  | **生成层**：LLM 生成答案（RAG）             | 用户要答案而非文档列表                | ✅ 生成自然语言回答                          | ❌ 纯搜索不用              | ⏸️ 周报/知识助理里做，纯搜索跳过          |

  问题二：Embedding 方案选型（4 方案 RICE 打分，R=Reliability 可靠性 / I=Inference Cost 推理成本 / C=Cost 维护成本 / E=Effectiveness 效果 / E=Engineering 工程复杂度）：

  | 方案                          | 说明                                           | R                                                                                      | I                                         | C                                | E                                          | E                               | 综合    | 结果                                                                       |
  | ----------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- | ------------------------------------------ | ------------------------------- | ------- | -------------------------------------------------------------------------- |
  | **A. 本地 bge-small-zh-v1.5** | sentence-transformers 加载 ~95MB，CPU 可跑     | 5（无外部依赖，永不停用                                                                | 5（零 API 成本）                          | 4（需装 torch/s-t，~200MB 依赖） | 4（MTEB 中文同级最优，512 维）             | 3（懒加载 + 单例 + lru_cache）  | **4.2** | ✅ **入选**                                                                |
  | B. OpenAI 兼容 embeddings API | DeepSeek embeddings API                        | 2（DeepSeek 官方确认不支持 embeddings，无替代品通义/硅基流动免费可用但有外部依赖风险） | 4（$0.02/1M tokens，便宜）                | 5（无额外依赖）                  | 5（text-embedding-3-small 英文强中文一般） | 5（直接调 API，最省事）         | 4.2     | ❌ 有停用风险（DeepSeek key 无法用，换供应商要改环境变量）                 |
  | C. 硅基流动 bge-m3 API        | 国内免费托管 bge-m3，中文更强（多语言/多粒度） | 3（API 有停用/限流/额度 3 重外部风险）                                                 | 5（免费额度够 MVP，0）                    | 5（无额外依赖）                  | 5（bge-m3 比 bge-small 强一个档次）        | 5（和本地一样快，直接 HTTP 请求 | 4.6     | ⏸️ 备选，v2 阶段升级时考虑替换本地模型（复用 provider 抽象，不用改业务层） |
  | D. pgvector + 远程 embedding  | 先上 PostgreSQL                                | 2（要额外装 pgvector，MVP 阶段过重）                                                   | 4（要维护 Postgres + 外部 embedding API） | 2（重基础设施）                  | 5（性能上限高）                            | 1（要改数据库，迁移成本高）     | 2.8     | ❌ 过                                                                      |

  问题三：LLM 重排做不做？（用户原方案：向量匹配 → 喂 DeepSeek Chat → AI 筛选 ID → 回库取数据）

  | 维度     | 用 Chat LLM 重排                                  | 用 Cross-Encoder（bge-reranker）                                | FlowShelf 结论                                                    |
  | -------- | ------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
  | 单次成本 | ~¥0.01/次（Top-50 塞给 deepseek-chat，5K tokens） | 便宜 10-20×（硅基流动 bge-reranker 免费额度，或本地推理更便宜） | ⏸️ MVP 阶段 1 暂不加重排                                          |
  | 延迟     | 400-800ms（Chat 生成慢）                          | 100-300ms（Cross-Encoder 前向推理固定时长）                     | ⏸️ MVP 千级数据，纯召回已经够干净，重排没有增益                   |
  | 稳定性   | Chat LLM 输出"主观 ID 列表"，偶发漏判             | 输出 0-1 标准化分数，可阈值过滤，可解释                         | ⏸️ MVP 只接负例：搜「UI 不用，重排能命中」这种"复杂多跳查询才需要 | ⏸️ 过万条数据，召回 50 条开始混进噪声，Cross-Encoder 净化 |

  阶段 1 结论：Embedding 选本地 bge-small-zh-v1.5，搜索 = 向量 × 0.7 + 关键词 × 0.3。重排层生成层留到 v2。理由：\*\*「UI 搜不到蓝湖」的核心矛盾是语义鸿沟，纯向量检索已足够，重排对此类查询无增益，且有增益的场景还没出现 |

- **决策内容**：本地自托管 `BAAI/bge-small-zh-v1.5`（sentence-transformers 加载，512 维，~95MB，CPU 可跑，零外部依赖、永不停用），混合检索：向量 × 0.7 + 关键词 × 0.3。无 embedding 或维度不匹配的老数据自动降级纯关键词。混合检索权重：VECTOR_WEIGHT = 0.7，KEYWORD_WEIGHT = 0.3，MIN_VEC_THRESHOLD = 0.3
- **理由分析**：
  1. **成本**：本地推理零 API 成本，DeepSeek key 继续只负责摘要/标签
  2. **停用风险**：无外部依赖，不会因 API 下线/限流失效
  3. **质量**：bge-small-zh 在 MTEB 中文榜上同量级最优，512 维够 MVP
  4. **可扩展**：provider 抽象层可切换，将来可接硅基流动 bge-m3 加速
  5. **架构对齐**：和行业标准三层流水线的召回层对齐，重排层留扩展点
- **备选方案**：
  - 硅基流动 bge-m3 API（效果更好，v2 升级，复用 provider 抽象直接切）
  - Cross-Encoder 重排（数据过万条后考虑）
  - 上 pgvector（Phase 2 数据库迁移）
- **影响范围**：`providers/local_embedding.py`（新建）、`base.py`、`config.py`、`tool_service.py`、`search_service.py`、`scripts/backfill_embeddings.py`（新建）
- **后续改进**：数据量过万后考虑 Cross-Encoder 重排（`bge-reranker-v2-m3`）；EMBEDDING_PROVIDER 可配置改为硅基流动 bge-m3（效果升级

### [2026-08-06] transformers 5.x 要求 torch>=2.4，与 numpy 2.x 冲突

- **决策类型**：踩坑记录
- **问题描述**：`pip install sentence-transformers` 默认装 transformers 5.14.1 + numpy 2.4.6，运行时报两个错：(1) "Disabling PyTorch because PyTorch >= 2.4 is required but found 2.2.2"；(2) "A module that was compiled using NumPy 1.x cannot be run in NumPy 2.4.6"
- **原因**：torch 2.2.2 编译于 numpy 1.x；transformers 5.x 强制要求 torch>=2.4；pip 默认装最新版导致版本三角冲突
- **解决方案**：`pip install "transformers>=4.41,<5" "numpy<2"` 降级到 transformers 4.57.6 + numpy 1.26.4，与 torch 2.2.2 兼容
- **教训**：Python 生态依赖版本要钉死，不能裸装最新版。requirements.txt 应写 `sentence-transformers>=3.0.0` 并在文档记录兼容版本矩阵（torch 2.2.2 + transformers 4.x + numpy 1.x）

### [2026-08-06] Tool 表无 embedding 字段，SQLite create_all 不自动 ALTER

- **决策类型**：踩坑记录
- **问题描述**：Card 模型早有 embedding 字段，Tool 模型没有。新增 `Tool.embedding` Column 后，`Base.metadata.create_all` 只对不存在的新表生效，已存在的 tools 表不会自动 `ALTER TABLE ADD COLUMN`。项目未用 Alembic，老数据库的 tools 表缺 embedding 列，写入报 `no such column: embedding`
- **解决方案**：在 `backfill_embeddings.py` 回填脚本前置迁移逻辑——用 `inspect(sync_conn).get_columns("tools")` 检测列是否存在，不存在则 `ALTER TABLE tools ADD COLUMN embedding JSON`
- **教训**：SQLite + `create_all` 的项目，模型加字段必须配套 ALTER 脚本；迁移逻辑放在回填脚本里一起跑，对用户更友好（一条命令完成迁移+回填）

### [2026-08-06] bge query 前缀 + 维度不匹配降级，避免老向量误用

- **决策类型**：隐藏需求 / 优化
- **问题描述**：两个隐藏问题在改造中暴露：(1) bge-small-zh-v1.5 官方推荐 query 加前缀"为这个句子生成表示以用于检索相关文章："以提升检索效果，文档不加；(2) 存量 Card.embedding 是 1536 维 hash 假向量，新 bge 向量是 512 维，维度不匹配时直接算余弦相似度会 `_cosine_similarity` 截断到较短长度得到无意义分数
- **解决方案**：
  1. `LocalEmbeddingProvider.embed_text/is_query` 加 `is_query` 参数，True 时自动加前缀
  2. `SearchService._compute_hybrid_score` 严格校验 `len(query_embedding) == len(doc_embedding)`，不匹配降级纯关键词，避免老向量误用
- **影响范围**：`local_embedding.py`、`base.py`（generate_embedding 签名加 is_query）、`search_service.py`
- **后续改进**：回填脚本跑完后所有向量统一 512 维，校验逻辑可简化但保留作防御

### [2026-08-07] 三处搜索框结果不一致（搜索逻辑统一）

- **决策类型**：踩坑记录 / 架构重构
- **问题描述**：搜「智谱」，卡片库 `/cards`=2 条、工具箱 `/toolbox`=0 条、顶部 `/search`=6 条，三处结果数完全不一致。工具箱搜「智谱」=0 但顶部能搜出 3 个工具，说明不是"没有相关工具"而是搜索算法漏掉
- **原因**：Day1 真语义搜索改造只升级了 `/api/search`（SearchService 混合检索），但 `/api/cards`、`/api/tools` 的 `q` 参数仍走旧的 `keyword_score` 纯关键词路径。卡片库/工具箱页面调 `cardsApi.list({q})`/`toolsApi.list({q})`（带 q），不是 `searchApi`，没享受到语义检索。三处搜索逻辑散落在三个 service，"局部升级"遗漏了另两处
- **解决方案**：合并为单一 `/api/search` API + type 参数区分（card/tool/all）；移除 `/api/cards`、`/api/tools` 的 q 参数；SearchResult 扩展 key_points/created_at/visit_count/last_visited_at 4 个 Optional 字段；前端搜索态改调 searchApi + 适配层映射回 Card/Tool。详见"日志记录"2026-08-07 决策条目
- **影响范围**：8 文件（后端 4 + 前端 4）
- **教训**：同一能力的多个入口要做"一致性验收"，不能只验单个入口能用。搜索逻辑散落多处是根因，统一到单一 service 后未来升级改一处全局生效

### [2026-08-07] asyncio.create_task 复用请求 session → 后台 commit 失败（静默丢数据）

- **决策类型**：踩坑记录 / 并发架构
- **问题描述**：初版 `learning_service.create_item` 把 FastAPI 依赖注入的 db session 直接传给 `asyncio.create_task` 的后台任务。接口返回 200 OK，看起来成功，但后台任务执行 `await bg_db.commit()` 时实际抛 `ResourceClosedError` / `StatementError`：请求已结束，session 已被 middleware 关闭，AI 补全结果无法持久化
- **原因**：AsyncSession 的生命周期严格绑定请求上下文，请求一结束就自动 close/expunge，不能传递给另一个 task；接口同步返回 vs 后台异步 commit 的时序竞态**表面成功，实际静默丢失数据**，非常隐蔽
- **解决方案**：后台任务用 `async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)` 自己创建独立会话，`async with session_maker() as bg_db:` 包住所有 DB 操作，成功后 `await bg_db.commit()` 由内部上下文控制生命周期。**FastAPI 后台异步 DB 操作的固定写法**
- **影响范围**：`learning_service.py` 的 `_ai_enrich` 方法完全重写
- **教训**："异步任务不能复用请求生命周期内的 DB 会话"是异步编程基础坑，但实践中第一次遇到极其隐蔽——接口返回 200 会误导你认为成功。开发规范：任何 `create_task`/`BackgroundTasks` 中涉及 DB，一律新开独立 session

### [2026-08-08] Chrome Bridge 首次调用 getAllTabs 返回空（SW 唤醒延迟竞态）

- **决策类型**：踩坑记录 / 跨边界通信
- **问题描述**：直接打开 `/tabs`（Tab 管理页）首次调用 `getAllTabs` 返回空数组 `[]`，等 1-2s 再手动刷新又正常显示所有 Tab
- **原因**：两条链的延迟叠加——(1) Chrome MV3 service_worker 默认休眠，首次 chrome.runtime.sendMessage 需要 ~500ms 唤醒；(2) content script 虽然 document_start 注入，但 bridge 初始化完转发消息有极小时序竞态，首个请求可能在转发通道就绪前到达
- **解决方案**：`tabs/page.tsx` 加兜底：首次 `allTabs.length === 0` → 再等 1s 重试一次（**只重试 1 次**，避免用户没装扩展时死循环）。后续可升级为 "Bridge:ready" 握手消息做严格时序保证
- **影响范围**：`tabs/page.tsx` 开头 `loadAndGroupTabs`
- **教训**：任何跨进程通信（Web ↔ Content Script ↔ Background SW）都要考虑首次唤醒延迟/时序竞态，不能假设第一次调用一定成功

---

## 开发思路实录

> 本节记录"从发现异常到最终解决"的完整思考链路：开发什么功能 → 出现什么 bug/表现 → 觉得哪里不合理 → 调研步骤 → 与 AI 交流决策 → 实施验证 → 反思。区别于"踩坑记录"的结论导向，本节沉淀的是**调试方法论与决策依据**，还原"为什么这么改"的思考过程。

### 案例 1：三处搜索框结果不一致（2026-08-07）

**功能背景**：Day1 落地真语义搜索后，产品有三个搜索入口——卡片库 `/cards`、工具箱 `/toolbox`、顶部 Header 全局搜索 `/search`。期望用户在任何入口搜同一关键词得到一致结果。

**异常表现**：用「智谱」验收，三处结果数完全不一致——卡片库=2、工具箱=0、顶部=6。

**觉得不合理**：(1) 同一产品三处搜索结果不一致，用户无法预期哪个"正确"；(2) 工具箱=0 但顶部能搜出 3 个工具，说明不是"没有相关工具"而是算法漏掉；(3) 卡片库 2 条 ≠ 顶部 card tab 3 条。

**调研步骤**：逐个入口追踪代码路径，定位到三处用了两套算法——卡片库/工具箱走 `/api/cards?q=`、`/api/tools?q=` 纯关键词（jieba+子串），顶部走 `/api/search` 混合检索（向量0.7+关键词0.3）。根因是 Day1 升级语义搜索时只改了 `/api/search`，没回头检查另两个入口的 q 参数。同时发现字段差异约束：SearchResult 缺 key_points/created_at（卡片库渲染需要）和 visit_count/last_visited_at（工具箱渲染需要）。

**与 AI 交流决策**：讨论了两个方案——A 三处都改调 searchApi + 扩展字段；B 混合检索下沉到 CardService/ToolService。选 A，理由是搜索逻辑只保留一份天然保证一致，下沉会重复代码。字段差异用 SearchResult 扩展 4 个 Optional 字段 + 前端适配层映射回 Card/Tool 复用渲染解决。

**实施验证**：8 文件改动（后端 4 + 前端 4），uvicorn 加 `--reload` 重启，浏览器三处搜「智谱」——卡片库=3、工具箱=3、顶部=6（3+3），三处一致 ✅，扩展字段正确渲染 ✅。完整实施细节见 [FlowShelf*Day2*开发记录.md](FlowShelf_Day2_开发记录.md) 第五节。

**反思**：(1) Day1"局部升级"的盲区——升级一个能力要检查所有入口是否都受益；(2) 结果数从 2→3、0→3 增多符合预期（混合检索命中语义相关但字面无关的结果）；(3) 适配层取舍——复用渲染 vs 字段映射维护成本，当前字段稳定划算；(4) 教训：同一能力的多入口必须做"一致性验收"。

### 案例 2：快速收藏的响应式瓶颈——同步等 AI 还是先存后生成（2026-08-07/08）

**功能背景**：popup 是用户浏览网页时随手调用的快速收藏入口。典型流程：用户点 FlowShelf 图标 → popup 展示当前页面信息 + AI 建议类型（卡片/工具）→ 用户确认 → 保存。

**异常表现**：初版按"同步生成"设计——点击保存后直接调 `cardsApi.create(url)` 走完整链路：后端抓正文→AI 生成摘要/标签→写 DB。实测耗时 3-5s（DeepSeek API），popup 长时间停在 loading，用户体验很差。

**觉得不合理**：(1) 3-5s 的交互等待不可接受，"随手收藏"应该是"点一下就走"；(2) 正文抽取 + AI 生成的耗时不是 FlowShelf 能控制的，不能把用户拴在 loading 上。

**调研步骤**：与 AI 交流三个方案——A. 同步等 AI（UI 给 loading 动画）；B. 前端先拿到占位 ID 再轮询；C. 先写 DB 轻量记录，AI 后台异步补全，Web 端单独展示"AI 生成中"状态。

**与 AI 交流决策**：选 C——新增 `learning_queue` 流动中间层（`LearningItem` 模型），快速收藏只存 URL+title+content（<500ms 返回），AI 用 `asyncio.create_task` 后台独立 DB 会话补全；Web 暂存区页展示 `is_ready`/`is_converted` 两个状态；最后用户手动 convert 入卡片/工具库。**这个方案顺便把 PRD 的"价值门槛"（待学习→已沉淀必须读+生成）和"失败重试"（手动 POST `/{id}/enrich`）一次性落地，一石三鸟。**

**实施验证**：首次写 `_ai_enrich` 踩了"复用请求 session"的坑（见踩坑记录），修复为独立 session_maker 后实测 popup 保存 150-300ms 返回 ✅，暂存区页面 5s 轮询静默刷新，AI 补全后 UI 平滑过渡 ✅；书签双写链路也走 learning_queue，用户点 ⭐️ 不感知任何延迟。

**反思**：(1) "先保存后生成"的关键不仅是异步，更重要的是引入**三池流动中间层**——LearningItem 把"快速收藏的未完成态"从知识库隔离，同时赋予价值门槛和失败重试两个衍生能力，一石三鸟。(2) 异步 DB 操作的 session 生命周期是高风险点，需要把"独立 session_maker + async with"的模式固化成开发规范。

### 案例 3：Web 页做 Tab 管理的结构性死穴——Content Script Bridge 选型（2026-08-08）

**功能背景**：PRD 定义 Tab 管理是浏览器扩展的核心能力——AI 归组、快速关闭重复 Tab、一键收卡、行为排序。MVP 期望有一个专门的 `/tabs` 页面承载这些操作。

**出现的结构性死穴**：Tab 列表来源于 `chrome.tabs.query`，Web 页面受浏览器同源沙箱限制，拿不到任何浏览器内部 API。如果 Tab 管理页做在 Web 应用里（如 `/tabs`），**没有任何常规办法让页面获取当前 Tab 列表**。

**调研步骤**：与 AI 讨论两种方案——

- 方案 A：Tab 管理页放到扩展 newtab 内做（或 popup 内扩展视图）。优点：直接调 chrome.tabs，无通信层；缺点：需要在扩展内用 Vite + 原生 React 重写一套 Tailwind/组件/API 封装 + Tab 分组 UI，与 Web 应用现有组件不能复用，维护成本 ×2，后期主题/样式同步要改两处。

- 方案 B：Tab 管理页做在 Web 应用 `/tabs`，通过 content script 做消息桥。优点：Web 端 0 重复，直接复用现有 Tailwind / Header / 筛选组件 / API 封装 / 样式体系；缺点：需要写 bridge 层，跨进程通信有时序/唤醒延迟问题。

**与 AI 交流决策**：选 B。理由：(1) 代码重复的长期维护成本远高于写 bridge 层的一次性成本；(2) MVP 阶段 UI/UX 会频繁调整，Web 应用统一改更高效；(3) Bridge 代码极简——content script 只做转发（`window.postMessage` ↔ `chrome.runtime.sendMessage`），Web 端封装 `getAllTabs/closeTab/activateTab/getTabContent` 四个函数 + `checkBridgeAvailable` 检查。注入域严格白名单 localhost:3000 / \*.flowshelf.app，安全风险可忽略。

**实施验证**：实际编码 `bridge.ts` + `chrome-bridge.ts` 约 100 行。首次遇到"getAllTabs 返回空数组"踩坑（见踩坑记录：SW 唤醒延迟），加"空结果等 1s 重试一次"兜底。最终 Tab 管理页成功显示实时 Tab 列表、支持关闭/激活/分组/提取/收卡，所有操作响应 <100ms，用户体验与原生一致。

**反思**：(1) 遇到结构性死穴（Web 拿不到 chrome.tabs），先问"能不能用扩展的能力搭桥"，不要直接退回到"那就做两套 UI"；(2) "Bridge 模式"在边界打通时非常通用——任何"运行在两个不同上下文中的代码组件需要互通"都可以借鉴：定义消息类型 → 一端 postMessage → 中间层转发 → 另一端调用真实 API → 结果原路返回 → 在 Web 端封装成 Promise 风格的同步 API（内部用 `window.addEventListener('message')` + 请求 ID 匹配 resolve）。(3) Chrome MV3 service worker 休眠是必须考虑的边界情况，任何 bridge 第一次调用都要有兜底重试/超时提示。

---

## 成本/延迟数据

### [2026-08-07] 卡片生成成本/延迟实测（v1.0，5 篇真实网页）

- **测试条件**：DeepSeek-chat（$0.14/1M input，$0.28/1M output），max_tokens=800，temperature=0.3，本地 bge-small-zh-v1.5 embedding
- **测试网页**：FastAPI 教程 / 阮一峰周刊 / RAG 教程 / 掘金 React Hooks / 智谱 API 文档

| 网页             | input tokens | output tokens |     成本(USD) |  抽取延迟 |    LLM 延迟 |      总延迟 |
| ---------------- | -----------: | ------------: | ------------: | --------: | ----------: | ----------: |
| FastAPI 教程     |        3,696 |           222 |     $0.000580 |     601ms |     4,707ms |     5,309ms |
| 阮一峰周刊       |        3,470 |           186 |     $0.000538 |     499ms |     3,699ms |     4,199ms |
| RAG 教程         |       25,065 |           251 |     $0.003579 |     838ms |     4,999ms |     5,837ms |
| 掘金 React Hooks |        2,734 |           220 |     $0.000444 |     445ms |     3,159ms |     3,605ms |
| 智谱 API 文档    |        1,521 |           176 |     $0.000262 |   1,269ms |     2,892ms |     4,162ms |
| **平均**         |    **7,297** |       **211** | **$0.001081** | **730ms** | **3,891ms** | **4,622ms** |

- **长文剔除后**（排除 RAG 教程 25K tokens 异常值，4 篇平均）：input 2,855 tokens，单卡成本 **$0.000456**，达成计划目标 $0.0005 ✅
- **延迟分析**：LLM 延迟 3.9s 是瓶颈，DeepSeek-chat 响应慢于 GPT-4o-mini（300-500ms）约 8-10×；正文抽取 730ms 次之
- **对齐计划目标**：
  - 单卡成本 $0.0005：正常长度文章达标（$0.000456），超长文（RAG 25K tokens）拉高均值至 $0.001081
  - 延迟 1.1s：未达标，DeepSeek API 延迟 3-5s 远超 GPT-4o-mini 的 300-500ms；如切回 GPT-4o-mini 预计总延迟可降至 ~1.2s（抽取 0.7s + LLM 0.5s）
- **优化方向**：长文做摘要前截断（content 超 8K tokens 时取前 6000 字 + 后 2000 字），可控制 input tokens 上限

### [2026-08-07] 搜索延迟实测（混合检索：向量 0.7 + 关键词 0.3）

| 阶段   | 查询        |     延迟 | 结果数 | Top 结果                          |
| ------ | ----------- | -------: | -----: | --------------------------------- |
| 冷启动 | fastapi     | 17,343ms |      8 | First Steps - FastAPI             |
| 热     | RAG         |    242ms |      4 | RAG技术入门：从原理到企业级实践   |
| 热     | React Hooks |     82ms |      8 | React Hooks 最佳实践精读          |
| 热     | API 开发    |     55ms |      9 | 智谱AI大模型API参数详解与使用指南 |
| 热     | 大模型      |     56ms |      3 | 智谱AI大模型API参数详解与使用指南 |
| 热     | python 教程 |     64ms |      8 | SQLZoo SQL互动教程                |

- **冷启动**：17.3s，首次加载 bge-small-zh-v1.5 模型（~95MB）到内存，仅服务启动后首次搜索触发
- **热查询平均**：**100ms**（5 次，55-242ms），语义检索 + 关键词混合打分，9 条数据下性能充裕
- **语义命中验证**："API 开发" 搜到"智谱AI API"（0.61）+ "FastAPI"（0.54），跨字面语义匹配生效；"大模型" 搜到"智谱API"（0.66）+ "RAG"（0.54）准确

### [2026-08-07] 质量评估体系：5 网页 × 3 维度 × v0.2 vs v1.0

**评估维度**（1-5 分）：

- **准确性**：是否准确反映原文核心，无编造
- **简洁性**：字数合规（摘要 ≤200 字，观点 ≤50 字）+ 表达精炼
- **实用性**：摘要提炼主张/结论（非罗列）+ 观点有洞察价值

| 网页             | v0.2 准确 | v0.2 简洁 | v0.2 实用 | v0.2 均 | v1.0 准确 | v1.0 简洁 | v1.0 实用 | v1.0 均 |
| ---------------- | --------: | --------: | --------: | ------: | --------: | --------: | --------: | ------: |
| FastAPI 教程     |         4 |         2 |         3 |     3.0 |         4 |         5 |         4 |     4.3 |
| 阮一峰周刊       |         4 |         4 |         4 |     4.0 |         4 |         5 |         4 |     4.3 |
| RAG 教程         |         5 |         3 |         4 |     4.0 |         5 |         5 |         5 |     5.0 |
| 掘金 React Hooks |         4 |         2 |         3 |     3.0 |         4 |         5 |         5 |     4.7 |
| 智谱 API 文档    |         4 |         1 |         2 |     2.3 |         4 |         5 |         5 |     4.7 |
| **平均**         |   **4.2** |   **2.4** |   **3.2** | **3.3** |   **4.2** |   **5.0** |   **4.6** | **4.6** |

- **质量总均：3.3 → 4.6（+1.3）**
- **准确性 4.2 → 4.2（持平）**：v1.0 未改事实抽取逻辑，符合预期
- **简洁性 2.4 → 5.0（+2.6，提升最大）**：字数硬约束 + 自检机制生效，超字率清零
- **实用性 3.2 → 4.6（+1.4）**：反罗列示例 + "提炼主张"导向，消除"功能清单"问题
- **v0.2 最大短板**：智谱 API 文档（2.3 分），摘要 261 字罗列 7 个参数名，无主张；v1.0 修正为"合理配置采样参数是平衡确定性与多样性的关键"
- **评估方法**：客观打分，不只报喜——v0.2 准确性虽 4.2 但简洁性仅 2.4 是真实短板；v1.0 简洁性满分但准确性未提升是未解决问题

---

## 用户测试反馈

### [2026-08-07] 待用户访谈（M0 阶段）

---

## 版本历史

| 版本 | 日期       | 变更说明                                                                                                                                                                                                                                                                                  |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1 | 2026-08-06 | 初始版本，记录项目启动阶段的决策                                                                                                                                                                                                                                                          |
| v0.2 | 2026-08-06 | 追加真语义搜索改造的踩坑与决策（bge-small-zh 本地化、版本冲突、SQLite 迁移、维度校验）                                                                                                                                                                                                    |
| v0.3 | 2026-08-07 | Prompt v1.0 迭代（字数硬约束+反罗列+自检）、质量评估体系（5×3 维度）、成本/延迟实测数据                                                                                                                                                                                                   |
| v0.4 | 2026-08-07 | 三处搜索逻辑统一为单一 /api/search API（决策+踩坑）、新增"开发思路实录"章节（案例 1）                                                                                                                                                                                                     |
| v0.5 | 2026-08-08 | Phase 2 启动：Chrome MV3 扩展脚手架+4 入口职责划分、LearningQueue 流动中间层、快速收藏先存后生成（独立 session）、正文预提取规避反爬、Content Script Bridge 打通 Web↔chrome.tabs、书签双写 0 迁移、Tab 管理页+暂存区页+Bookmarklet 页+Header 四大入口。开发思路实录 +案例 2/3，踩坑 +2 条 |

---

**日志持续更新中...**
