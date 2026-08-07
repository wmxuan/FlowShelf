"""
本地 Embedding Provider

基于 sentence-transformers 加载 BAAI/bge-small-zh-v1.5（512 维，~95MB，CPU 可跑）。
零外部 API 依赖、永不停用，适合 MVP 阶段单用户/千级数据量。

设计要点：
- 模型懒加载：首次调用 embed_text(s) 时才加载，避免启动慢
- 模块级单例：_get_local_embedding_provider 用 lru_cache 保证全局只加载一次
- 同步接口：sentence-transformers 是同步库，调用方需用 run_in_executor 包到线程池
- bge-small-zh-v1.5 官方推荐 query 加前缀（"为这个句子生成表示以用于检索相关文章："），
  文档不加。这里通过 is_query 参数区分，遵循官方最佳实践。
"""

import logging
from functools import lru_cache
from typing import List, Optional

logger = logging.getLogger(__name__)

# bge 中文模型官方推荐的 query 前缀
_QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："


class LocalEmbeddingProvider:
    """本地 Embedding Provider（sentence-transformers + bge-small-zh-v1.5）"""

    def __init__(self, model_name: str = "BAAI/bge-small-zh-v1.5"):
        self._model_name = model_name
        self._model = None  # 懒加载

    def _ensure_model(self):
        """懒加载模型，避免 import 时就加载导致启动慢"""
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            logger.info("加载本地 Embedding 模型: %s", self._model_name)
            self._model = SentenceTransformer(self._model_name)
            # sentence-transformers >= 5.0 用 get_embedding_dimension，旧版用 get_sentence_embedding_dimension
            get_dim = getattr(
                self._model,
                "get_embedding_dimension",
                getattr(self._model, "get_sentence_embedding_dimension", None),
            )
            logger.info("Embedding 模型加载完成，维度: %d", get_dim())
        return self._model

    def embed_text(self, text: str, is_query: bool = False) -> List[float]:
        """生成单条文本的向量

        Args:
            text: 文本
            is_query: 是否是搜索 query。bge 推荐对 query 加前缀以提升检索效果。
        """
        return self.embed_texts([text], is_query=is_query)[0]

    def embed_texts(
        self, texts: List[str], is_query: bool = False, batch_size: int = 32
    ) -> List[List[float]]:
        """批量生成向量（回填脚本用，加速存量数据）

        Args:
            texts: 文本列表
            is_query: 是否都是搜索 query
            batch_size: 批量大小
        """
        if not texts:
            return []

        model = self._ensure_model()

        # bge 推荐：query 加前缀，文档不加
        if is_query:
            input_texts = [f"{_QUERY_PREFIX}{t}" for t in texts]
        else:
            input_texts = texts

        # normalize_embeddings=True 让向量归一化，余弦相似度退化为点积，计算更快
        embeddings = model.encode(
            input_texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return embeddings.tolist()

    @property
    def dimension(self) -> int:
        """向量维度"""
        return self._ensure_model().get_sentence_embedding_dimension()


@lru_cache()
def _get_local_embedding_provider(model_name: str) -> LocalEmbeddingProvider:
    """模块级单例：同一个 model_name 全局只加载一次"""
    return LocalEmbeddingProvider(model_name=model_name)


def get_local_embedding_provider(
    model_name: Optional[str] = None,
) -> LocalEmbeddingProvider:
    """获取本地 Embedding Provider 单例

    Args:
        model_name: 模型名，None 时从 settings 读取
    """
    if model_name is None:
        from app.core.config import get_settings

        model_name = get_settings().EMBEDDING_LOCAL_MODEL
    return _get_local_embedding_provider(model_name)
