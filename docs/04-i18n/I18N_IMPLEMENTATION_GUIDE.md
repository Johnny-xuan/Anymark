# 国际化（i18n）实施指南

## ✅ 已完成的工作

### 1. 安装依赖
```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

### 2. 创建的文件结构
```
smart-bookmarks/src/i18n/
├── config.ts                 # i18n 配置文件
└── locales/
    ├── en.json              # 英语
    ├── zh-CN.json           # 简体中文
    ├── ja.json              # 日语
    ├── es.json              # 西班牙语
    ├── fr.json              # 法语
    └── de.json              # 德语
```

### 3. 支持的语言
- ✅ English (英语)
- ✅ 简体中文 (Simplified Chinese)
- ✅ 日本語 (Japanese)
- ✅ Español (Spanish)
- ✅ Français (French)
- ✅ Deutsch (German)

## 🔧 需要完成的步骤

### 步骤 1: 删除旧的 TEXTS 常量

在 `Onboarding.tsx` 中删除整个 `const TEXTS = { ... }` 对象（大约 100 行）

### 步骤 2: 更新所有文本引用

将所有 `{t.xxxxx}` 替换为 `{t('onboarding.xxx.xxx')}`

**示例替换：**
```typescript
// 旧的
{t.heroTitle}
{t.heroSubtitle}
{t.feature1Title}

// 新的
{t('onboarding.hero.title')}
{t('onboarding.hero.subtitle')}
{t('onboarding.features.feature1.title')}
```

### 步骤 3: 更新语言切换器

语言切换器已更新为下拉选择框，支持 6 种语言。

### 步骤 4: 更新 CSS

在 `Onboarding.css` 中添加语言选择器样式：

```css
.language-toggle-container {
  position: fixed;
  top: 30px;
  right: 30px;
  z-index: 1000;
}

.language-toggle {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(59, 130, 246, 1);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 50px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  font-family: inherit;
  backdrop-filter: blur(12px);
}

.language-toggle:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(59, 130, 246, 0.3);
}

.language-toggle option {
  background: #0b1220;
  color: white;
}
```

## 📝 完整的文本映射表

| 旧的引用 | 新的 i18n 键 |
|---------|-------------|
| `t.heroTitle` | `t('onboarding.hero.title')` |
| `t.heroSubtitle` | `t('onboarding.hero.subtitle')` |
| `t.heroDescription` | `t('onboarding.hero.description')` |
| `t.featuresHeading` | `t('onboarding.features.heading')` |
| `t.feature1Title` | `t('onboarding.features.feature1.title')` |
| `t.feature1Desc` | `t('onboarding.features.feature1.desc')` |
| `t.feature2Title` | `t('onboarding.features.feature2.title')` |
| `t.feature2Desc` | `t('onboarding.features.feature2.desc')` |
| `t.feature3Title` | `t('onboarding.features.feature3.title')` |
| `t.feature3Desc` | `t('onboarding.features.feature3.desc')` |
| `t.shortcutsHeading` | `t('onboarding.shortcuts.heading')` |
| `t.shortcut1` | `t('onboarding.shortcuts.shortcut1')` |
| `t.shortcut2` | `t('onboarding.shortcuts.shortcut2')` |
| `t.shortcut3` | `t('onboarding.shortcuts.shortcut3')` |
| `t.shortcut4` | `t('onboarding.shortcuts.shortcut4')` |
| `t.shortcut5` | `t('onboarding.shortcuts.shortcut5')` |
| `t.shortcut6` | `t('onboarding.shortcuts.shortcut6')` |
| `t.shortcutsNote` | `t('onboarding.shortcuts.note')` |
| `t.tutorialHeading` | `t('onboarding.tutorial.heading')` |
| `t.tutorialSubtitle` | `t('onboarding.tutorial.subtitle')` |
| `t.step1Title` | `t('onboarding.tutorial.step1.title')` |
| `t.step1Desc` | `t('onboarding.tutorial.step1.desc')` |
| `t.step2Title` | `t('onboarding.tutorial.step2.title')` |
| `t.step2Desc` | `t('onboarding.tutorial.step2.desc')` |
| `t.step3Title` | `t('onboarding.tutorial.step3.title')` |
| `t.step3Desc` | `t('onboarding.tutorial.step3.desc')` |
| `t.themesHeading` | `t('onboarding.themes.heading')` |
| `t.themesSubtitle` | `t('onboarding.themes.subtitle')` |
| `t.theme1Name` | `t('onboarding.themes.koda.name')` |
| `t.theme1Subtitle` | `t('onboarding.themes.koda.subtitle')` |
| `t.theme1Desc` | `t('onboarding.themes.koda.desc')` |
| `t.theme2Name` | `t('onboarding.themes.vex.name')` |
| `t.theme2Subtitle` | `t('onboarding.themes.vex.subtitle')` |
| `t.theme2Desc` | `t('onboarding.themes.vex.desc')` |
| `t.theme3Name` | `t('onboarding.themes.sprout.name')` |
| `t.theme3Subtitle` | `t('onboarding.themes.sprout.subtitle')` |
| `t.theme3Desc` | `t('onboarding.themes.sprout.desc')` |
| `t.theme4Name` | `t('onboarding.themes.flare.name')` |
| `t.theme4Subtitle` | `t('onboarding.themes.flare.subtitle')` |
| `t.theme4Desc` | `t('onboarding.themes.flare.desc')` |
| `t.theme5Name` | `t('onboarding.themes.null.name')` |
| `t.theme5Subtitle` | `t('onboarding.themes.null.subtitle')` |
| `t.theme5Desc` | `t('onboarding.themes.null.desc')` |
| `t.ctaHeading` | `t('onboarding.cta.heading')` |
| `t.ctaText` | `t('onboarding.cta.text')` |
| `t.ctaButton` | `t('onboarding.cta.button')` |
| `t.ctaHint` | `t('onboarding.cta.hint')` |

## 🚀 快速实施命令

由于文件较大，建议使用查找替换功能：

1. 在 VS Code 中打开 `Onboarding.tsx`
2. 使用正则表达式查找替换：
   - 查找: `\{t\.(\w+)\}`
   - 需要手动根据映射表替换

## ✨ 优势

1. **纯净的界面** - 中文界面不再有英文括号
2. **全球化支持** - 支持 6 种主要语言
3. **自动检测** - 根据浏览器语言自动选择
4. **易于扩展** - 添加新语言只需添加 JSON 文件
5. **专业标准** - 使用业界标准的 i18next 库

## 📦 下一步扩展

如果需要添加更多语言，只需：
1. 在 `src/i18n/locales/` 创建新的 JSON 文件（如 `ko.json` 韩语）
2. 在 `config.ts` 中导入并添加到 resources
3. 在语言选择器中添加选项

## 🎯 测试

编译后测试：
1. 切换不同语言
2. 刷新页面，语言应该保持
3. 检查所有文本是否正确显示
4. 确认没有遗漏的翻译（会显示键名）
