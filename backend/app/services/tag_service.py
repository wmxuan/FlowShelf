"""
标签治理服务

两道闸门抑制标签膨胀：
- 闸门 1（输入端）：get_candidate_tags 聚合现有高频标签，注入 Prompt 引导 AI 优先复用
- 闸门 2（输出端）：normalize_tags 对 AI 返回的标签做相似度去重，归并到已有标签

当前闸门 2 用字符串相似度（difflib + 包含关系），零依赖、立即可用。
后续接入独立 Embedding 服务后，可将 _similarity 升级为余弦相似度，无需改调用方。
"""

import difflib
from app.core.logging import get_logger
from typing import List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)

# 相似度阈值：高于此值认为是同一标签，归并到现有标签
SIMILARITY_THRESHOLD = 0.85

# 允许查询的表名白名单（防 SQL 注入）
_ALLOWED_TABLES = {"cards", "tools"}


async def get_candidate_tags(
    db: AsyncSession, table: str, top_n: int = 30
) -> List[str]:
    """
    从指定内容池聚合高频标签，作为 AI 生成的候选词表（闸门 1）。

    用 json_each 展开 ai_tags 数组按值聚合计数，不受 JSON 存储编码影响。

    Args:
        db: 数据库会话
        table: 内容池表名（"cards" | "tools"）
        top_n: 返回前 N 个高频标签

    Returns:
        按使用频率降序排列的标签名列表
    """
    if table not in _ALLOWED_TABLES:
        raise ValueError(f"非法表名: {table}，仅允许 { _ALLOWED_TABLES}")

    sql = text(
        f"""
        SELECT je.value AS name, COUNT(*) AS cnt
        FROM {table}, json_each({table}.ai_tags) AS je
        WHERE je.value IS NOT NULL
        GROUP BY je.value
        ORDER BY cnt DESC, name ASC
        LIMIT :n
        """
    )
    result = await db.execute(sql, {"n": top_n})
    return [row[0] for row in result.fetchall()]


def _normalize_name(tag: str) -> str:
    """标签名归一化：去首尾空格 + 转小写（用于比较，不改原值）"""
    return tag.strip().lower()


def _similarity(a: str, b: str) -> float:
    """
    计算两个标签名的相似度（0-1）。

    组合策略（按优先级）：
    1. 归一化后精确相等 → 1.0（大小写/空格差异）
    2. 包含关系（短标签长度 >= 2）→ 0.9（"SQL语言" 包含 "SQL"）
    3. difflib 序列相似度 → 字符级匹配

    局限：纯字符串匹配无法识别跨语言同义（"数据库" vs "database"），
    待 Embedding 服务接入后升级为语义相似度即可覆盖。
    """
    na, nb = _normalize_name(a), _normalize_name(b)
    if na == nb:
        return 1.0
    # 包含关系：短标签被长标签包含
    short, long_ = (na, nb) if len(na) <= len(nb) else (nb, na)
    if len(short) >= 2 and short in long_:
        return 0.9
    # 字符序列相似度
    return difflib.SequenceMatcher(None, na, nb).ratio()


def normalize_tags(raw_tags: List[str], existing_tags: List[str]) -> List[str]:
    """
    将 AI 返回的标签归一化到现有标签集（闸门 2）。

    对每个 raw_tag：
    - 在 existing_tags 里找相似度最高的
    - 若相似度 >= SIMILARITY_THRESHOLD，复用现有标签名（归并）
    - 否则保留 raw_tag（作为新标签）

    Args:
        raw_tags: AI 返回的标签列表
        existing_tags: 现有标签集（通常来自 get_candidate_tags）

    Returns:
        归一化 + 去重后的标签列表，保持原顺序
    """
    result: List[str] = []
    seen_norm: set = set()

    for raw in raw_tags:
        if not raw or not raw.strip():
            continue
        raw = raw.strip()
        norm_key = _normalize_name(raw)
        if norm_key in seen_norm:
            continue  # 输入自身去重

        best_match = None
        best_score = 0.0
        for existing in existing_tags:
            score = _similarity(raw, existing)
            if score > best_score:
                best_score = score
                best_match = existing

        if best_match and best_score >= SIMILARITY_THRESHOLD:
            final = best_match  # 归并到现有标签
        else:
            final = raw  # 保留为新标签

        norm_final = _normalize_name(final)
        if norm_final not in seen_norm:
            seen_norm.add(norm_final)
            result.append(final)

    return result
