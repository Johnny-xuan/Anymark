---
trigger: always_on
---

AnyMark 项目规则：
 
1. 数据一致性优先
   - 修改书签数据时，必须同时考虑 bookmarkStore 和 bookmarkStoreV2
   - 使用 syncFromV2ToLegacy() 确保数据同步
   - 验证 Chrome Native API 的调用是否正确
 
2. Agent 工具设计
   - 新增工具前，检查现有 6 个核心工具是否可以扩展
   - 工具必须返回结构化数据（包含 success, data, message）
   - 考虑 LLM 的 token 消耗，压缩返回内容
 
3. 性能考虑
   - 批量操作限制单次处理数量（如 20 个书签）
   - 避免在循环中进行 AI 调用
   - 使用缓存减少重复分析
 
4. 用户体验
   - 提供清晰的进度反馈
   - 错误信息要具体且可操作
   - 支持中断和恢复长时间操作
 
5. 代码组织
   - Agent 相关代码放在 src/agent/
   - Store 同步逻辑在 src/stores/storeSync.ts
   - 工具定义在 src/agent/tools/