"""
AI Provider 抽象层

支持真实模式（调用 LLM API）和 DEMO 模式（返回模拟数据）

兼容性说明：
- 使用 JSON mode（response_format=json_object）而非 OpenAI 结构化输出（json_schema），
  保证 DeepSeek / 通义千问 / Moonshot 等 OpenAI 兼容服务都能用
- Embedding 调用失败时优雅降级为 hash 向量，不阻断建卡流程
  （DeepSeek 无 Embedding API，等 Phase 1 任务 6 接入独立 Embedding 服务）
"""

import hashlib
import json
import logging
import os
from abc import ABC, abstractmethod
from functools import lru_cache
from typing import List, Optional

from openai import AsyncOpenAI, APIError, APITimeoutError, RateLimitError

from app.db.schemas.ai_schemas import CardAIOutput, ToolClassificationOutput

logger = logging.getLogger(__name__)

_PROMPT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")


@lru_cache()
def _load_prompt(name: str) -> str:
    """从 app/prompts/ 加载 Prompt 文本，缓存结果"""
    path = os.path.join(_PROMPT_DIR, f"{name}.txt")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _hash_embedding(text: str, dim: int = 1536) -> List[float]:
    """无 Embedding API 时的兜底：基于文本 hash 生成伪向量（不可用于真实语义检索）"""
    hash_bytes = hashlib.md5(text.encode()).digest()
    base = [b / 255.0 for b in hash_bytes]
    return (base * (dim // 16 + 1))[:dim]


class BaseAIProvider(ABC):
    """AI Provider 基类"""

    @abstractmethod
    async def generate_card(
        self, url: str, content: str, candidate_tags: Optional[List[str]] = None
    ) -> dict:
        """
        生成知识卡片

        Args:
            candidate_tags: 现有高频标签，注入 Prompt 引导 AI 优先复用，抑制标签膨胀

        Returns:
            {
                "title": str,
                "summary": str,
                "key_points": List[str],
                "tags": List[str],
                "embedding": List[float]
            }
        """
        pass

    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        """生成向量"""
        pass

    async def safe_generate_embedding(self, text: str) -> List[float]:
        """安全的向量生成：失败时降级为 hash 向量，不抛异常。

        供 search_service 等需要容错的场景调用，避免 Embedding 服务不可用
        （如 deepseek 无 Embedding API）导致接口 500。
        """
        try:
            return await self.generate_embedding(text)
        except Exception as exc:
            logger.warning("Embedding 降级为 hash 向量：%s", exc)
            return _hash_embedding(text)

    @abstractmethod
    async def classify_tool(
        self,
        url: str,
        title: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """
        分类工具（用于智能分流）

        Args:
            candidate_tags: 现有高频标签，注入 Prompt 引导 AI 优先复用，抑制标签膨胀

        Returns:
            {"type": str, "tags": List[str]}
        """
        pass


class RealAIProvider(BaseAIProvider):
    """真实 AI Provider（调用 OpenAI 兼容 API）"""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        embedding_model: str = "text-embedding-3-small",
        base_url: str = "",
        max_tokens: int = 500,
        temperature: float = 0.3,
    ):
        client_kwargs = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url
        self.client = AsyncOpenAI(**client_kwargs)
        self.model = model
        self.embedding_model = embedding_model
        self.max_tokens = max_tokens
        self.temperature = temperature

    async def generate_card(
        self, url: str, content: str, candidate_tags: Optional[List[str]] = None
    ) -> dict:
        """调用 LLM 生成卡片（JSON mode + Pydantic 校验 + Embedding 降级）"""
        # 1. 加载并填充 Prompt（注入候选标签库，引导 AI 优先复用）
        prompt_template = _load_prompt("card_generation")
        user_prompt = prompt_template.format(
            url=url,
            content=content or "(正文为空)",
            candidate_tags="、".join(candidate_tags) if candidate_tags else "（暂无）",
        )

        # 2. 调用 LLM（JSON mode，兼容 DeepSeek 等非 OpenAI 服务）
        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是 FlowShelf 的知识策展助手，必须严格按 JSON 格式输出。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=self.max_tokens,
                temperature=self.temperature,
            )
        except APITimeoutError:
            raise RuntimeError("AI 调用超时")
        except RateLimitError:
            raise RuntimeError("AI 调用触发限流，请稍后重试")
        except APIError as exc:
            raise RuntimeError(f"AI 调用失败：{exc.__class__.__name__}: {exc}")

        raw = completion.choices[0].message.content or ""

        # 3. 解析 JSON + Pydantic 校验
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise RuntimeError(f"AI 返回非合法 JSON：{raw[:200]}")

        try:
            parsed = CardAIOutput.model_validate(data)
        except Exception as exc:
            raise RuntimeError(f"AI 输出校验失败：{exc}")

        # 4. 生成 embedding（失败时降级为 hash 向量，不阻断建卡）
        embed_text = "\n".join([parsed.title, parsed.summary, *parsed.key_points])
        embedding = await self.safe_generate_embedding(embed_text)

        return {
            "title": parsed.title,
            "summary": parsed.summary,
            "key_points": parsed.key_points,
            "tags": parsed.tags,
            "embedding": embedding,
        }

    async def generate_embedding(self, text: str) -> List[float]:
        """调用 Embedding API（若服务商不支持则抛 RuntimeError）"""
        try:
            resp = await self.client.embeddings.create(
                model=self.embedding_model,
                input=text,
            )
            return resp.data[0].embedding
        except (APITimeoutError, RateLimitError, APIError) as exc:
            raise RuntimeError(f"Embedding 生成失败：{exc.__class__.__name__}")

    async def classify_tool(
        self,
        url: str,
        title: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """调用 LLM 分类工具（JSON mode + 候选标签库注入）"""
        # 加载 Prompt 模板并注入候选标签库，引导 AI 优先复用现有标签
        prompt_template = _load_prompt("tool_classification")
        user_prompt = prompt_template.format(
            url=url,
            title=title,
            content=(content or "")[:1000],
            candidate_tags="、".join(candidate_tags) if candidate_tags else "（暂无）",
        )

        try:
            completion = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是 FlowShelf 的收藏分流助手，必须严格按 JSON 格式输出。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=200,
                temperature=self.temperature,
            )
        except (APITimeoutError, RateLimitError, APIError) as exc:
            logger.warning("AI 分类失败，降级为 article：%s", exc)
            return {"type": "article", "tags": []}

        try:
            data = json.loads(completion.choices[0].message.content or "{}")
            parsed = ToolClassificationOutput.model_validate(data)
            return {"type": parsed.type, "tags": parsed.tags}
        except Exception:
            logger.warning("AI 分类输出解析失败，降级为 article")
            return {"type": "article", "tags": []}


class DemoAIProvider(BaseAIProvider):
    """DEMO 模式 AI Provider（返回模拟数据）"""

    async def generate_card(
        self, url: str, content: str, candidate_tags: Optional[List[str]] = None
    ) -> dict:
        """返回模拟卡片数据"""
        return {
            "title": f"来自 {url[:30]} 的卡片",
            "summary": f"这是对文章《{content[:50]}...》的摘要。文章主要讨论了相关技术的核心原理和最佳实践，为读者提供了全面的参考。",
            "key_points": [
                "核心观点 1：技术选型需要综合考虑成本和性能",
                "核心观点 2：良好的架构设计是项目成功的关键",
                "核心观点 3：持续的迭代和优化比一次性完美更重要",
            ],
            "tags": ["技术", "架构", "最佳实践"],
            "embedding": [0.1] * 1536,
        }

    async def generate_embedding(self, text: str) -> List[float]:
        """返回模拟向量"""
        return _hash_embedding(text)

    async def classify_tool(
        self,
        url: str,
        title: str,
        content: str,
        candidate_tags: Optional[List[str]] = None,
    ) -> dict:
        """返回模拟分类结果"""
        url_lower = url.lower()
        if any(
            keyword in url_lower for keyword in ["tool", "app", "dashboard", "console"]
        ):
            return {"type": "tool", "tags": ["工具", "常用"]}
        elif any(keyword in url_lower for keyword in ["video", "youtube", "bilibili"]):
            return {"type": "video", "tags": ["视频"]}
        else:
            return {"type": "article", "tags": ["文章", "待学习"]}


def get_ai_provider(
    demo_mode: bool = True,
    api_key: str = "",
    base_url: str = "",
    model: str = "gpt-4o-mini",
    embedding_model: str = "text-embedding-3-small",
    max_tokens: int = 500,
    temperature: float = 0.3,
) -> BaseAIProvider:
    """获取 AI Provider 实例"""
    if demo_mode:
        return DemoAIProvider()
    return RealAIProvider(
        api_key=api_key,
        model=model,
        embedding_model=embedding_model,
        base_url=base_url,
        max_tokens=max_tokens,
        temperature=temperature,
    )
