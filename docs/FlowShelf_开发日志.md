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

---

## 成本/延迟数据

### [2026-08-06] 待测试

---

## 用户测试反馈

### [2026-08-06] 待测试

---

## 版本历史

| 版本 | 日期       | 变更说明                                                                               |
| ---- | ---------- | -------------------------------------------------------------------------------------- |
| v0.1 | 2026-08-06 | 初始版本，记录项目启动阶段的决策                                                       |
| v0.2 | 2026-08-06 | 追加真语义搜索改造的踩坑与决策（bge-small-zh 本地化、版本冲突、SQLite 迁移、维度校验） |

---

**日志持续更新中...**
