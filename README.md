# FlowShelf - AI 原生数字资产管家

> **版本**：v1.0 MVP 开发版
> **日期**：2026-08-06
> **状态**：开发中

## 📖 文档索引

- [FlowShelf_PRD_v1.0.md](docs/FlowShelf_PRD_v1.0.md) - 产品需求文档（完整产品设计）
- [FlowShelf_PRD_v1.1_dev.md](docs/FlowShelf_PRD_v1.1_dev.md) - 开发版 PRD（技术规范 + 功能清单）
- [FlowShelf_开发计划.md](docs/FlowShelf_开发计划.md) - 分阶段开发计划
- [FlowShelf_开发日志.md](docs/FlowShelf_开发日志.md) - 开发决策记录

## 🏗️ 项目结构

```
FlowShelf/
├── docs/                           # 产品文档
├── frontend/                       # Web 应用（Next.js 14）
├── backend/                        # 后端服务（FastAPI）
├── flowshelf-extension/            # 浏览器扩展（Chrome MV3）
└── README.md                       # 本文件
```

## 🚀 快速开始

### 1. 启动后端服务

```bash
cd backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量文件
cp .env.example .env
# 编辑 .env，设置 DEMO_MODE=true（Phase 1 开发阶段用 DEMO 模式）

# 启动服务
uvicorn app.main:app --reload --port 8000
```

后端服务将在 `http://localhost:8000` 运行。

### 2. 启动前端 Web 应用

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端应用将在 `http://localhost:3000` 运行。

### 3. 浏览器扩展（Phase 2 开发）

```bash
cd flowshelf-extension

# 安装依赖
npm install

# 开发模式
plasmo dev

# 加载扩展
# 1. 打开 Chrome，访问 chrome://extensions/
# 2. 开启开发者模式
# 3. 点击"加载已解压的扩展程序"
# 4. 选择 build/chrome-mv3-dev 目录
```

## 📋 Phase 1 功能清单

### 后端 API

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/cards` | 创建 AI 知识卡片 |
| GET | `/api/cards` | 获取卡片列表 |
| GET | `/api/cards/{id}` | 获取卡片详情 |
| PUT | `/api/cards/{id}` | 更新卡片 |
| DELETE | `/api/cards/{id}` | 删除卡片 |
| POST | `/api/cards/generate` | 预览 AI 生成结果 |
| POST | `/api/tools` | 收藏工具 |
| GET | `/api/tools` | 获取工具列表 |
| GET | `/api/tools/{id}/visit` | 记录访问 |
| GET | `/api/search?q=` | 语义搜索 |
| GET | `/api/health` | 健康检查 |

### 前端页面

| 路径 | 功能 |
|---|---|
| `/` | 首页（产品介绍） |
| `/cards` | 卡片库（AI 卡片生成 + 列表 + 筛选） |
| `/toolbox` | 工具箱（收藏 + 标签 + 排序） |
| `/search` | 语义搜索 |

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 + React 18 + TypeScript + TailwindCSS |
| 后端 | FastAPI + Pydantic + SQLAlchemy |
| 数据库 | SQLite（Phase 1）→ PostgreSQL（Phase 2） |
| AI | GPT-4o-mini（摘要/标签）+ text-embedding-3-small（检索） |
| 扩展 | Chrome MV3 + Plasmo 框架 |

## 🔧 DEMO_MODE 说明

Phase 1 开发阶段使用 DEMO 模式，无需真实 API Key。设置方式：

```bash
# backend/.env
DEMO_MODE=true
```

DEMO 模式下：
- 卡片生成返回模拟数据
- 语义搜索使用本地实现的向量相似度计算
- 便于快速开发 UI 和调试

## 📝 开发规范

1. **所有 AI 输出必须经过 Pydantic 校验**
2. **所有数据库变更必须生成 Alembic 迁移**
3. **开发决策必须记录在开发日志中**
4. **遵循 PRD 中的禁止事项**

## 🎯 面试素材

本项目作为 AI 产品经理面试亮点项目，请关注：

- [FlowShelf_开发计划.md](docs/FlowShelf_开发计划.md) 中的"面试故事线模板"
- [FlowShelf_开发日志.md](docs/FlowShelf_开发日志.md) 中的决策记录
- 后续生成的用户测试报告和成本/延迟数据

## 📞 联系方式

如有问题，请查阅 docs/ 下的详细文档。

---

**FlowShelf © 2026**