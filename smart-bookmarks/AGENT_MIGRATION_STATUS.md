# Agent 模块迁移状态

## 📊 当前状态（2026-01-02）

### 架构概览

**新架构（bookmarkStoreV2）：**
- ✅ 数据源：Chrome Native Bookmarks API（唯一真实来源）
- ✅ 元数据：Extension Storage（AI 分析、用户标签等）
- ✅ 访问统计：Chrome History API（自动统计）
- ✅ 主键：`chromeId`（Chrome 原生 ID）
- ✅ 使用场景：Sidebar UI（BookmarkListV2, FilterTabs, PreviewPanelV2）

**旧架构（bookmarkStore）：**
- ⚠️ 数据源：Extension Storage（自维护）
- ⚠️ 访问统计：手动记录
- ⚠️ 主键：自定义 `id`
- ⚠️ 使用场景：Agent 工具、部分旧组件

### Agent 模块文件清单

**核心工具文件：**
1. `tools/coreTools.ts` (2248 行) - 6 个核心工具
   - context, bookmark, organize, folder, search, discover
   - ❌ 使用 `useBookmarkStore`
   - ❌ 使用 `IBookmark`, `IFolder` 类型

2. `tools/bookmarkTools.ts` (548 行) - 书签 CRUD
   - search, add, get, update, delete, star, unstar
   - ❌ 使用 `useBookmarkStore`

3. `tools/folderTools.ts` (457 行) - 文件夹管理
   - create, rename, delete, list, move
   - ❌ 使用 `useBookmarkStore`

4. `tools/classifyTools.ts` (338 行) - AI 分类
   - batch_move_to_ai_folders, update_metadata, remove_from_category
   - ❌ 使用 `useBookmarkStore`

5. `tools/organizeTools.ts` (267 行) - 整理建议
   - suggest_categories, find_by_keywords
   - ❌ 使用 `useBookmarkStore`

**测试文件：**
- `__tests__/agentIntegration.test.ts` - 集成测试
- `tools/*.test.ts` - 单元测试
- 所有测试都 mock 旧的 `bookmarkStore`

## ⚠️ 当前问题

### 1. 数据不同步
- Agent 操作旧 store 的数据
- UI 显示新 store 的数据
- 可能导致：
  - Agent 看不到最新的书签
  - Agent 的修改不会立即反映在 UI
  - 两个 store 的状态不一致

### 2. 类型不匹配
```typescript
// 旧类型
interface IBookmark {
  id: string;              // 自定义 ID
  folderPath: string;      // 文件夹路径
  folderId: string;        // 文件夹 ID
  createTime: number;
  updateTime: number;
  // ...
}

// 新类型
interface MergedBookmark {
  chromeId: string;        // Chrome 原生 ID
  parentId: string;        // Chrome 父节点 ID
  dateAdded: number;       // Chrome 原生创建时间
  // 没有 folderPath, folderId
  // ...
}
```

### 3. API 差异
```typescript
// 旧 API
store.addBookmark(bookmark)
store.updateBookmark(id, updates)
store.deleteBookmark(id)

// 新 API
store.createBookmark(data)      // 调用 Chrome API
store.updateMetadata(chromeId, metadata)  // 只更新元数据
store.moveToTrash(chromeId)     // 软删除
```

## 🎯 迁移策略

### 方案 A：渐进式迁移（推荐）

**阶段 1：确保兼容性（立即）**
1. 保持两个 store 同时运行
2. 在 `bookmarkStoreV2` 的关键操作后，同步更新旧 store
3. Agent 继续使用旧 store（暂时）

**阶段 2：创建适配层（1-2 周）**
1. 创建 `agentStoreAdapter.ts`
2. 提供统一的 API，内部调用新 store
3. 逐个迁移工具文件

**阶段 3：完全迁移（1 个月）**
1. 所有 Agent 工具使用新架构
2. 移除旧 store
3. 更新所有测试

### 方案 B：快速重写（风险高）

直接重写所有 Agent 工具使用新架构
- ❌ 工作量大（5000+ 行代码）
- ❌ 风险高（可能引入 bug）
- ❌ 测试工作量大

## 📝 建议的下一步

### 立即行动（优先级：高）

1. **确保数据同步**
   ```typescript
   // 在 bookmarkStoreV2 的关键操作后
   await bookmarkStoreV2.createBookmark(data);
   await syncToLegacyStore();  // 同步到旧 store
   ```

2. **添加兼容性检查**
   - 在 Agent 工具执行前，检查数据是否最新
   - 必要时从新 store 刷新数据

3. **记录已知问题**
   - 在代码中添加 TODO 注释
   - 标记需要迁移的文件

### 中期计划（优先级：中）

1. **创建适配层**
   ```typescript
   // agentStoreAdapter.ts
   export function getBookmarksForAgent(): IBookmark[] {
     const v2Bookmarks = useBookmarkStoreV2.getState().bookmarks;
     return v2Bookmarks.map(convertToLegacyFormat);
   }
   ```

2. **逐步迁移**
   - 从最简单的工具开始（如 `bookmarkTools.ts`）
   - 每次迁移一个文件，确保测试通过
   - 更新相关测试

### 长期目标（优先级：低）

1. **完全移除旧 store**
2. **统一类型系统**
3. **优化 Agent 性能**

## 🔍 技术债务

### 高优先级
- [ ] Agent 与新架构数据不同步
- [ ] 两套类型系统并存
- [ ] 测试使用 mock 数据

### 中优先级
- [ ] Agent 工具代码重复
- [ ] 错误处理不统一
- [ ] 缺少类型安全

### 低优先级
- [ ] 代码风格不一致
- [ ] 注释不完整
- [ ] 性能优化空间

## 📚 相关文档

- [bookmarkStoreV2 设计文档](./src/sidebar/store/bookmarkStoreV2.ts)
- [Chrome Bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)
- [Chrome History API](https://developer.chrome.com/docs/extensions/reference/api/history)

## 🤝 贡献指南

如果要修改 Agent 工具：
1. 优先使用新架构（bookmarkStoreV2）
2. 如果必须使用旧架构，添加 TODO 注释
3. 确保测试覆盖
4. 更新此文档

---

**最后更新：** 2026-01-02  
**状态：** 🟡 迁移进行中  
**负责人：** @Johnny
