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

from app.core.logging import get_logger
import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

log = get_logger(__name__)

# bge 中文模型官方推荐的 query 前缀
_QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："


# 本地模型缓存目录
# 优先使用 ~/.flowshelf/models/（跨版本复用）；
# 沙箱环境（如 Trae IDE）无权限时降级到项目内 .model_cache/
def _get_model_cache_dir() -> Path:
    cache_dir = Path.home() / ".flowshelf" / "models"
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        # 写入测试：确认目录可用
        (cache_dir / ".write_test").touch(exist_ok=True)
    except (PermissionError, OSError):
        # 沙箱或只读文件系统 → 降级到项目内
        cache_dir = Path(__file__).resolve().parent.parent.parent / ".model_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _is_sentence_transformers_available() -> bool:
    """检测 sentence-transformers 是否安装且可正常导入

    捕获所有异常（不仅是 ImportError），因为依赖版本不兼容时
    sentence_transformers 的 import 也可能抛 NameError/AttributeError 等。
    """
    try:
        import sentence_transformers  # noqa: F401

        return True
    except Exception:
        return False


def _auto_install_sentence_transformers() -> bool:
    """自动安装 sentence-transformers（含 torch 最小依赖）

    仅在开发环境（有 pip 且非 PyInstaller 打包）中尝试。
    打包环境中跳过，避免阻塞请求或因无 pip 而报错。

    返回 True 表示安装成功，False 表示失败/跳过。
    """
    import subprocess
    import sys

    # PyInstaller 打包环境中 sys.frozen 存在，不尝试自动安装
    if getattr(sys, "frozen", False):
        log.info("打包环境，跳过 sentence-transformers 自动安装")
        return False

    # 检查 pip 是否可用
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "--version"],
            timeout=5,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        log.info("pip 不可用，跳过 sentence-transformers 自动安装")
        return False

    log.info("检测到 sentence-transformers 未安装，尝试自动安装...")
    try:
        subprocess.check_call(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "sentence-transformers>=3.0.0",
                "--quiet",
            ],
            timeout=300,
        )
        log.info("sentence-transformers 安装成功")
        return True
    except Exception as exc:
        log.warning("sentence-transformers 自动安装失败: %s", exc)
        return False


def _is_model_downloaded(model_name: str) -> bool:
    """检测 bge 模型是否已下载到缓存目录"""
    cache_dir = _get_model_cache_dir()
    # sentence-transformers 缓存结构：models--speaker--model_name/snapshots/...
    model_dir_name = model_name.replace("/", "--")
    model_path = cache_dir / model_dir_name
    return model_path.exists() and any(model_path.iterdir())


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
            log.info(
                "加载本地 Embedding 模型: %s (缓存目录: %s)",
                self._model_name,
                cache_dir,
            )
            # 设置 HuggingFace 缓存目录（与 cache_dir 保持一致）
            os.environ.setdefault("HF_HOME", str(cache_dir))
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
            log.info("Embedding 模型加载完成，维度: %d", get_dim())
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

    - sentence-transformers 未安装或版本不兼容 → 尝试自动安装，失败则返回 None
    - 正常情况 → 返回单例 Provider

    Args:
        model_name: 模型名，None 时从 settings 读取
    """
    if not _is_sentence_transformers_available():
        # 尝试自动安装 sentence-transformers
        if not _auto_install_sentence_transformers():
            log.warning(
                "sentence-transformers 不可用，本地 Embedding 降级。"
                "搜索将使用关键词匹配，AI 分组/摘要不受影响。"
            )
            return None
        # 安装后重新检测
        if not _is_sentence_transformers_available():
            log.warning(
                "sentence-transformers 安装后仍无法导入（可能依赖版本冲突），"
                "本地 Embedding 不可用。"
            )
            return None

    if model_name is None:
        from app.core.config import get_settings

        model_name = get_settings().EMBEDDING_LOCAL_MODEL

    # 首次使用时预下载模型（模型不存在时 SentenceTransformer 会自动从 HuggingFace 下载）
    if not _is_model_downloaded(model_name):
        log.info(
            "Embedding 模型 %s 未缓存，首次使用时将自动下载到 %s",
            model_name,
            _get_model_cache_dir(),
        )

    try:
        return _get_local_embedding_provider(model_name)
    except Exception as exc:
        log.warning("LocalEmbeddingProvider 创建失败: %s", exc)
        return None
