"""
AI Provider 抽象层

支持真实模式（调用 LLM API）和 DEMO 模式（返回模拟数据）
"""
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple


class BaseAIProvider(ABC):
    """AI Provider 基类"""
    
    @abstractmethod
    async def generate_card(self, url: str, content: str) -> dict:
        """
        生成知识卡片
        
        Args:
            url: 原文 URL
            content: 正文内容
            
        Returns:
            {
                "summary": str,
                "key_points": List[str],
                "tags": List[str],
                "embedding": List[float]
            }
        """
        pass
    
    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        """
        生成向量
        
        Args:
            text: 要向量化的文本
            
        Returns:
            向量列表
        """
        pass
    
    @abstractmethod
    async def classify_tool(self, url: str, title: str, content: str) -> dict:
        """
        分类工具（用于智能分流）
        
        Args:
            url: 工具 URL
            title: 工具标题
            content: 页面内容
            
        Returns:
            {
                "type": str,  # tool | article | video
                "tags": List[str]
            }
        """
        pass


class RealAIProvider(BaseAIProvider):
    """真实 AI Provider（调用 LLM API）"""
    
    def __init__(self, api_key: str, model: str = "gpt-4o-mini", embedding_model: str = "text-embedding-3-small"):
        self.api_key = api_key
        self.model = model
        self.embedding_model = embedding_model
    
    async def generate_card(self, url: str, content: str) -> dict:
        """调用真实 LLM 生成卡片"""
        # TODO: 实现真实 API 调用
        # 这里是接口定义，Phase 1 先用 DEMO_MODE
        raise NotImplementedError("真实 AI Provider 待实现")
    
    async def generate_embedding(self, text: str) -> List[float]:
        """调用真实 Embedding API"""
        # TODO: 实现真实 API 调用
        raise NotImplementedError("真实 AI Provider 待实现")
    
    async def classify_tool(self, url: str, title: str, content: str) -> dict:
        """调用真实 LLM 分类工具"""
        # TODO: 实现真实 API 调用
        raise NotImplementedError("真实 AI Provider 待实现")


class DemoAIProvider(BaseAIProvider):
    """DEMO 模式 AI Provider（返回模拟数据）"""
    
    async def generate_card(self, url: str, content: str) -> dict:
        """返回模拟卡片数据"""
        return {
            "summary": f"这是对文章《{content[:50]}...》的摘要。文章主要讨论了相关技术的核心原理和最佳实践，为读者提供了全面的参考。",
            "key_points": [
                "核心观点 1：技术选型需要综合考虑成本和性能",
                "核心观点 2：良好的架构设计是项目成功的关键",
                "核心观点 3：持续的迭代和优化比一次性完美更重要"
            ],
            "tags": ["技术", "架构", "最佳实践"],
            "embedding": [0.1] * 1536  # 模拟向量
        }
    
    async def generate_embedding(self, text: str) -> List[float]:
        """返回模拟向量"""
        # 基于文本长度生成不同的模拟向量（简单 hash）
        import hashlib
        hash_bytes = hashlib.md5(text.encode()).digest()
        base_vector = [b / 255.0 for b in hash_bytes]
        # 扩展到 1536 维
        vector = (base_vector * 61)[:1536]  # 16 * 61 = 976, need 1536
        while len(vector) < 1536:
            vector.extend(base_vector)
        return vector[:1536]
    
    async def classify_tool(self, url: str, title: str, content: str) -> dict:
        """返回模拟分类结果"""
        url_lower = url.lower()
        
        # 简单规则判断
        if any(keyword in url_lower for keyword in ["tool", "app", "dashboard", "console"]):
            return {
                "type": "tool",
                "tags": ["工具", "常用"]
            }
        elif any(keyword in url_lower for keyword in ["video", "youtube", "bilibili"]):
            return {
                "type": "video",
                "tags": ["视频"]
            }
        else:
            return {
                "type": "article",
                "tags": ["文章", "待学习"]
            }


def get_ai_provider(demo_mode: bool = True, api_key: str = "") -> BaseAIProvider:
    """获取 AI Provider 实例"""
    if demo_mode:
        return DemoAIProvider()
    else:
        return RealAIProvider(api_key=api_key)