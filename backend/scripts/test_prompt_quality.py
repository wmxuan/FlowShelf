"""
Prompt 质量与成本/延迟测试脚本

功能：
1. 对 5 个测试 URL 跑卡片生成，记录：title/summary/key_points/tags + token 用量 + 延迟
2. 直接调用 LLM（绕过 generate_card 封装），以捕获 completion.usage（prompt/completion/total tokens）
3. 结果输出为 JSON，便于 v0.2 vs v1.0 对比
4. 附加：搜索延迟测试（5 次 GET /api/search）

用法：
    cd backend
    venv/bin/python scripts/test_prompt_quality.py            # 跑 prompt 测试
    venv/bin/python scripts/test_prompt_quality.py --search   # 跑搜索延迟测试

注意：脚本读取当前 app/prompts/card_generation.txt，所以改完 Prompt 重跑即可对比。
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

# 把 backend 目录加入 sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.core.database import async_session_maker
from app.tools.content_extractor import content_extractor
from app.db.schemas.ai_schemas import CardAIOutput
from app.services.tag_service import get_candidate_tags, normalize_tags

# 测试 URL（覆盖 5 类：技术教程 / 博客周刊 / RAG教程 / 掘金文章 / API文档）
TEST_URLS = [
    ("技术教程", "https://fastapi.tiangolo.com/tutorial/first-steps/"),
    ("博客周刊", "https://www.ruanyifeng.com/blog/2024/01/weekly-issue-288.html"),
    (
        "RAG教程",
        "https://datawhalechina.github.io/easy-vibe/zh-cn/stage-3/ai-advanced/rag-introduction/",
    ),
    ("掘金文章", "https://juejin.cn/post/6844903938093744135"),
    ("API文档", "https://docs.bigmodel.cn/cn/guide/start/concept-param"),
]

# DeepSeek-chat 价格（美元 / 1M tokens）
PRICE_INPUT_PER_1M = 0.14
PRICE_OUTPUT_PER_1M = 0.28

_PROMPT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app", "prompts")


def load_prompt() -> str:
    with open(
        os.path.join(_PROMPT_DIR, "card_generation.txt"), "r", encoding="utf-8"
    ) as f:
        return f.read()


async def get_candidate_tags_async() -> list:
    """获取候选标签库 Top-30"""
    async with async_session_maker() as session:
        return await get_candidate_tags(session, "cards", top_n=30)


async def run_one(
    client: AsyncOpenAI,
    model: str,
    max_tokens: int,
    temperature: float,
    label: str,
    url: str,
    candidate_tags: list,
) -> dict:
    """对单个 URL 跑一次卡片生成，记录 token + 延迟 + 输出"""
    t0 = time.perf_counter()

    # 1. 正文抽取
    extraction = await content_extractor.extract(url)
    extract_ms = (time.perf_counter() - t0) * 1000
    if not extraction.success:
        return {
            "label": label,
            "url": url,
            "error": f"抽取失败: {extraction.error}",
            "extract_ms": round(extract_ms, 1),
        }

    # 2. 填充 Prompt
    prompt_template = load_prompt()
    user_prompt = prompt_template.format(
        url=url,
        content=extraction.content or "(正文为空)",
        candidate_tags="、".join(candidate_tags) if candidate_tags else "（暂无）",
    )

    # 3. 调用 LLM（捕获 usage）
    t1 = time.perf_counter()
    try:
        completion = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "你是 FlowShelf 的知识策展助手，必须严格按 JSON 格式输出。",
                },
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except Exception as exc:
        llm_ms = (time.perf_counter() - t1) * 1000
        return {
            "label": label,
            "url": url,
            "error": f"LLM 调用失败: {exc.__class__.__name__}: {exc}",
            "extract_ms": round(extract_ms, 1),
            "llm_ms": round(llm_ms, 1),
        }
    llm_ms = (time.perf_counter() - t1) * 1000

    usage = completion.usage
    prompt_tokens = usage.prompt_tokens if usage else 0
    completion_tokens = usage.completion_tokens if usage else 0
    total_tokens = usage.total_tokens if usage else 0

    # 4. 解析 + 校验
    raw = completion.choices[0].message.content or ""
    try:
        data = json.loads(raw)
        parsed = CardAIOutput.model_validate(data)
        title = parsed.title
        summary = parsed.summary
        key_points = parsed.key_points
        tags = parsed.tags
        parse_ok = True
        parse_error = None
    except Exception as exc:
        title = None
        summary = None
        key_points = None
        tags = None
        parse_ok = False
        parse_error = f"{exc.__class__.__name__}: {exc}"

    # 5. 标签归一化（与生产逻辑一致）
    normalized_tags = normalize_tags(tags, candidate_tags) if tags else []

    # 成本（美元）
    cost_usd = (
        prompt_tokens / 1_000_000 * PRICE_INPUT_PER_1M
        + completion_tokens / 1_000_000 * PRICE_OUTPUT_PER_1M
    )

    total_ms = (time.perf_counter() - t0) * 1000

    return {
        "label": label,
        "url": url,
        "extracted_title": extraction.title,
        "content_chars": len(extraction.content or ""),
        "title": title,
        "summary": summary,
        "summary_chars": len(summary) if summary else 0,
        "key_points": key_points,
        "key_points_count": len(key_points) if key_points else 0,
        "tags_raw": tags,
        "tags_normalized": normalized_tags,
        "tokens": {
            "prompt": prompt_tokens,
            "completion": completion_tokens,
            "total": total_tokens,
        },
        "cost_usd": round(cost_usd, 6),
        "latency_ms": {
            "extract": round(extract_ms, 1),
            "llm": round(llm_ms, 1),
            "total": round(total_ms, 1),
        },
        "parse_ok": parse_ok,
        "parse_error": parse_error,
    }


async def run_prompt_test(label: str):
    """跑 5 个 URL 的 Prompt 测试"""
    settings = get_settings()
    print(f"\n{'='*60}")
    print(f"Prompt 测试: {label}")
    print(
        f"模型: {settings.AI_MODEL} | max_tokens={settings.AI_MAX_TOKENS} | temp={settings.AI_TEMPERATURE}"
    )
    print(f"{'='*60}")

    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL
    )
    candidate_tags = await get_candidate_tags_async()
    print(f"候选标签库({len(candidate_tags)}): {candidate_tags[:10]}...")

    results = []
    for i, (cat, url) in enumerate(TEST_URLS, 1):
        print(f"\n[{i}/{len(TEST_URLS)}] {cat}: {url}")
        r = await run_one(
            client,
            settings.AI_MODEL,
            settings.AI_MAX_TOKENS,
            settings.AI_TEMPERATURE,
            f"{cat}",
            url,
            candidate_tags,
        )
        results.append(r)
        if r.get("error"):
            print(f"  ❌ {r['error']}")
        else:
            print(f"  标题: {r['title']}")
            print(f"  摘要({r['summary_chars']}字): {r['summary'][:80]}...")
            print(f"  观点({r['key_points_count']}条): {r['key_points']}")
            print(f"  标签: raw={r['tags_raw']} -> norm={r['tags_normalized']}")
            print(
                f"  tokens: in={r['tokens']['prompt']} out={r['tokens']['completion']} total={r['tokens']['total']}"
            )
            print(
                f"  成本: ${r['cost_usd']:.6f} | 延迟: extract={r['latency_ms']['extract']}ms llm={r['latency_ms']['llm']}ms total={r['latency_ms']['total']}ms"
            )

    # 汇总
    ok = [r for r in results if r.get("parse_ok")]
    if ok:
        avg_in = sum(r["tokens"]["prompt"] for r in ok) / len(ok)
        avg_out = sum(r["tokens"]["completion"] for r in ok) / len(ok)
        avg_cost = sum(r["cost_usd"] for r in ok) / len(ok)
        avg_llm = sum(r["latency_ms"]["llm"] for r in ok) / len(ok)
        avg_total = sum(r["latency_ms"]["total"] for r in ok) / len(ok)
        print(f"\n{'='*60}")
        print(f"汇总({len(ok)}/{len(results)} 成功):")
        print(f"  平均 input tokens:  {avg_in:.0f}")
        print(f"  平均 output tokens: {avg_out:.0f}")
        print(f"  平均单卡成本:       ${avg_cost:.6f}")
        print(f"  平均 LLM 延迟:      {avg_llm:.0f}ms")
        print(f"  平均总延迟(含抽取): {avg_total:.0f}ms")
        print(f"  总成本:             ${sum(r['cost_usd'] for r in ok):.6f}")

    # 保存结果
    out_path = Path(__file__).parent.parent / f"prompt_test_{label}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"label": label, "results": results}, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存: {out_path}")
    return results


async def run_search_test():
    """测搜索延迟（1 次冷启动 + 5 次热查询）"""
    import httpx

    cold_query = "fastapi"
    warm_queries = ["RAG", "React Hooks", "API 开发", "大模型", "python 教程"]
    print(f"\n{'='*60}")
    print("搜索延迟测试（冷启动 + 5 次热查询）")
    print(f"{'='*60}")
    results = []
    async with httpx.AsyncClient(timeout=60) as client:
        # 冷启动（首次加载 bge 模型 ~95MB）
        t0 = time.perf_counter()
        resp = await client.get(
            "http://localhost:8000/api/search", params={"q": cold_query, "type": "all"}
        )
        ms = (time.perf_counter() - t0) * 1000
        data = resp.json()
        n = len(data.get("results", []))
        results.append(
            {
                "query": cold_query,
                "phase": "cold_start",
                "latency_ms": round(ms, 1),
                "results": n,
            }
        )
        print(f"  [冷启动] '{cold_query}': {ms:.0f}ms | results={n}")

        # 热查询
        for q in warm_queries:
            t0 = time.perf_counter()
            resp = await client.get(
                "http://localhost:8000/api/search", params={"q": q, "type": "all"}
            )
            ms = (time.perf_counter() - t0) * 1000
            data = resp.json()
            n = len(data.get("results", []))
            top = data.get("results", [{}])[0].get("title", "")[:30] if n else ""
            results.append(
                {
                    "query": q,
                    "phase": "warm",
                    "latency_ms": round(ms, 1),
                    "results": n,
                    "top": top,
                }
            )
            print(f"  [热] '{q}': {ms:.0f}ms | results={n} | top={top}")

    warm = [r for r in results if r["phase"] == "warm"]
    if warm:
        avg = sum(r["latency_ms"] for r in warm) / len(warm)
        print(f"\n  冷启动延迟: {results[0]['latency_ms']:.0f}ms")
        print(f"  热查询平均延迟: {avg:.0f}ms (5 次)")
    out_path = Path(__file__).parent.parent / "search_test.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"结果已保存: {out_path}")
    return results


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--search", action="store_true", help="只跑搜索延迟测试")
    parser.add_argument("--label", default=None, help="Prompt 测试标签（默认 v0.2）")
    args = parser.parse_args()

    if args.search:
        await run_search_test()
    else:
        label = args.label or "v0.2"
        await run_prompt_test(label)


if __name__ == "__main__":
    asyncio.run(main())
