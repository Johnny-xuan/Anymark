# 爬虫智能内容提取设计方案

## 概述

为历史书签提供智能AI分析，需要后端爬虫服务抓取页面内容。关键挑战是：
1. 提取**有价值的内容**，过滤噪音
2. 压缩内容，避免超过AI token限制
3. 保持内容的语义完整性

## 技术方案

### 1. 爬虫层（获取HTML）

```python
# backend/crawler/fetcher.py
import httpx
from playwright.async_api import async_playwright

class SmartFetcher:
    """智能页面获取器"""
    
    async def fetch_page(self, url: str) -> dict:
        """
        获取页面内容
        优先使用简单HTTP请求，失败则使用浏览器渲染
        """
        try:
            # 1. 尝试简单HTTP请求（快速）
            return await self._fetch_simple(url)
        except Exception:
            # 2. 失败则使用浏览器渲染（处理JS渲染的页面）
            return await self._fetch_browser(url)
    
    async def _fetch_simple(self, url: str) -> dict:
        """简单HTTP请求"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            
            return {
                'html': response.text,
                'final_url': str(response.url),
                'status_code': response.status_code,
                'method': 'simple'
            }
    
    async def _fetch_browser(self, url: str) -> dict:
        """浏览器渲染（处理动态内容）"""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            await page.goto(url, wait_until='networkidle', timeout=15000)
            html = await page.content()
            final_url = page.url
            
            await browser.close()
            
            return {
                'html': html,
                'final_url': final_url,
                'status_code': 200,
                'method': 'browser'
            }
```

### 2. 内容提取层（核心！）

使用多种策略提取有价值内容：

```python
# backend/crawler/extractor.py
from bs4 import BeautifulSoup
from readability import Document
import trafilatura
from typing import Dict, Optional

class ContentExtractor:
    """智能内容提取器"""
    
    def extract(self, html: str, url: str) -> Dict[str, str]:
        """
        多策略提取内容
        优先级：Trafilatura > Readability > BeautifulSoup
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # 1. 提取元数据（快速、准确）
        metadata = self._extract_metadata(soup)
        
        # 2. 提取主要内容（智能）
        main_content = self._extract_main_content(html, url)
        
        # 3. 提取结构化信息
        structured = self._extract_structured_data(soup, url)
        
        return {
            'title': metadata['title'],
            'description': metadata['description'],
            'keywords': metadata['keywords'],
            'author': metadata['author'],
            'publish_date': metadata['publish_date'],
            'main_content': main_content,
            'content_type': structured['content_type'],
            'language': structured['language'],
            'reading_time': structured['reading_time'],
        }
    
    def _extract_metadata(self, soup: BeautifulSoup) -> dict:
        """提取meta标签信息"""
        metadata = {
            'title': '',
            'description': '',
            'keywords': '',
            'author': '',
            'publish_date': '',
        }
        
        # 标题优先级：og:title > twitter:title > title标签
        metadata['title'] = (
            self._get_meta(soup, 'og:title') or
            self._get_meta(soup, 'twitter:title') or
            (soup.title.string if soup.title else '')
        )
        
        # 描述优先级：og:description > twitter:description > description
        metadata['description'] = (
            self._get_meta(soup, 'og:description') or
            self._get_meta(soup, 'twitter:description') or
            self._get_meta(soup, 'description')
        )
        
        # 关键词
        metadata['keywords'] = self._get_meta(soup, 'keywords')
        
        # 作者
        metadata['author'] = (
            self._get_meta(soup, 'author') or
            self._get_meta(soup, 'article:author')
        )
        
        # 发布日期
        metadata['publish_date'] = (
            self._get_meta(soup, 'article:published_time') or
            self._get_meta(soup, 'datePublished')
        )
        
        return metadata
    
    def _extract_main_content(self, html: str, url: str) -> str:
        """
        提取主要内容（核心算法）
        使用Trafilatura（最佳）+ Readability（后备）
        """
        # 策略1：Trafilatura（专门用于提取文章内容）
        content = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=True,
            include_images=False,
            output_format='txt',
            url=url,
            favor_precision=True,  # 精确模式，减少噪音
        )
        
        if content and len(content) > 100:
            return content
        
        # 策略2：Readability（Mozilla算法）
        try:
            doc = Document(html)
            content = doc.summary(html_partial=False)
            soup = BeautifulSoup(content, 'html.parser')
            text = soup.get_text(separator=' ', strip=True)
            
            if len(text) > 100:
                return text
        except Exception:
            pass
        
        # 策略3：BeautifulSoup手动提取（最后手段）
        return self._extract_fallback(html)
    
    def _extract_fallback(self, html: str) -> str:
        """后备提取方案"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # 移除噪音标签
        for tag in soup(['script', 'style', 'nav', 'header', 'footer', 
                        'aside', 'iframe', 'noscript']):
            tag.decompose()
        
        # 优先提取主要内容区域
        main_selectors = [
            'article',
            'main',
            '[role="main"]',
            '.content',
            '#content',
            '.post-content',
            '.article-content',
        ]
        
        for selector in main_selectors:
            main = soup.select_one(selector)
            if main:
                text = main.get_text(separator=' ', strip=True)
                if len(text) > 100:
                    return text
        
        # 最后：提取body
        body = soup.body
        if body:
            return body.get_text(separator=' ', strip=True)
        
        return soup.get_text(separator=' ', strip=True)
    
    def _extract_structured_data(self, soup: BeautifulSoup, url: str) -> dict:
        """提取结构化信息"""
        # 检测内容类型
        content_type = self._detect_content_type(soup, url)
        
        # 检测语言
        language = (
            soup.html.get('lang') if soup.html else 'unknown'
        )
        
        # 估算阅读时间
        text = soup.get_text()
        word_count = len(text.split())
        reading_time = max(1, word_count // 200)  # 假设每分钟200字
        
        return {
            'content_type': content_type,
            'language': language,
            'reading_time': reading_time,
        }
    
    def _detect_content_type(self, soup: BeautifulSoup, url: str) -> str:
        """检测内容类型"""
        # GitHub仓库
        if 'github.com' in url and '/blob/' not in url:
            return 'github_repo'
        
        # 视频
        if any(domain in url for domain in ['youtube.com', 'youtu.be', 'bilibili.com']):
            return 'video'
        
        # 文档
        if any(keyword in url for keyword in ['/docs/', '/documentation/', '/api/']):
            return 'documentation'
        
        # 博客文章
        if soup.find('article') or soup.find(class_='post'):
            return 'article'
        
        return 'webpage'
    
    def _get_meta(self, soup: BeautifulSoup, name: str) -> Optional[str]:
        """获取meta标签内容"""
        # name属性
        meta = soup.find('meta', attrs={'name': name})
        if meta and meta.get('content'):
            return meta['content']
        
        # property属性（Open Graph）
        meta = soup.find('meta', attrs={'property': name})
        if meta and meta.get('content'):
            return meta['content']
        
        return None
```

### 3. 内容清洗和压缩层

```python
# backend/crawler/cleaner.py
import re
from typing import Dict

class ContentCleaner:
    """内容清洗和压缩"""
    
    def clean_and_compress(self, content: Dict[str, str], max_length: int = 2000) -> Dict[str, str]:
        """
        清洗和压缩内容
        目标：保留最有价值的信息，控制在max_length字符内
        """
        # 1. 清洗文本
        cleaned = {
            'title': self._clean_text(content['title']),
            'description': self._clean_text(content['description']),
            'keywords': self._clean_text(content['keywords']),
            'main_content': self._clean_text(content['main_content']),
        }
        
        # 2. 智能压缩主要内容
        cleaned['main_content'] = self._compress_content(
            cleaned['main_content'],
            max_length
        )
        
        # 3. 提取关键句子（如果内容太长）
        if len(cleaned['main_content']) > max_length:
            cleaned['main_content'] = self._extract_key_sentences(
                cleaned['main_content'],
                max_length
            )
        
        return cleaned
    
    def _clean_text(self, text: str) -> str:
        """清洗文本"""
        if not text:
            return ''
        
        # 移除多余空白
        text = re.sub(r'\s+', ' ', text)
        
        # 移除特殊字符
        text = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', text)
        
        # 移除重复标点
        text = re.sub(r'([。！？，；])\1+', r'\1', text)
        
        return text.strip()
    
    def _compress_content(self, text: str, max_length: int) -> str:
        """压缩内容（保留开头和关键部分）"""
        if len(text) <= max_length:
            return text
        
        # 策略：保留前70%，然后是最后30%
        first_part_len = int(max_length * 0.7)
        last_part_len = max_length - first_part_len
        
        first_part = text[:first_part_len]
        last_part = text[-last_part_len:]
        
        return f"{first_part}... {last_part}"
    
    def _extract_key_sentences(self, text: str, max_length: int) -> str:
        """提取关键句子（基于TF-IDF或位置）"""
        sentences = re.split(r'[。！？\n]', text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
        
        if not sentences:
            return text[:max_length]
        
        # 简单策略：取前3句 + 中间2句 + 最后2句
        key_sentences = []
        
        # 前3句
        key_sentences.extend(sentences[:3])
        
        # 中间2句
        mid_idx = len(sentences) // 2
        key_sentences.extend(sentences[mid_idx:mid_idx+2])
        
        # 最后2句
        key_sentences.extend(sentences[-2:])
        
        result = '。'.join(key_sentences)
        
        if len(result) > max_length:
            return result[:max_length]
        
        return result
```

### 4. API接口层

```python
# backend/api/crawler.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import Optional

app = FastAPI()

class CrawlRequest(BaseModel):
    url: HttpUrl
    max_content_length: int = 2000

class CrawlResponse(BaseModel):
    url: str
    title: str
    description: str
    keywords: str
    main_content: str
    content_type: str
    language: str
    reading_time: int
    author: Optional[str]
    publish_date: Optional[str]

@app.post("/api/crawl", response_model=CrawlResponse)
async def crawl_page(request: CrawlRequest):
    """
    爬取并提取页面内容
    """
    try:
        # 1. 获取HTML
        fetcher = SmartFetcher()
        page_data = await fetcher.fetch_page(str(request.url))
        
        # 2. 提取内容
        extractor = ContentExtractor()
        content = extractor.extract(page_data['html'], str(request.url))
        
        # 3. 清洗和压缩
        cleaner = ContentCleaner()
        cleaned = cleaner.clean_and_compress(content, request.max_content_length)
        
        return CrawlResponse(
            url=page_data['final_url'],
            title=cleaned['title'],
            description=cleaned['description'],
            keywords=cleaned['keywords'],
            main_content=cleaned['main_content'],
            content_type=content['content_type'],
            language=content['language'],
            reading_time=content['reading_time'],
            author=content.get('author'),
            publish_date=content.get('publish_date'),
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/crawl-and-analyze")
async def crawl_and_analyze(request: CrawlRequest):
    """
    爬取页面并调用AI分析
    """
    # 1. 爬取内容
    crawl_result = await crawl_page(request)
    
    # 2. 调用AI分析
    ai_analyzer = AIAnalyzer()
    analysis = await ai_analyzer.analyze({
        'url': crawl_result.url,
        'title': crawl_result.title,
        'description': crawl_result.description,
        'keywords': crawl_result.keywords,
        'bodyText': crawl_result.main_content,
    })
    
    return {
        'crawl_result': crawl_result,
        'ai_analysis': analysis,
    }
```

### 5. 前端调用

```typescript
// smart-bookmarks/src/utils/crawlerClient.ts

export class CrawlerClient {
  private endpoint: string;
  private authToken: string;
  
  constructor(endpoint: string, authToken: string) {
    this.endpoint = endpoint;
    this.authToken = authToken;
  }
  
  async crawlAndAnalyze(url: string): Promise<{
    title: string;
    description: string;
    keywords: string;
    mainContent: string;
    aiAnalysis: IAIAnalysis;
  }> {
    const response = await fetch(`${this.endpoint}/api/crawl-and-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({
        url,
        max_content_length: 2000,  // 限制内容长度
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Crawler API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      title: data.crawl_result.title,
      description: data.crawl_result.description,
      keywords: data.crawl_result.keywords,
      mainContent: data.crawl_result.main_content,
      aiAnalysis: data.ai_analysis,
    };
  }
}
```

## 内容提取示例

### 示例1：技术博客

**输入URL：** `https://blog.example.com/react-hooks-guide`

**提取结果：**
```json
{
  "title": "React Hooks完全指南",
  "description": "深入理解React Hooks的工作原理和最佳实践",
  "keywords": "react, hooks, useState, useEffect, javascript",
  "main_content": "React Hooks是React 16.8引入的新特性，它让你在不编写class的情况下使用state和其他React特性。本文将详细介绍useState、useEffect等核心Hooks的使用方法...",
  "content_type": "article",
  "language": "zh-CN",
  "reading_time": 8
}
```

**发送给AI的内容（压缩后）：**
```
【URL】https://blog.example.com/react-hooks-guide
【标题】React Hooks完全指南
【描述】深入理解React Hooks的工作原理和最佳实践
【关键词】react, hooks, useState, useEffect, javascript
【正文摘要】React Hooks是React 16.8引入的新特性，它让你在不编写class的情况下使用state和其他React特性。本文将详细介绍useState、useEffect等核心Hooks的使用方法...（2000字符）
```

### 示例2：GitHub仓库

**输入URL：** `https://github.com/facebook/react`

**提取结果：**
```json
{
  "title": "facebook/react: The library for web and native user interfaces",
  "description": "React is a JavaScript library for building user interfaces",
  "keywords": "react, javascript, ui, library, facebook",
  "main_content": "React - A JavaScript library for building user interfaces. React makes it painless to create interactive UIs. Design simple views for each state in your application...",
  "content_type": "github_repo",
  "language": "en",
  "reading_time": 3
}
```

## 性能优化

1. **缓存机制**：相同URL的爬取结果缓存24小时
2. **并发控制**：限制同时爬取的数量（5个）
3. **超时控制**：单个页面爬取超时15秒
4. **失败重试**：失败后重试1次
5. **速率限制**：每个IP每分钟最多30个请求

## 成本估算

- 爬取：$0.001/次（服务器成本）
- AI分析：$0.002/次（API成本）
- 总计：$0.003/书签

导入1000个书签 = $3

## 总结

这个方案的核心优势：

1. ✅ **智能提取**：使用Trafilatura + Readability，提取高质量内容
2. ✅ **内容清洗**：移除噪音，保留有价值信息
3. ✅ **智能压缩**：控制在2000字符内，避免超过AI token限制
4. ✅ **多策略后备**：确保各种类型的网页都能正确提取
5. ✅ **结构化信息**：提取元数据、内容类型、语言等
