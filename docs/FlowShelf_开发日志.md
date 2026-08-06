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

---

## 成本/延迟数据

### [2026-08-06] 待测试

---

## 用户测试反馈

### [2026-08-06] 待测试

---

## 版本历史

| 版本 | 日期       | 变更说明                         |
| ---- | ---------- | -------------------------------- |
| v0.1 | 2026-08-06 | 初始版本，记录项目启动阶段的决策 |

---

**日志持续更新中...**
