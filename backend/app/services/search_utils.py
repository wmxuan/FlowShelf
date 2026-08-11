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
    所有词都命中标题/标签 → 接近 1.0；仅个别词命中摘要 → 较低分。
    """
    terms = extract_terms(query)
    if not terms:
        return 0.0

    title_l = (title or "").lower()
    tags_l = " ".join(tags or []).lower()
    summary_l = (summary or "").lower()

    # 按匹配位置分桶：标题/标签命中 = 高权，摘要命中 = 低权
    high_matches = 0  # 标题或标签命中
    low_matches = 0   # 仅摘要命中
    for term in terms:
        if term in title_l or term in tags_l:
            high_matches += 1
        elif term in summary_l:
            low_matches += 1

    total_matched = high_matches + low_matches
    if total_matched == 0:
        return 0.0

    # 覆盖率：匹配词占总查询词的比例
    coverage = total_matched / len(terms)
    # 高位占比：标题/标签命中数占总命中的比例（区分"真正相关" vs "勉强沾边"）
    high_ratio = high_matches / total_matched

    # 最终分数：覆盖率 × 0.5 + 高位占比 × 0.3 + 连续匹配奖励 × 0.2
    # - coverage=1.0 + high_ratio=1.0 → 0.5+0.3+0.2 = 1.0（完美匹配）
    # - coverage=0.5 + high_ratio=0.5 → 0.25+0.15+0.1 = 0.5（中等匹配）
    # - coverage=1.0 + high_ratio=0.0 → 0.5+0.0+0.1 = 0.6（全部命中摘要，中等偏低）
    # - coverage=0.33 + high_ratio=0.0 → 0.165+0.0+0.066 = 0.23（弱匹配，会被阈值过滤）
    continuity_bonus = 0.2 if high_matches == len(terms) else (0.1 if high_matches > 0 else 0.0)

    return coverage * 0.5 + high_ratio * 0.3 + continuity_bonus
