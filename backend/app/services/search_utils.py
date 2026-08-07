"""
关键词搜索公共工具

jieba 分词 + 关键词加权匹配，供 search_service / card_service / tool_service 复用。
统一数据源，避免搜索/浏览模式分裂。
"""

from typing import List

import jieba


def extract_terms(query: str) -> List[str]:
    """用 jieba 分词提取检索词，英文转小写"""
    terms = [w.strip() for w in jieba.cut(query) if w.strip()]
    return [t.lower() if t.isascii() else t for t in terms]


def keyword_score(query: str, title: str, tags: List[str], summary: str) -> float:
    """关键词匹配打分（0-1），无匹配返回 0。

    权重：标题 = 标签 > 摘要（标签是 AI 精心打的，语义价值高）。
    综合覆盖率（匹配词比例）与匹配位置权重。
    """
    terms = extract_terms(query)
    if not terms:
        return 0.0

    title_l = (title or "").lower()
    tags_l = " ".join(tags or []).lower()
    summary_l = (summary or "").lower()

    matched = 0
    weight_sum = 0.0
    for term in terms:
        if term in title_l:
            matched += 1
            weight_sum += 3.0
        elif term in tags_l:
            matched += 1
            weight_sum += 3.0
        elif term in summary_l:
            matched += 1
            weight_sum += 1.0

    if matched == 0:
        return 0.0

    coverage = matched / len(terms)
    avg_weight = weight_sum / (matched * 3.0)
    return coverage * 0.6 + avg_weight * 0.4
