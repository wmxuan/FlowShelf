"""
回填 Embedding 脚本

功能：
1. 迁移：给 tools 表加 embedding 列（ALTER TABLE，如果不存在）
2. 回填：为所有 Card / Tool 生成真实 embedding（bge-small-zh-v1.5，512 维）

判断需要回填的条件：
- embedding 为空（None 或空列表）
- 或 embedding 维度 != 当前模型维度（老的 1536 维 hash 假向量需替换）

用法：
    cd backend
    venv/bin/python scripts/backfill_embeddings.py

注意：首次运行会下载 bge-small-zh-v1.5 模型（~95MB），需联网。
"""

import asyncio
import logging
import sys
from pathlib import Path

# 把 backend 目录加入 sys.path，让脚本能 import app
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, text, inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker, engine
from app.db.models.models import Card, Tool
from app.providers.local_embedding import get_local_embedding_provider

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

BATCH_SIZE = 32


async def migrate_tool_embedding_column():
    """给 tools 表加 embedding 列（如果不存在）"""
    async with engine.begin() as conn:
        def _has_embedding_column(sync_conn):
            insp = inspect(sync_conn)
            columns = [c["name"] for c in insp.get_columns("tools")]
            return "embedding" in columns

        has_column = await conn.run_sync(_has_embedding_column)
        if not has_column:
            logger.info("迁移：给 tools 表加 embedding 列")
            await conn.execute(
                text("ALTER TABLE tools ADD COLUMN embedding JSON")
            )
            logger.info("迁移完成")
        else:
            logger.info("tools 表已有 embedding 列，跳过迁移")


def _needs_backfill(embedding, expected_dim: int) -> bool:
    """判断是否需要回填：空或维度不匹配"""
    if not embedding:
        return True
    if len(embedding) != expected_dim:
        return True
    return False


def _card_embed_text(card: Card) -> str:
    """Card 的 embedding 文本（与 card_service.create_card 一致）"""
    parts = [card.title, card.ai_summary]
    if card.key_points:
        parts.extend(card.key_points)
    return "\n".join(p for p in parts if p)


def _tool_embed_text(tool: Tool) -> str:
    """Tool 的 embedding 文本（与 tool_service.create_tool 一致）"""
    parts = [tool.title]
    if tool.ai_tags:
        parts.extend(tool.ai_tags)
    if tool.description:
        parts.append(tool.description)
    return " ".join(p for p in parts if p)


async def backfill_cards(session: AsyncSession, embedder, expected_dim: int) -> int:
    """回填所有需要回填的 Card"""
    result = await session.execute(select(Card))
    cards = result.scalars().all()

    pending = [c for c in cards if _needs_backfill(c.embedding, expected_dim)]
    if not pending:
        logger.info("Card 无需回填（全部已是 %d 维真实向量）", expected_dim)
        return 0

    logger.info("Card 待回填：%d / %d", len(pending), len(cards))

    count = 0
    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        texts = [_card_embed_text(c) for c in batch]
        # 同步批量生成（embed_texts 是同步的，直接调用）
        embeddings = embedder.embed_texts(texts, is_query=False)
        for card, emb in zip(batch, embeddings):
            card.embedding = emb
            count += 1
        await session.commit()
        logger.info("Card 回填进度：%d / %d", count, len(pending))

    return count


async def backfill_tools(session: AsyncSession, embedder, expected_dim: int) -> int:
    """回填所有需要回填的 Tool"""
    result = await session.execute(select(Tool))
    tools = result.scalars().all()

    pending = [t for t in tools if _needs_backfill(t.embedding, expected_dim)]
    if not pending:
        logger.info("Tool 无需回填（全部已是 %d 维真实向量）", expected_dim)
        return 0

    logger.info("Tool 待回填：%d / %d", len(pending), len(tools))

    count = 0
    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        texts = [_tool_embed_text(t) for t in batch]
        embeddings = embedder.embed_texts(texts, is_query=False)
        for tool, emb in zip(batch, embeddings):
            tool.embedding = emb
            count += 1
        await session.commit()
        logger.info("Tool 回填进度：%d / %d", count, len(pending))

    return count


async def main():
    logger.info("=== FlowShelf Embedding 回填脚本 ===")

    # 1. 迁移 tools 表
    await migrate_tool_embedding_column()

    # 2. 加载本地 Embedding 模型
    logger.info("加载 Embedding 模型...")
    embedder = get_local_embedding_provider()
    expected_dim = embedder.dimension
    logger.info("模型维度: %d", expected_dim)

    # 3. 回填 Card + Tool
    async with async_session_maker() as session:
        card_count = await backfill_cards(session, embedder, expected_dim)
        tool_count = await backfill_tools(session, embedder, expected_dim)

    logger.info("=== 回填完成：Card %d 条，Tool %d 条 ===", card_count, tool_count)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
