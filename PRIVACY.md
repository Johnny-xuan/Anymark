# Privacy Policy

**Last Updated:** December 2025

## Introduction

AnyMark is a Chrome extension that helps you manage bookmarks using AI-powered features. We are committed to protecting your privacy and being transparent about how we handle your data.

## Data Collection

### What We Collect

**1. Bookmarks Data**
- We access your Chrome bookmarks to provide management features
- All bookmark data is stored locally on your device using IndexedDB
- No bookmark data is uploaded to our servers

**2. Browsing Data**
- We access the active tab URL when you save a bookmark
- We extract page content for AI analysis (when enabled)
- This data is processed locally or sent to your configured AI service

**3. User Preferences**
- Extension settings and configurations
- AI API keys (stored locally in Chrome storage)
- Theme and language preferences
- Keyboard shortcut customizations

### What We Don't Collect

- ❌ We do NOT track your browsing history
- ❌ We do NOT collect personal information
- ❌ We do NOT send analytics to any server
- ❌ We do NOT use cookies or tracking technologies
- ❌ We do NOT sell or share your data with third parties

## Data Storage

All data is stored locally on your device:
- **Bookmarks:** IndexedDB (local database)
- **Settings:** Chrome Storage API
- **AI API Keys:** Chrome Storage API (encrypted)

## AI Features

When you use AI features:
- Data is sent directly to the AI service you configure (OpenAI, Anthropic, etc.)
- We do NOT act as an intermediary
- Your API keys are stored locally and never sent to our servers
- Review the privacy policy of your chosen AI service for details

## Third-Party Services

The extension connects to third-party services only when you explicitly configure them:

**AI Services (Optional)**
- OpenAI, Anthropic, Google, DeepSeek, etc.
- Connected directly using your API keys
- We have no access to your API keys or conversations

**Search & Discovery (Optional)**
- GitHub API (for trending projects)
- DuckDuckGo (for web search)
- `search.j-o-x.tech` - Our search proxy (does not log queries or track users)

**AI Proxy Service (Optional)**
- `v1.j-o-x.tech` - For users without their own API keys
- Forwards requests to AI providers (OpenAI, etc.)
- Does not store conversation content or log user data
- Completely optional - you can use your own API keys instead

## Content Scripts

This extension injects content scripts into web pages to:
- Display a "Save" button on web pages
- Show Pixel Buddy (interactive assistant)
- Extract page content for bookmark saving

These scripts run locally and do not collect or transmit any data.

## Data Sharing

We do not share your data with any third parties, except:
- AI services you explicitly configure (direct connection, we don't intermediate)
- Chrome APIs required for extension functionality

## Data Deletion

To delete your data:
1. Remove the extension from Chrome
2. All local data will be deleted automatically
3. Your Chrome bookmarks remain unchanged (synced separately by Google)

## Children's Privacy

Our service is not directed to children under 13. We do not knowingly collect personal information from children.

## Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any material changes through the extension.

## Contact Us

If you have questions about this privacy policy:
- **Email:** anymark2025@163.com
- **GitHub:** [github.com/Johnny-xuan/Anymark](https://github.com/Johnny-xuan/Anymark)

## Open Source Transparency

AnyMark is 100% open source. You can review our code at:
[github.com/Johnny-xuan/Anymark](https://github.com/Johnny-xuan/Anymark)
