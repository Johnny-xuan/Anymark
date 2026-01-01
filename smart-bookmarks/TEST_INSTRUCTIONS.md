# Agent 功能测试说明

## 🎯 测试目标

使用 DeepSeek API 测试 Agent 模块的修复效果，验证：
1. ✅ API 配置是否正确
2. ✅ Agent 对话功能是否正常
3. ✅ 书签操作是否正确调用新 API
4. ✅ 数据同步是否正常

---

## 📋 测试步骤

### 方法 1：通过浏览器控制台测试（推荐）

#### 步骤 1：重新加载扩展
1. 打开 Chrome
2. 进入 `chrome://extensions/`
3. 找到 AnyMark 扩展
4. 点击"重新加载"按钮 🔄

#### 步骤 2：打开扩展的 Service Worker 控制台
1. 在扩展卡片上点击"Service Worker"
2. 会打开一个开发者工具窗口

#### 步骤 3：运行测试脚本
在控制台中复制粘贴以下代码：

\`\`\`javascript
// 配置 DeepSeek API
const config = {
  provider: 'deepseek',
  apiKey: 'sk-b6f01906387b43bd89cad1add9086791',
  apiKeys: ['sk-b6f01906387b43bd89cad1add9086791'],
  model: 'deepseek-chat',
  endpoint: 'https://api.deepseek.com/v1/chat/completions'
};

// 保存配置
await chrome.storage.local.set({ aiConfig: config });
console.log('✅ DeepSeek API 配置已保存');

// 测试 API
const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-b6f01906387b43bd89cad1add9086791'
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'user', content: '你好，请用一句话介绍你自己。' }
    ],
    max_tokens: 100
  })
});

const data = await response.json();
console.log('✅ API 响应:', data.choices[0].message.content);
\`\`\`

---

### 方法 2：通过 Sidebar 测试

#### 步骤 1：打开 Sidebar
1. 点击扩展图标
2. 或使用快捷键 `Alt+Shift+B`

#### 步骤 2：打开 AI Chat
1. 点击右上角的 AI Chat 图标 💬
2. 或使用快捷键 `Ctrl+K` / `Cmd+K`

#### 步骤 3：测试对话
输入以下测试命令：

**测试 1：基本对话**
\`\`\`
你好，请介绍一下你的功能
\`\`\`

**测试 2：查看书签概览**
\`\`\`
显示我的书签概览
\`\`\`

**测试 3：添加书签**
\`\`\`
帮我添加一个测试书签：https://example.com，标题是"测试书签"
\`\`\`

**测试 4：搜索书签**
\`\`\`
搜索包含"test"的书签
\`\`\`

**测试 5：查看文件夹**
\`\`\`
列出所有文件夹
\`\`\`

---

## ✅ 预期结果

### 1. API 配置测试
- ✅ 配置保存成功
- ✅ API 连接正常
- ✅ 返回正常的对话响应

### 2. Agent 对话测试
- ✅ Agent 能够正常回复
- ✅ 支持中文对话
- ✅ 能够理解用户意图

### 3. 书签操作测试
- ✅ 添加书签后，在 Sidebar 中能看到
- ✅ 添加的书签在 Chrome 原生书签管理器中也能看到
- ✅ 编辑书签后，修改能够同步
- ✅ 删除书签后，移到回收站

### 4. 数据同步测试
- ✅ Agent 能看到 Sidebar 中的书签
- ✅ Sidebar 能看到 Agent 添加的书签
- ✅ 数据实时同步，无延迟

---

## 🐛 常见问题

### 问题 1：API 调用失败
**症状：** 显示 401 或 403 错误

**解决方案：**
1. 检查 API Key 是否正确
2. 检查网络连接
3. 确认 API Key 有足够的额度

### 问题 2：Agent 看不到书签
**症状：** Agent 说"书签库为空"

**解决方案：**
1. 检查 Sidebar 是否有书签
2. 重新加载扩展
3. 查看控制台是否有错误

### 问题 3：添加的书签消失
**症状：** Agent 添加书签后，Sidebar 看不到

**解决方案：**
1. 刷新 Sidebar（点击刷新按钮）
2. 检查 Chrome 原生书签管理器
3. 查看控制台错误日志

### 问题 4：数据不同步
**症状：** Agent 和 Sidebar 显示的数据不一致

**解决方案：**
1. 重新加载扩展
2. 检查 `syncFromV2ToLegacy()` 是否被调用
3. 查看控制台日志

---

## 📊 测试检查清单

使用此清单确保所有功能都已测试：

- [ ] DeepSeek API 配置成功
- [ ] API 连接测试通过
- [ ] Agent 基本对话正常
- [ ] 查看书签概览正常
- [ ] 添加书签功能正常
- [ ] 编辑书签功能正常
- [ ] 删除书签功能正常
- [ ] 搜索书签功能正常
- [ ] 查看文件夹功能正常
- [ ] Sidebar 能看到 Agent 添加的书签
- [ ] Agent 能看到 Sidebar 中的书签
- [ ] Chrome 原生书签管理器中有对应书签
- [ ] 数据实时同步无延迟

---

## 🔍 调试技巧

### 查看控制台日志
在 Service Worker 控制台中查看：
- `[StoreSync]` - 数据同步日志
- `[AgentAPI]` - API 调用日志
- `[CoreTools]` - 工具执行日志
- `[BookmarkStoreV2]` - Store 操作日志

### 查看存储数据
\`\`\`javascript
// 查看 AI 配置
const config = await chrome.storage.local.get(['aiConfig']);
console.log('AI Config:', config);

// 查看书签数据
const bookmarks = await chrome.storage.local.get(['bookmarks']);
console.log('Bookmarks:', bookmarks);

// 查看元数据
const metadata = await chrome.storage.local.get(['bookmarkMetadata']);
console.log('Metadata:', metadata);
\`\`\`

### 手动触发数据同步
\`\`\`javascript
// 刷新 V2 store
await useBookmarkStoreV2.getState().refresh();

// 同步到旧 store
await syncFromV2ToLegacy();
\`\`\`

---

## 📝 测试报告模板

测试完成后，请填写以下报告：

\`\`\`
测试日期：2026-01-02
测试人员：[你的名字]
DeepSeek API：sk-b6f01906387b43bd89cad1add9086791

测试结果：
✅/❌ API 配置
✅/❌ 基本对话
✅/❌ 添加书签
✅/❌ 编辑书签
✅/❌ 删除书签
✅/❌ 数据同步

发现的问题：
1. [描述问题]
2. [描述问题]

建议：
1. [你的建议]
2. [你的建议]
\`\`\`

---

## 🎉 测试成功后

如果所有测试都通过：
1. ✅ Agent 模块修复成功
2. ✅ 可以正常使用 AI Chat 功能
3. ✅ 数据同步正常
4. ✅ 可以开始日常使用

如果有问题：
1. 查看上面的"常见问题"部分
2. 检查控制台日志
3. 提供详细的错误信息以便调试

---

**祝测试顺利！** 🚀
