# FlowShelf Day2 阶段开发记录

> **阶段**：Phase 1（AI 核心链路）收尾 + Phase 2（浏览器扩展）启动
> **日期**：2026-08-07 ~ 2026-08-08
> **状态**：Phase 1 达标 + Phase 2 核心能力全部跑通（扩展脚手架 + 暂存区 + Tab 管理 + 书签双写 + 快速收藏）
> **下一阶段**：Phase 2 细调 + Phase 3 打磨

---

## 一、总体进度概览

| Phase                    | 计划周期 | 完成度   | 状态                                                                                                                                 |
| ------------------------ | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1：AI 核心链路** | Week 1-2 | **100%** | ✅ 全部达标：卡片库+工具箱+语义搜索+搜索一致化，Prompt v1.0、质量评估、成本数据全补齐                                                |
| **Phase 2：浏览器扩展**  | Week 3-4 | **~70%** | ✅ 扩展脚手架 + popup/newtab/background + 智能分流 + 快速收藏 + 书签双写 + Tab 管理 + 暂存区页面；待补：Tab 行为排序、待学习过期提醒 |
| Phase 3：打磨与上线      | Week 5-6 | **0%**   | 未开始                                                                                                                               |

**当前位置**：Phase 2 核心链路已经打通——浏览器 Chrome MV3 扩展已从 0 搭建完成，popup 支持快速收藏（AI 智能分类 + 异步 AI 补全）、background 支持书签双写（点 ⭐️ 自动同步到待学习队列）+ 右键菜单 + 快捷键 Cmd+Shift+S，newtab 覆盖重定向到 `/tabs`。Web 应用补齐三大内容池入口的最后两块：Tab 管理页 + 暂存区（learning）页 + bookmarklet 一键收藏页。

---

## 二、Day2 计划任务完成情况（Phase 1 遗留 3 项 + Day2 计划 3 项外新增）

### Phase 1 遗留补齐（3 项，全部达标）

| #   | 任务               | Day1 状态 | Day2 交付物                                                        | 评分    |
| --- | ------------------ | --------- | ------------------------------------------------------------------ | ------- |
| 1   | Prompt 迭代到 v1.0 | 只到 v0.2 | `card_generation.txt` v1.0（字数硬约束 + 反罗列示例 + 输出前自检） | **5/5** |
| 2   | 质量评估体系       | 完全没有  | 5 网页 × 3 维度 × 双版本对比表（总均 3.3→4.6）                     | **5/5** |
| 3   | 成本/延迟实测      | 完全没有  | 5 篇建卡成本表（单卡 $0.000456 达标）+ 6 次搜索延迟（热查 ~100ms） | **5/5** |

详细数据见 [FlowShelf*Day1*开发记录.md](FlowShelf_Day1_开发记录.md) 的 Day1 遗留章节。

### Phase 2 新增：浏览器扩展 + 三个 Web 页面（计划外 Day2 实际完成）

| #   | 任务                                     | 完成前               | Day2 交付物                                                                                                                                                                                                |
| --- | ---------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | **浏览器扩展脚手架（Chrome MV3）**       | 仅空 package.json    | `flowshelf-extension/` 完整目录：Vite + TypeScript + React，manifest v3，已 build（`dist/` 可加载）                                                                                                        |
| 5   | **扩展 Popup（快速收藏）**               | 无                   | popup 双视图：collect 视图（正文提取 + AI 智能分流 → 确认/修正 → 异步写入待学习队列）、tabs 视图（Tab 归组）                                                                                               |
| 6   | **扩展 Background（Service Worker）**    | 无                   | 右键菜单「📚 收藏到 FlowShelf」+ 快捷键 Cmd+Shift+S（mac）/ Ctrl+Shift+S（win）+ **书签双写**（点 ⭐️ 自动同步待学习队列 + 去抖 3s）+ 通知                                                                  |
| 7   | **扩展 New Tab 覆盖**                    | 无                   | `chrome_url_overrides.newtab` → 纯跳板重定向 Web 应用 `/tabs`（Chrome 限制不允许直接指外部 URL）                                                                                                           |
| 8   | **后端 Tab 管理 API**                    | 无                   | `/api/tabs/group`（AI 批量归组）+ `/api/tabs/assign`（单 Tab 分配到已有分组）                                                                                                                              |
| 9   | **后端智能分流 API**                     | 无                   | `/api/classify`（AI 判断 article/tool/video + 标签提取 + 支持扩展端预传正文跳过后端抓取）                                                                                                                  |
| 10  | **后端待学习队列 API**                   | 无                   | `/api/learning` 6 端点：POST 快速保存（<500ms + 异步 AI 补全）/ GET 列表 / GET 详情 / POST convert / POST enrich / DELETE                                                                                  |
| 11  | **Web：Tab 管理页 /tabs**                | 无                   | Chrome Bridge（扩展 content script ↔ Web 页面双向通信）→ 实时获取当前所有 Tab → AI 归组 → 分组展开/折叠 → 单独 Tab AI 分配分组 → Tab 关闭/激活/正文提取 → 一键收卡（单 Tab 生成卡片） → 全部 HTTP 一键收卡 |
| 12  | **Web：暂存区页 /learning**              | 无                   | article/tool 双 Tab → 未就绪项 5s 轮询静默刷新 → "生成知识卡片/加入工具箱"转换按钮 → 标记已转化 → 删除                                                                                                     |
| 13  | **Web：Bookmarklet 收藏页 /bookmarklet** | 无                   | 接收 `?url=` 参数 → 异步 `cardsApi.create` → 收藏成功/失败三态（loading/success/error） → 关闭窗口或跳转卡片库                                                                                             |
| 14  | **Header 导航**                          | 仅卡片库/工具箱/搜索 | 补齐完整 4 大入口：🗂️ Tab 管理 → 📥 暂存区 → 📚 卡片库 → 🛠️ 工具箱 + 全局搜索框                                                                                                                            |
| 15  | **三处搜索逻辑统一**                     | 算法不一致           | 合并为单一 `/api/search` + type 参数，SearchResult 扩展 4 字段，前端加适配层，三处结果一致（详见第五节案例 1）                                                                                             |

---

## 三、各新增模块详细说明

### 3.1 浏览器扩展（Chrome MV3）

**目录结构**：`flowshelf-extension/`

```
manifest.json                   # MV3，权限 tabs/activeTab/contextMenus/scripting/bookmarks/notifications
src/
├── background/index.ts         # SW：右键菜单 + 快捷键 + 书签双写（onCreated 监听 + 3s 去抖 + notification）
├── content/bridge.ts           # 页面 ↔ Web 双向通信桥（window.postMessage + chrome.runtime 转发）
├── lib/
│   ├── api.ts                  # classifyApi / learningApi / tabsApi + api_base/web_base 可配置
│   ├── content-extractor.ts    # chrome.scripting 注入 innerText 提取（前 50000 字）
│   └── types.ts                # TabInfo / LearningItem / TabGroup 类型
├── popup/                      # 350px 宽弹窗
│   ├── index.tsx               # 双视图：collect（快速收藏）+ tabs（Tab 管理）
│   ├── index.html
│   └── popup.css
└── newtab/                     # New Tab 覆盖
    ├── index.tsx               # 纯跳板：storage 读 flowshelf_web_base → window.location.replace('/tabs')
    ├── index.html
    └── newtab.css
```

**核心设计决策**：

- **快速收藏"先保存后生成"（方案 C）**：popup 点击保存 → POST `/api/learning` 仅存 URL+title+原始正文 → <500ms 返回 → AI 后台 `asyncio.create_task` 异步补全（独立 DB session，不依赖请求生命周期）。避免用户在 popup 等 3-5s。
- **书签双写**：background 监听 `chrome.bookmarks.onCreated`，3s 去抖 → 同步 POST `/api/learning` → `chrome.notifications` 推送结果。不删除原生书签，FlowShelf 只追加，尊重用户习惯。
- **正文预提取**：popup 收藏与书签双写都先在扩展端通过 `chrome.scripting` 注入拿 `document.body.innerText`（50K 字截断），传后端 `/api/classify` 和 `/api/learning`。跳过后端 httpx 抓取，**彻底规避反爬/重定向循环（TooManyRedirects 等）**。
- **CORS 正则支持扩展来源**：后端 `allow_origin_regex=r"chrome-extension://.*"`，开发期扩展 ID 不稳定，不硬编码。

### 3.2 后端新增模块

**新增路由 3 条（共 6 条，原 3 条：cards/tools/search）**：

| 路由 prefix     | 文件        | 主要端点                                                                                                                                    | 职责                                                          |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `/api/tabs`     | tabs.py     | POST `/group`（AI 批量归组）、POST `/assign`（单 Tab 分配已有分组）                                                                         | Tab 智能聚类                                                  |
| `/api/classify` | classify.py | POST `/`（url + title + 可选 content → type article/tool/video + 标签）                                                                     | 扩展 popup 的 AI 智能分流：正文预提取优先，失败降级 url+title |
| `/api/learning` | learning.py | POST `/` 快速保存 · GET `/` 列表 · GET `/{id}` 详情 · POST `/{id}/convert` 转卡片/工具 · POST `/{id}/enrich` 手动补全 · DELETE `/{id}` 删除 | 待学习队列全链路，核心是"快速写入 + 后台 AI 异步补全"         |

**新增 Prompt 文件 3 个（共 5 个，原 2 个：card_generation/tool_generation）**：

```
backend/app/prompts/
├── tab_assign.txt          # 单 Tab 分配 prompt：基于已有分组名+样例，assign 到已有组 or create 新组
├── tab_grouping.txt        # Tab 批量归组 prompt：输入 [{url,title}] 数组，输出 [{name,tab_indices[]}]
└── tool_classification.txt # 分类 prompt：返回 article/tool/video + 3-5 标签 + 原因
```

**新增 DB 模型 1 个（共 4 个，原 3 个：Card/Tool/Tag）**：

- `LearningItem`（表 `learning_queue`）：三池流动中间层——用户快速收藏 → 写入 learning_queue（轻量）→ AI 异步补全 is_ready=True → 用户确认 convert → 写入 Card 或 Tool → is_converted=True 保留流转历史。字段：`source_url/title/item_type(content)/ai_summary/key_points/ai_tags/tool_description + is_ready/is_converted/converted_id/embedding + 时间戳`。

**新增服务层 1 个**：`LearningService`——核心流程：快速保存（<500ms）→ `asyncio.create_task(_ai_enrich)` 后台补全（独立 `async_sessionmaker` 会话，不依赖请求生命周期）→ 补全日志记录成功/失败 → 用户 convert 时复用 CardService/ToolService 不重复造轮子。

### 3.3 Web 应用新增 3 页面 + Header 扩展

**新增页面**（App Router 目录）：

```
frontend/app/
├── tabs/page.tsx            # Tab 管理页：Chrome Bridge 拿 Tab → 分组/分配/关闭/激活/提取/收卡
├── learning/page.tsx        # 暂存区页：article/tool 双 Tab + 5s 轮询静默刷新 + convert/删除
└── bookmarklet/page.tsx     # Bookmarklet 落地页：?url= → cardsApi.create → 成功/失败三态
```

**关键技术点**：

- **Chrome Bridge**（`frontend/lib/chrome-bridge.ts` + `flowshelf-extension/src/content/bridge.ts`）：content script 在 localhost:3000 和 flowshelf.app 注入，做双向消息桥——Web 端 `window.postMessage` 发请求 → bridge → `chrome.runtime.sendMessage` → background → chrome.tabs API 结果 → 原路返回。解决"Web 页面拿不到浏览器 Tab 信息"的结构性限制。
- **5s 静默轮询**（暂存区）：存在未就绪项 → 5s 后 `setTimeout` + `loadItems(silent=true)` 不触发 loading spinner，UI 平滑过渡。
- **Bridge 空兜底**（Tab 管理页）：首次 `getAllTabs()` 为空等 1s 重试一次（Bridge SW 刚唤醒延迟）。
- **Header 4 大入口**：NAV_ITEMS = [/tabs Tab 管理, /learning 暂存区, /cards 卡片库, /toolbox 工具箱] + 全局搜索框 → `/search`。

---

## 四、Day2 技术决策亮点（面试素材）

### 1. 快速收藏"先保存后生成"（方案 C）+ asyncio.create_task 独立会话

popup 交互对延迟极端敏感——"点一下按钮等 5s"不可接受。方案不是"等 AI 生成完再返回"（方案 A/B），而是轻量入库 + 后台异步 AI 补全。关键技术点：用独立 `async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)` 新开 DB 会话，不依赖请求生命周期内的 session。

### 2. 扩展端预提取正文，跳过后端抓取（规避反爬）

后端 httpx 抓取经常遇到重定向循环、JS 渲染、登录墙；而扩展端能直接 `chrome.scripting.executeScript` 读当前页面 innerText。所有需要正文的路径（智能分流、快速收藏、书签双写、Tab 单卡收卡）都优先传扩展端预提取的 `content`，后端抓到失败降级，不阻断流程。**这是浏览器扩展形态相对纯 Web 的核心优势。**

### 3. Content Script Bridge 打通 Web ↔ Chrome.tabs API

Web 页面拿不到 Tab 列表是结构性死穴。解决方案：在 `localhost:3000` 与 `*.flowshelf.app` 注入 content script 做消息桥，`window.postMessage` ↔ `chrome.runtime` 双向转发。**用不到 50 行代码解决了"Web 端 Tab 管理不可行"的大问题，让 Tab 管理页的实时 Tab 列表、关闭/激活 Tab 成为可能。**

### 4. 书签双写（尊重用户习惯 + 3s 去抖）

不替代原生收藏，而是追加监听。`chrome.bookmarks.onCreated` + 3s Map 去抖（避免 Chrome 同步重复触发）+ notification 通知。用户 0 迁移成本——"点 ⭐️ 即同步到 FlowShelf"。

### 5. 搜索一致化"单一 API + 适配层"（重复代码治理）

三处搜索框算法不一致是典型的复制粘贴演化问题。合并为单一 `/api/search` + type 参数，SearchResult 扩展 4 个 Optional 字段（card 特有 + tool 特有），前端 `adaptSearchResultToCard/Tool` 适配层复用渲染。升级改一处全局生效。

---

## 五、开发思路实录

> 本模块记录"从发现异常到最终解决"的完整思考链路。沉淀调试方法论与决策依据。

### 案例 1：三处搜索框结果不一致（搜索逻辑统一）

**功能背景**：真语义搜索落地后有三个搜索入口——卡片库 `/cards`、工具箱 `/toolbox`、顶部 Header 全局搜索 `/search`。期望任何入口搜同一关键词得到一致结果。

**异常表现**：用「智谱」验收，三处结果数完全不一致——卡片库=2、工具箱=0、顶部=6（工具箱搜「智谱」=0 但顶部能搜出 3 个工具，说明不是"没有相关工具"而是算法漏掉）。

**觉得不合理**：(1) 同一产品三处搜索结果不一致，用户无法预期哪个"正确"；(2) 卡片库 2 条 ≠ 顶部 card tab 3 条。

**调研步骤**：逐个入口追踪代码路径，定位到两套算法——卡片库/工具箱走 `/api/cards?q=`、`/api/tools?q=` 纯关键词（jieba+子串），顶部走 `/api/search` 混合检索（向量0.7+关键词0.3）。根因是升级语义搜索时只改了 `/api/search`，没检查另两个入口的 q 参数。同时发现字段差异约束：SearchResult 缺 key_points/created_at（卡片库渲染）和 visit_count/last_visited_at（工具箱渲染）。

**与 AI 交流决策**：方案 A 三处都改调 searchApi + 扩展字段 vs 方案 B 混合检索下沉到 CardService/ToolService，选 A——搜索逻辑只保留一份天然保证一致，下沉会重复代码。字段差异用 SearchResult 扩展 4 Optional 字段 + 前端适配层映射解决。

**实施验证**：8 文件（后端 4 + 前端 4），uvicorn 加 `--reload` 重启，浏览器三处搜「智谱」——卡片库=3、工具箱=3、顶部=6（3+3），三处一致 ✅。

**反思**：(1) "局部升级"必留盲区——升级一个能力要检查所有入口；(2) 结果数从 2→3、0→3 增多符合预期（混合检索命中语义相关但字面无关的结果）；(3) 适配层取舍：复用渲染 vs 字段映射维护成本，当前字段稳定划算。

---

## 六、综合评分

| 维度                          | Day1  | Day2      | 变化 | 说明                                                                                               |
| ----------------------------- | ----- | --------- | ---- | -------------------------------------------------------------------------------------------------- |
| **Phase 1 核心链路完成度**    | 4.2/5 | **5.0/5** | +0.8 | 搜索一致化补齐后，核心链路无短板，真正闭环                                                         |
| **Phase 2 扩展 + 待学习链路** | 0.0/5 | **3.5/5** | +3.5 | 扩展脚手架/Popup/书签双写/Tab API/暂存区 API + Web 3 页全部跑通；待补 Tab 行为排序、待学习过期提醒 |
| **计划符合度**                | 3.5/5 | **4.0/5** | +0.5 | 3 项 Day2 遗留全达标 + 1 项扩展任务超额完成                                                        |
| **面试素材就绪度**            | 3.0/5 | **4.8/5** | +1.8 | 有技术决策链（5 个亮点）+ 质量数据 + 成本数据 + 调试思路 1 案例                                    |
| **整体（Day2 结束）**         | 3.8/5 | **4.5/5** | +0.7 | Phase 2 核心链路已跑通，离完全就绪只差 Phase 2 细调                                                |

---

## 七、遗留问题与 Day3 工作计划

### 遗留问题

| #   | 问题                                     | 严重度 | 阶段         | 说明                                                          |
| --- | ---------------------------------------- | ------ | ------------ | ------------------------------------------------------------- |
| 1   | 建卡延迟未达 1.1s 目标                   | 中     | Phase 3 前   | DeepSeek 3-5s，切 GPT-4o-mini 或做长文截断                    |
| 2   | Tab 管理页 Tab 行为排序（频率+时间衰减） | 中     | Phase 2 细调 | 当前仅按打开顺序，PRD 要求"行为驱动排序（访问频率+时间衰减）" |
| 3   | 待学习过期提醒（7/14/30 天规则）         | 中     | Phase 2 细调 | PRD"待学习队列"要求过期提醒自动触发，目前只靠用户手动清理     |
| 4   | Tab 管理页 Bridge 未安装 Chrome 扩展提示 | 低     | Phase 2 细调 | 非扩展环境打开 /tabs 目前只返回空 Tab，应加引导提示           |
| 5   | 无用户测试数据                           | 中     | Phase 3      | 计划"5-10 人内测"                                             |
| 6   | Prompt 准确性维度未提升（4.2→4.2 平）    | 低     | Phase 1 可选 | v2 可加事实核对约束                                           |
| 7   | 正文抽取对 SPA 兜底弱（纯 Web 场景）     | 低     | Phase 2 可选 | 优先走扩展端预提取已规避大部分，书签双写兜底                  |

### Day3 工作计划

1. **Phase 2 细调（Tab 行为排序 + 待学习过期提醒 + Bridge 引导提示）**
2. **Phase 2 一致性验收**：暂存区 convert 后卡片库/工具箱结果验证；书签双写 → 暂存区 → convert → 卡片库全链路走通
3. **可选**：切换 GPT-4o-mini 测试延迟是否降到 1.2s 内
4. **可选**：Tab 分组结果持久化（当前刷新重算）

---

**Day2 阶段结束，Phase 1 正式完成，Phase 2 核心链路跑通（扩展 + 暂存区 + Tab 管理），进入细调阶段。**
