/**
 * 类型统一导出入口
 *
 * 全量 API 类型定义在 ./api.ts，本文件仅做 re-export + 兼容别名。
 * 项目内统一从 '@/types' 导入。
 */

export type {
  DateTime,
  MessageResponse,
  ErrorResponse,
  ErrorCode,
  // 卡片
  Card,
  CardCreateRequest,
  CardUpdateRequest,
  CardGenerationRequest,
  CardGenerationResponse,
  // 工具
  Tool,
  ToolCreateRequest,
  ToolUpdateRequest,
  ToolGenerationRequest,
  ToolGenerationResponse,
  // 标签
  TagCount,
  // 搜索
  SearchResult,
  SearchResponse,
  // 智能分流
  ClassifyRequest,
  ClassifyResponse,
  // 待学习
  LearningItem,
  LearningItemCreateRequest,
  LearningItemUpdateRequest,
  LearningItemConvertRequest,
  // Tab
  TabInfo,
  TabGroupRequest,
  TabGroup,
  TabGroupResponse,
  GroupContext,
  TabAssignRequest,
  TabAssignResponse,
  // 系统
  HealthResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse,
} from './api';

/**
 * 兼容别名：旧代码中 LearningItemConvertResult 仍可使用。
 * 后端 convert 端点实际返回 LearningItem，但前端部分逻辑只关心转换结果子集。
 */
export type { LearningItem as LearningConvertResult } from './api';
