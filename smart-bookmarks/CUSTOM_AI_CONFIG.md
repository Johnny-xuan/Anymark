# 自定义 AI 模型配置指南

## 概述

AnyMark - 收藏自由 现在支持**完全自定义**的 AI 模型配置，您可以：

- ✨ 使用任何兼容 OpenAI API 格式的大模型
- 🌍 配置自定义 API 端点 URL
- 🤖 设置任意模型 ID
- 🔑 管理多个 API Key
- 💰 节省成本（使用国产大模型）

## 支持的模型

### 国外模型
- **OpenAI**: gpt-3.5-turbo, gpt-4-turbo, gpt-4o, gpt-4o-mini, gpt-4o-audio-preview
- **Anthropic**: claude-3-haiku, claude-3-sonnet, claude-3-opus, claude-3-5-sonnet
- **Google**: gemini-pro, gemini-pro-vision, gemini-1.5-pro, gemini-1.5-flash
- **Mistral**: mistral-large, mistral-medium, pixtral-large, mixtral-8x7b
- **Cohere**: command-r-plus, command-r, command-r-mini
- **Perplexity**: llama-3.1-sonar-small, llama-3.1-sonar-large, sonar-small-128k
- **xAI**: grok-beta, grok-vision-beta

### 国产大模型（推荐）
- **通义千问**: qwen-turbo, qwen-plus, qwen-max, qwen-long, qwen-vl-max
- **豆包**: doubao-lite-4k, doubao-pro-4k, doubao-pro-32k, doubao-vision-4k
- **文心一言**: ernie-bot-turbo, ernie-bot-pro, ernie-bot-4.0, ernie-bot-4.5
- **讯飞星火**: spark-v1.5, spark-v3.0, spark-v3.5, spark-4.0-ultra
- **智谱清言**: glm-4, glm-3-turbo, glm-4-plus, glm-4-flash, glm-4v-plus
- **Kimi**: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k, moonshot-vision-v1-8k
- **百川智能**: baichuan2-turbo, baichuan2-plus, baichuan2-13b, baichuan2-53b
- **商汤日日新**: sensechat, sensechat-v2, sensechat-vision, sensechat-5.5
- **昆仑万维**: skywork-13b, skywork-65b, skywork-gamma, skywork-o1
- **MiniMax**: abab6.5s-chat, abab6.5g-chat, abab5.5s-chat, abab5.5g-chat
- **零一万物**: yi-34b-chat, yi-vl-plus, yi-coder, yi-large-chat
- **深度求索**: deepseek-chat, deepseek-coder, deepseek-reasoner, deepseek-v3
- **面壁智能**: cpm-bee, cpm-bee-10b, cpm-bee-70b, cpm-bee-1s
- **OpenBMB**: chatglm3-6b, aquila-7b, aquila-34b, aquila-chat-7b
- **TigerBot**: tigerbot-7b, tigerbot-13b, tigerbot-70b, tigerbot-2-70b

### 开源模型
- **LLaMA**: llama-2-7b, llama-2-13b, llama-2-70b, llama-3-8b, llama-3-70b
- **CodeLlama**: codellama-7b, codellama-13b, codellama-34b, codellama-70b
- **StarCoder**: starcoder, starcoder2-15b, starcoder2-7b
- **WizardCoder**: wizardcoder-15b, wizardcoder-34b, wizardcoder-python-34b
- **Phind**: phind-codellama-34b, phind-mistral-7b, phind-sft-34b
- **CodeT5**: codet5-base, codet5-large, codet5-plus
- **Mistral**: mistral-7b, mixtral-8x7b, mixtral-8x22b
- **Qwen**: qwen-7b, qwen-14b, qwen-72b, qwen1.5-7b, qwen1.5-14b
- **ChatGLM**: chatglm3-6b, chatglm4-9b, chatglm4-6b
- **InternLM**: internlm2-7b, internlm2-20b, internlm2-chat-7b, internlm2-chat-20b

## 配置步骤

### 1. 打开设置面板

点击侧边栏右上角的 **⚙️ 设置** 按钮

### 2. 配置 AI 模型

在 **🤖 AI 设置** 标签页中：

#### 步骤 1: 设置 API URL
```
推荐配置：
- 通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1
- 豆包: https://ark.cn-beijing.volces.com/api/v3
- 文心一言: https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop
- 讯飞星火: https://spark-api-open.xf-yun.com/v1
- 智谱清言: https://open.bigmodel.cn/api/paas/v4
- Kimi: https://api.moonshot.cn/v1
- OpenAI: https://api.openai.com/v1
- Anthropic: https://api.anthropic.com/v1
- Google: https://generativelanguage.googleapis.com/v1
- Mistral: https://api.mistral.ai/v1
- Cohere: https://api.cohere.ai/v1
- Perplexity: https://api.perplexity.ai
```

#### 步骤 2: 设置模型 ID
```
根据您使用的服务填写对应模型 ID：
- qwen-turbo (通义千问)
- doubao-lite-4k (豆包)
- ernie-bot-turbo (文心一言)
- spark-v1.5 (讯飞星火)
- glm-4 (智谱清言)
- moonshot-v1-8k (Kimi)
- gpt-3.5-turbo (OpenAI)
- claude-3-haiku (Anthropic)
- gemini-pro (Google)
- mistral-large (Mistral)
- command-r-plus (Cohere)
- sonar-small-128k (Perplexity)
```

#### 步骤 3: 添加 API Key
- 在 "API Key 管理" 部分点击 "添加"
- 粘贴您的 API Key
- 可以添加多个 Key 实现自动轮换

### 3. 测试连接

点击 "测试连接" 按钮验证配置是否正确

### 4. 保存配置

点击 **💾 保存设置** 完成配置

## 详细配置示例

### 示例 1: 通义千问
```
API URL: https://dashscope.aliyuncs.com/compatible-mode/v1
模型 ID: qwen-turbo
API Key: sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 示例 2: 豆包 (火山引擎)
```
API URL: https://ark.cn-beijing.volces.com/api/v3
模型 ID: doubao-lite-4k
API Key: xxxxxxxxxxxxxxxxxxxxxxxxx
```

### 示例 3: Kimi (月之暗面)
```
API URL: https://api.moonshot.cn/v1
模型 ID: moonshot-v1-8k
API Key: sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 示例 4: OpenAI
```
API URL: https://api.openai.com/v1
模型 ID: gpt-3.5-turbo
API Key: sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 示例 5: Anthropic Claude
```
API URL: https://api.anthropic.com/v1
模型 ID: claude-3-haiku-20240307
API Key: sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 示例 6: Google Gemini
```
API URL: https://generativelanguage.googleapis.com/v1
模型 ID: gemini-pro
API Key: AIzaSyxxxxxxxxxxxxxxxxxxxxx
```

### 示例 7: 智谱清言
```
API URL: https://open.bigmodel.cn/api/paas/v4
模型 ID: glm-4-flash
API Key: xxxxxxxxxxxxxxxxxxxxxxxxx
```

### 示例 8: 讯飞星火
```
API URL: https://spark-api-open.xf-yun.com/v1
模型 ID: spark-v1.5
API Key: xxxxxxxxxxxxxxxxxxxxxxxxx
```

## 成本对比

| 服务商 | 模型 | 价格 (1K tokens) | 推荐度 |
|--------|------|------------------|--------|
| 通义千问 | qwen-turbo | ~¥0.008 | ⭐⭐⭐⭐⭐ |
| 豆包 | doubao-lite-4k | ~¥0.006 | ⭐⭐⭐⭐⭐ |
| Kimi | moonshot-v1-8k | ~¥0.012 | ⭐⭐⭐⭐ |
| 智谱清言 | glm-4-flash | ~¥0.01 | ⭐⭐⭐⭐ |
| 讯飞星火 | spark-v1.5 | ~¥0.018 | ⭐⭐⭐ |
| OpenAI | gpt-3.5-turbo | ~¥0.027 | ⭐⭐ |
| Anthropic | claude-3-haiku | ~¥0.025 | ⭐⭐ |
| Google | gemini-pro | ~¥0.015 | ⭐⭐⭐ |

## 多 API Key 轮换

支持添加多个 API Key，自动轮换使用：

- ✅ 避免单 Key 速率限制
- ✅ 提升分析速度
- ✅ 提高稳定性
- ✅ 成本分摊

## API 连接测试功能

### 测试步骤
1. 配置好 API URL、模型 ID 和 API Key
2. 点击 "测试连接" 按钮
3. 系统会自动发送测试请求
4. 显示连接结果（成功/失败）

### 测试内容
- ✅ API URL 是否可访问
- ✅ API Key 是否有效
- ✅ 模型 ID 是否存在
- ✅ 网络连接是否正常
- ✅ 配额是否充足

### 故障排除
如果测试失败：
1. 检查 API URL 是否正确
2. 确认模型 ID 有效
3. 验证 API Key 格式和权限
4. 查看错误提示信息
5. 检查网络连接

## 降级方案

如果 API 调用失败，插件会自动降级到本地分析：
- 🔍 基于 URL 和标题的关键词匹配
- 🏷️ 智能标签提取
- 📁 合理的文件夹建议

## 安全说明

- 🔒 所有 API Key 仅存储在本地浏览器
- 🚫 不会上传到任何外部服务器
- 🛡️ 支持加密存储
- 🔐 完全离线可用（本地分析模式）

## 常见问题

**Q: 支持哪些 API 格式？**
A: 支持所有兼容 OpenAI Chat Completions API 格式的服务商

**Q: 可以同时配置多个服务商吗？**
A: 一次只能使用一个 API 配置，但可以随时切换

**Q: 如何获得免费 API Key？**
A: 大部分国产大模型都提供免费额度，具体请访问各厂商官网

**Q: 配置后没有生效？**
A: 请重启插件或刷新侧边栏页面

**Q: 测试连接失败怎么办？**
A: 请检查API URL、模型ID、API Key是否正确，或查看错误提示

## 技术支持

如遇到问题，请检查：
1. 浏览器控制台错误信息
2. API 服务商状态页面
3. API Key 余额和权限
4. 网络连接状态

---

**版本**: v2.0.0
**更新时间**: 2025-12-20
**兼容性**: Chrome Extension Manifest V3
