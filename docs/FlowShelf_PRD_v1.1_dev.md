# FlowShelf 开发版 PRD v1.1

> **文档版本**：v1.1 · 开发执行版
> **日期**：2026-08-06
> **状态**：开发中
> **关联文档**：
> - [FlowShelf_PRD_v1.0.md](FlowShelf_PRD_v1.0.md) - 产品设计完整文档
> - [FlowShelf_开发计划.md](FlowShelf_开发计划.md) - 分阶段开发计划
> - [FlowShelf_对话记录_v1.0.md](FlowShelf_对话记录_v1.0.md) - 需求讨论演进记录

---

## 0. 开发规范速查

### 核心原则

1. **分阶段可交付**：每个 Phase 结束都有可演示的成果
2. **AI 优先**：AI 能力是产品核心，优先开发和验证
3. **最小可行**：先跑通链路，再优化体验
4. **记录决策**：所有技术选型、Prompt 迭代、踩坑经验都要记录

### 技术栈锁定

| 层 | 技术选型 | 版本 | 备注 |
|---|---|---|---|
| 前端框架 | Next.js | 14+ | App Router |
| 前端 UI | React + TypeScript | 18+ | |
| 前端样式 | TailwindCSS | 3+ | |
| 前端组件 | shadcn/ui | latest | 快速构建专业 UI |
| 数据获取 | TanStack Query | 5+ | |
| 状态管理 | Zustand | 4+ | 轻量 |
| 后端框架 | FastAPI | 0.110+ | Python 3.11+ |
| 数据校验 | Pydantic | 2+ | |
| ORM | SQLAlchemy | 2+ | |
| 数据库 | SQLite | 3+ | Phase 1 用，后续可升级 PostgreSQL |
| AI 模型 | GPT-4o-mini | latest | 主模型（摘要/标签） |
| 嵌入模型 | text-embedding-3-small | latest | 语义检索 |
| 浏览器扩展 | Chrome MV3 | Manifest V3 | Plasmo 框架 |
| 部署 | Vercel + Render | - | 前端 Vercel，后端 Render |

### 项目目录结构

```
FlowShelf/
├── docs/                           # 文档
│   ├── FlowShelf_PRD_v1.0.md
│   ├── FlowShelf_PRD_v1.1_dev.md
│   ├── FlowShelf_开发计划.md
│   └── FlowShelf_对话记录_v1.0.md
├── flowshelf-extension/            # 浏览器扩展（Phase 2）
│   ├── src/
│   │   ├── background/
│   │   ├── content/
│   │   ├── popup/
│   │   └── options/
│   └── package.json
├── frontend/                       # Web 应用（Phase 1-2）
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                # 首页
│   │   ├── cards/                  # 知识卡片库
│   │   ├── toolbox/                # 工具箱
│   │   └── search/                 # 语义搜索
│   ├── components/                 # 通用组件
│   ├── features/                   # 业务特性
│   │   ├── cards/
│   │   ├── toolbox/
│   │   └── bookmark/              # 收藏相关
│   ├── hooks/                      # 自定义 hooks
│   ├── services/                   # API 调用
│   ├── stores/                     # Zustand stores
│   ├── types/                      # TypeScript 类型
│   ├── lib/                        # 工具函数
│   └── package.json
├── backend/                        # 后端服务（Phase 1）
│   ├── app/
│   │   ├── api/                    # API 路由
│   │   │   ├── routes/
│   │   │   └── deps.py
│   │   ├── core/                   # 核心配置
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── db/                     # 数据库
│   │   │   ├── models/
│   │   │   └── schemas/
│   │   ├── providers/              # AI Provider 抽象
│   │   │   ├── base.py
│   │   │   ├── real_provider.py
│   │   │   └── demo_provider.py
│   │   ├── prompts/                # Prompt 模板
│   │   │   ├── card_generation.py
│   │   │   └── semantic_search.py
│   │   ├── services/               # 业务服务
│   │   │   ├── card_service.py
│   │   │   ├── toolbox_service.py
│   │   │   └── embedding_service.py
│   │   ├── agents/                 # AI Agent
│   │   └── main.py                 # FastAPI 入口
│   ├── alembic/                    # 数据库迁移
│   ├── tests/                      # 测试
│   └── requirements.txt
└── README.md
```

### 开发命令

```bash
# 前端开发
cd frontend
npm install
npm run dev

# 后端开发
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# 浏览器扩展开发
cd flowshelf-extension
npm install
plasmo dev
```

---

## 1. Phase 1 开发范围（Week 1-2）

### 1.1 核心功能清单

| 功能模块 | 功能点 | 优先级 | 验收标准 |
|---|---|---|---|
| **AI 卡片生成** | URL → 正文抽取 | P0 | 能处理主流网站（博客/新闻/文档） |
| | AI 摘要生成（100-200字） | P0 | 摘要准确、简洁、有价值 |
| | 关键观点抽取（3-5条） | P0 | 观点聚焦、有洞察力 |
| | AI 标签抽取（3-5个） | P0 | 标签具体、有检索价值 |
| | 结构化输出校验 | P0 | 严格按 Pydantic Schema 输出 |
| **卡片库** | 卡片网格展示 | P0 | 2列网格，响应式 |
| | 卡片详情抽屉 | P0 | 不跳页，右侧展开 |
| | 时间筛选（今天/本周/本月） | P1 | 按阅读时间筛选 |
| | 标签筛选 | P1 | 多标签 AND 交叉筛选 |
| **工具箱** | 工具收藏 | P0 | URL + 标题 + 标签存储 |
| | 多标签系统 | P0 | 一个工具可多个标签 |
| | 行为驱动排序 | P1 | 访问频率 + 时间衰减 |
| **语义搜索** | Embedding 向量化 | P0 | text-embedding-3-small |
| | 自然语言检索 | P0 | "我收藏过一个能..." |
| | 相关度排序 | P0 | cosine similarity 排序 |
| **后端** | 卡片 CRUD API | P0 | GET/POST/PUT/DELETE |
| | 工具箱 CRUD API | P0 | GET/POST/PUT/DELETE |
| | 语义搜索 API | P0 | GET /api/search?q= |
| **AI 抽象层** | DEMO_MODE 切换 | P0 | 环境变量控制 |
| | Provider 抽象接口 | P0 | BaseProvider 定义 |

### 1.2 数据模型（简化版）

```python
# 卡片模型
class Card(Base):
    id: int
    source_url: str
    title: str
    ai_summary: str           # 100-200字摘要
    key_points: list[str]     # 3-5条关键观点
    ai_tags: list[str]        # 3-5个标签
    source_type: str          # article | video | document
    embedding: list[float]    # 向量（1536维）
    created_at: datetime
    read_at: datetime | None

# 工具箱模型
class Tool(Base):
    id: int
    url: str
    title: str
    ai_tags: list[str]        # 多标签
    visit_count: int          # 访问次数
    last_visited_at: datetime | None
    created_at: datetime

# 标签模型
class Tag(Base):
    id: int
    name: str
    color: str | None

# 关联表
card_tags: Mapped[list[Tag]]
tool_tags: Mapped[list[Tag]]
```

### 1.3 API 设计

```
# 卡片相关
POST   /api/cards              # 创建卡片（URL → AI 生成）
GET    /api/cards              # 卡片列表（支持筛选、分页）
GET    /api/cards/{id}         # 卡片详情
PUT    /api/cards/{id}         # 更新卡片（修改标签、批注等）
DELETE /api/cards/{id}         # 删除卡片

# 工具箱相关
POST   /api/tools              # 收藏工具
GET    /api/tools              # 工具列表（支持排序、筛选）
GET    /api/tools/{id}         # 工具详情
PUT    /api/tools/{id}         # 更新工具（添加标签等）
DELETE /api/tools/{id}         # 删除工具

# 语义搜索
GET    /api/search?q=          # 语义搜索（卡片 + 工具箱）

# 标签相关
GET    /api/tags               # 所有标签列表

# Bookmarklet
POST   /api/bookmarklet/save   # Bookmarklet 快速收藏
```

### 1.4 AI Prompt 规范

#### 卡片生成 Prompt（初稿）

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

#### 语义搜索 Prompt（初稿）

```python
SEMANTIC_SEARCH_PROMPT = """将用户的搜索意图转化为适合向量检索的查询。

用户输入：{query}

请输出最能代表用户意图的核心关键词或短语，用于与已保存内容的 Embedding 向量进行相似度匹配。
输出：一个简洁的查询字符串，直接用于 Embedding 编码。"""
```

---

## 2. Phase 2 开发范围（Week 3-4）

### 2.1 浏览器扩展功能

| 功能点 | 优先级 | 验收标准 |
|---|---|---|
| 一键收藏（点击图标） | P0 | 自动获取当前页 URL 和标题 |
| AI 智能分流弹窗 | P0 | 展示 AI 推荐归池（工具箱/待学习） |
| Tab 数量统计 | P0 | 实时显示当前 Tab 总数 |
| Tab AI 归组 | P1 | 基于标题/URL 自动聚类 |
| 分组列表展示 | P1 | 显示分组名称和数量 |
| 组级操作 | P2 | 整组转待学习/生成卡片/关闭 |

### 2.2 扩展架构

```
flowshelf-extension/
├── src/
│   ├── background/
│   │   └── index.ts          # Service Worker
│   ├── content/
│   │   └── index.ts          # Content Script
│   ├── popup/
│   │   └── index.tsx         # 弹窗 UI
│   └── options/
│       └── index.tsx         # 设置页面
└── package.json
```

### 2.3 扩展与后端通信

```typescript
// 扩展 → 后端
POST /api/tools/bookmark      // 一键收藏
POST /api/tab/classify        // Tab 分类请求

// 后端 → 扩展
WebSocket: /ws/extension        // 实时数据同步
```

---

## 3. Phase 3 开发范围（Week 5-6）

### 3.1 打磨与上线

| 任务 | 说明 |
|---|---|
| UI 打磨 | 细节优化、动效调整、响应式适配 |
| 错误处理 | 网络异常、AI 调用失败、降级策略 |
| 加载状态 | Skeleton、进度条、空状态 |
| 部署上线 | Vercel + Render，配置环境变量 |
| 域名绑定 | flowshelf.app（或子域名） |

### 3.2 用户测试

| 步骤 | 说明 |
|---|---|
| 招募用户 | 5-10 位目标用户（知识工作者/产品经理） |
| 测试场景 | 3 个核心场景（卡片生成/工具箱/语义搜索） |
| 数据收集 | 完成率、满意度、错误率 |
| 反馈收集 | 结构化问卷 + 开放式访谈 |
| 迭代优化 | 基于反馈调整 2-3 个关键问题 |

### 3.3 面试素材准备

| 素材 | 说明 |
|---|---|
| 项目介绍 PPT | 10-15 页，涵盖问题洞察→产品设计→技术实现→成果展示 |
| Demo 视频 | 3-5 分钟录屏，展示核心流程 |
| 开发日志 | 技术决策、Prompt 迭代、踩坑经验 |
| 数据报告 | 用户测试数据、成本/延迟数据 |
| 思考总结 | AI PM 能力模型、项目反思 |

---

## 4. AI 质量评估体系

### 4.1 卡片生成评估

| 评估维度 | 权重 | 评估标准 |
|---|---|---|
| 摘要准确性 | 40% | 是否准确概括文章核心内容 |
| 摘要简洁性 | 20% | 是否精炼、无冗余信息 |
| 观点相关性 | 25% | 是否是文章的核心观点 |
| 标签实用性 | 15% | 是否便于检索和分类 |

### 4.2 语义搜索评估

| 评估维度 | 权重 | 评估标准 |
|---|---|---|
| 召回率 | 40% | 相关内容是否都能被检索到 |
| 精确率 | 30% | 检索结果是否相关 |
| 用户满意度 | 30% | 用户对搜索结果的主观评分 |

### 4.3 成本与延迟指标

| 指标 | 目标值 | 备注 |
|---|---|---|
| 单卡生成成本 | ≤ $0.001 | GPT-4o-mini |
| 单卡生成延迟 | ≤ 2s | 含正文抽取 |
| 语义搜索延迟 | ≤ 500ms | |
| 日运营成本 | ≤ $1 | 50 张卡/天 |

---

## 5. 禁止事项

- 不得引入微服务、Kubernetes、Redis、Celery
- 不得在 Phase 1 引入多 Agent 协作
- 不得在 Phase 1 实现知识图谱
- 不得在代码中硬编码 API Key
- 不得在工具箱中引入文件夹模型
- 不得让未读内容直接进入知识卡片库
- 不得为了追求完美而延迟交付

---

**文档结束**