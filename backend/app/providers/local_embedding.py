"""
本地 Embedding Provider

基于 sentence-transformers 加载 BAAI/bge-small-zh-v1.5（512 维，~95MB，CPU 可跑）。
零外部 API 依赖、永不停用，适合 MVP 阶段单用户/千级数据量。

体积优化设计（发布包 < 2GB 关键改动）：
1. sentence-transformers / torch **作为可选依赖**，不打在发布二进制中。
   用户需要本地嵌入时自行 pip install sentence-transformers。
   未安装时自动走 safe_generate_embedding 的 hash 向量兜底，不阻塞流程。
2. 模型缓存目录重定向到 ~/.flowshelf/models/，避免 HuggingFace 默认
   ~/.cache/huggingface 路径不统一、首次下载无处可寻；同时模型文件
   也不被 PyInstaller 打包进二进制。
"""

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# bge 中文模型官方推荐的 query 前缀
_QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："


# 本地模型缓存目录：~/.flowshelf/models/
# 放在用户数据目录，避免被 PyInstaller 打包；同时用户升级版本时模型可复用
def _get_model_cache_dir() -> Path:
    cache_dir = Path.home() / ".flowshelf" / "models"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _is_sentence_transformers_available() -> bool:
    """检测 sentence-transformers 是否安装（发布包默认不装，用户可选安装）"""
    try:
        import sentence_transformers  # noqa: F401

        return True
    except ImportError:
        return False


class LocalEmbeddingProvider:
    """本地 Embedding Provider（sentence-transformers + bge-small-zh-v1.5）

    sentence-transformers 未安装时抛出 ImportError，由调用方降级。
    """

    def __init__(self, model_name: str = "BAAI/bge-small-zh-v1.5"):
        if not _is_sentence_transformers_available():
            raise ImportError(
                "sentence-transformers 未安装。需要本地嵌入模型请运行："
                "pip install sentence-transformers>=3.0.0，或通过设置 "
                "EMBEDDING_PROVIDER=openai 使用 API 方式生成向量。"
            )
        self._model_name = model_name
        self._model = None  # 懒加载

    def _ensure_model(self):
        """懒加载模型，避免 import 时就加载导致启动慢

        模型缓存到 ~/.flowshelf/models/，与 PyInstaller 打包隔离。
        """
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            cache_dir = _get_model_cache_dir()
            logger.info(
                "加载本地 Embedding 模型: %s (缓存目录: %s)",
                self._model_name,
                cache_dir,
            )
            # 设置 HuggingFace 缓存目录，避免模型被 PyInstaller 的临时目录打断
            os.environ.setdefault(
                "HF_HOME", str(Path.home() / ".flowshelf" / "huggingface")
            )
            os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(cache_dir))
            self._model = SentenceTransformer(
                self._model_name, cache_folder=str(cache_dir)
            )
            # sentence-transformers >= 5.0 用 get_embedding_dimension
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
) -> Optional[LocalEmbeddingProvider]:
    """获取本地 Embedding Provider 单例

    - sentence-transformers 未安装 → 返回 None，调用方应降级为 hash/OpenAI 向量
    - 正常情况 → 返回单例 Provider

    Args:
        model_name: 模型名，None 时从 settings 读取
    """
    if not _is_sentence_transformers_available():
        logger.warning(
            "sentence-transformers 未安装，本地 Embedding 不可用。"
            "自动降级为 hash 向量（不可用于真实语义检索）或 OpenAI API 向量。"
            "如需本地嵌入，请执行: pip install sentence-transformers>=3.0.0"
        )
        return None

    if model_name is None:
        from app.core.config import get_settings

        model_name = get_settings().EMBEDDING_LOCAL_MODEL
    return _get_local_embedding_provider(model_name)
