/**
 * AI分析接口
 * 支持 Claude、OpenAI、Kimi 等多种 AI 服务提供商
 */

import type { IAIAnalysis, IBookmark } from '../types/bookmark';
import { APIKeyRotator } from './apiKeyRotator';
import { extractFrameworkContent } from './contentExtractor';
import { getCurrentLanguage, type SupportedLanguage } from '../i18n/config';

interface PageContent {
  url: string;
  title: string;
  description?: string;
  keywords?: string;
  bodyText?: string;
  existingFolders?: string[];
}

interface AIConfig {
  provider: 'claude' | 'openai' | 'kimi' | 'local' | 'proxy' | 'custom' | 'ollama' | 'doubao' | 'deepseek' | 'aliyun' | 'groq' | 'xai' | 'openrouter';
  apiKey?: string;
  apiKeys?: string[];
  endpoint?: string;
  authToken?: string;
  apiUrl?: string;
  modelId?: string;
}

// ============ 多语言 AI 分析提示词 ============

const ANALYSIS_PROMPTS: Record<string, string> = {
  'zh-CN': `你是一个专业的网页内容分析助手。

你的任务是理解网页的核心内容，提取关键信息。

请返回 JSON 格式的分析结果：
{
  "summary": "一句话说明页面的核心价值（50字符以内）",
  "tags": ["标签1", "标签2", "标签3"],
  "confidence": 0.9,
  "suggestedFolder": "/推荐文件夹路径"
}

要求：
- summary 要精炼，50字符以内，说明核心价值
- tags 要有搜索价值，便于以后查找（3-5个）
- confidence 表示分析的置信度（0-1）
- suggestedFolder 从用户已有文件夹中选最匹配的；如无合适的，建议一个新的子路径。路径必须以用户已有的顶级文件夹开头（如 /Bookmarks Bar/... 或 /Other Bookmarks/...）
- 用中文输出 summary 和 tags
- 只返回纯 JSON，不要其他内容

示例：
{
  "summary": "React Hooks 官方文档与最佳实践",
  "tags": ["React", "Hooks", "官方文档", "前端开发"],
  "confidence": 0.95,
  "suggestedFolder": "/Bookmarks Bar/开发/前端"
}`,

  'en': `You are a professional web content analysis assistant.

Your task is to understand the core content of a web page and extract key information.

Return the analysis result in JSON format:
{
  "summary": "Core value in under 50 characters",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.9,
  "suggestedFolder": "/recommended-folder-path"
}

Requirements:
- summary should be concise (under 50 characters), specific about core value
- tags should have search value for future lookup (3-5 tags)
- confidence indicates analysis confidence (0-1)
- suggestedFolder: pick the best match from user's existing folders; if none fits, suggest a new sub-path. Path MUST start with an existing top-level folder (e.g. /Bookmarks Bar/... or /Other Bookmarks/...)
- Write summary and tags in English
- Return only pure JSON, nothing else

Example:
{
  "summary": "React Hooks official docs and best practices",
  "tags": ["React", "Hooks", "Documentation", "Frontend"],
  "confidence": 0.95,
  "suggestedFolder": "/Bookmarks Bar/Dev/Frontend"
}`,

  'ja': `あなたはプロフェッショナルなウェブコンテンツ分析アシスタントです。

ウェブページの核心コンテンツを理解し、重要な情報を抽出してください。

JSON形式で分析結果を返してください：
{
  "summary": "ページの核心的価値を一文で説明（50文字以内）",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "confidence": 0.9,
  "suggestedFolder": "/推奨フォルダパス"
}

要件：
- summary は簡潔に（50文字以内）、核心的価値を説明
- tags は検索価値のあるもの（3-5個）
- confidence は分析の確信度（0-1）
- suggestedFolder はユーザーの既存フォルダから最適なものを選択；適切なものがなければ新しいサブパスを提案。パスは必ず既存のトップレベルフォルダで始めてください（例：/Bookmarks Bar/... または /Other Bookmarks/...）
- summary と tags は日本語で出力
- 純粋なJSONのみを返し、他の内容は含めない

例：
{
  "summary": "React Hooks公式ドキュメントとベストプラクティス",
  "tags": ["React", "Hooks", "公式ドキュメント", "フロントエンド"],
  "confidence": 0.95,
  "suggestedFolder": "/Bookmarks Bar/開発/フロントエンド"
}`,

  'es': `Eres un asistente profesional de análisis de contenido web.

Tu tarea es comprender el contenido principal de una página web y extraer información clave.

Devuelve el resultado del análisis en formato JSON:
{
  "summary": "Valor principal en menos de 50 caracteres",
  "tags": ["etiqueta1", "etiqueta2", "etiqueta3"],
  "confidence": 0.9,
  "suggestedFolder": "/ruta-de-carpeta-recomendada"
}

Requisitos:
- summary debe ser conciso (menos de 50 caracteres), específico sobre el valor principal
- tags deben tener valor de búsqueda (3-5 etiquetas)
- confidence indica la confianza del análisis (0-1)
- suggestedFolder: elige la mejor coincidencia de las carpetas existentes del usuario; si ninguna encaja, sugiere una nueva sub-ruta. La ruta DEBE comenzar con una carpeta de nivel superior existente (ej. /Bookmarks Bar/... o /Other Bookmarks/...)
- Escribe summary y tags en español
- Devuelve solo JSON puro, nada más

Ejemplo:
{
  "summary": "Docs oficiales de React Hooks y buenas prácticas",
  "tags": ["React", "Hooks", "Documentación", "Frontend"],
  "confidence": 0.95,
  "suggestedFolder": "/Bookmarks Bar/Desarrollo/Frontend"
}`,

  'fr': `Vous êtes un assistant professionnel d'analyse de contenu web.

Votre tâche est de comprendre le contenu principal d'une page web et d'en extraire les informations clés.

Retournez le résultat de l'analyse au format JSON :
{
  "summary": "Valeur principale en moins de 50 caractères",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.9,
  "suggestedFolder": "/chemin-dossier-recommandé"
}

Exigences :
- summary doit être concis (moins de 50 caractères), spécifique sur la valeur principale
- tags doivent avoir une valeur de recherche (3-5 tags)
- confidence indique la confiance de l'analyse (0-1)
- suggestedFolder : choisir le meilleur dossier parmi les dossiers existants de l'utilisateur ; si aucun ne convient, suggérer un nouveau sous-chemin. Le chemin DOIT commencer par un dossier de premier niveau existant (ex. /Bookmarks Bar/... ou /Other Bookmarks/...)
- Écrivez summary et tags en français
- Retournez uniquement du JSON pur, rien d'autre

Exemple :
{
  "summary": "Docs officiels React Hooks et bonnes pratiques",
  "tags": ["React", "Hooks", "Documentation", "Frontend"],
  "confidence": 0.95,
  "suggestedFolder": "/Bookmarks Bar/Dev/Frontend"
}`,

  'de': `Sie sind ein professioneller Webinhalts-Analyse-Assistent.

Ihre Aufgabe ist es, den Kerninhalt einer Webseite zu verstehen und Schlüsselinformationen zu extrahieren.

Geben Sie das Analyseergebnis im JSON-Format zurück:
{
  "summary": "Kernwert in unter 50 Zeichen",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "confidence": 0.9,
  "suggestedFolder": "/empfohlener-Ordnerpfad"
}

Anforderungen:
- summary sollte prägnant sein (unter 50 Zeichen), spezifisch den Kernwert beschreiben
- tags sollten Suchwert haben (3-5 Tags)
- confidence gibt die Analysegenauigkeit an (0-1)
- suggestedFolder: den am besten passenden Ordner aus den vorhandenen Ordnern des Benutzers wählen; wenn keiner passt, einen neuen Unterpfad vorschlagen. Der Pfad MUSS mit einem vorhandenen Ordner der obersten Ebene beginnen (z.B. /Bookmarks Bar/... oder /Other Bookmarks/...)
- Schreiben Sie summary und tags auf Deutsch
- Geben Sie nur reines JSON zurück, nichts anderes

Beispiel:
{
  "summary": "React Hooks Offizielle Doku und Best Practices",
  "tags": ["React", "Hooks", "Dokumentation", "Frontend"],
  "confidence": 0.95,
  "suggestedFolder": "/Bookmarks Bar/Entwicklung/Frontend"
}`,
};

// ============ 多语言文件夹标签 ============

const FOLDER_LABELS: Record<string, string> = {
  'zh-CN': '【用户已有文件夹】',
  'en': '[Existing Folders]',
  'ja': '【既存フォルダ】',
  'es': '[Carpetas existentes]',
  'fr': '[Dossiers existants]',
  'de': '[Vorhandene Ordner]',
};

// ============ 多语言字段标签 ============

interface FieldLabels {
  url: string;
  title: string;
  excerpt: string;
  author: string;
  site: string;
  content: string;
  description: string;
  keywords: string;
  bodyText: string;
  instruction: string;
}

const FIELD_LABELS: Record<string, FieldLabels> = {
  'zh-CN': {
    url: '【URL】', title: '【标题】', excerpt: '【摘要】',
    author: '【作者】', site: '【网站】', content: '【内容框架】',
    description: '【描述】', keywords: '【关键词】', bodyText: '【正文摘要】',
    instruction: '请分析这个网页，返回JSON格式。',
  },
  'en': {
    url: '[URL] ', title: '[Title] ', excerpt: '[Excerpt] ',
    author: '[Author] ', site: '[Site] ', content: '[Content]',
    description: '[Description] ', keywords: '[Keywords] ', bodyText: '[Body Text]',
    instruction: 'Analyze this web page and return JSON format.',
  },
  'ja': {
    url: '【URL】', title: '【タイトル】', excerpt: '【要約】',
    author: '【著者】', site: '【サイト】', content: '【コンテンツ】',
    description: '【説明】', keywords: '【キーワード】', bodyText: '【本文要約】',
    instruction: 'このウェブページを分析し、JSON形式で返してください。',
  },
  'es': {
    url: '[URL] ', title: '[Título] ', excerpt: '[Extracto] ',
    author: '[Autor] ', site: '[Sitio] ', content: '[Contenido]',
    description: '[Descripción] ', keywords: '[Palabras clave] ', bodyText: '[Texto principal]',
    instruction: 'Analiza esta página web y devuelve el resultado en formato JSON.',
  },
  'fr': {
    url: '[URL] ', title: '[Titre] ', excerpt: '[Extrait] ',
    author: '[Auteur] ', site: '[Site] ', content: '[Contenu]',
    description: '[Description] ', keywords: '[Mots-clés] ', bodyText: '[Texte principal]',
    instruction: 'Analysez cette page web et retournez le résultat au format JSON.',
  },
  'de': {
    url: '[URL] ', title: '[Titel] ', excerpt: '[Auszug] ',
    author: '[Autor] ', site: '[Webseite] ', content: '[Inhalt]',
    description: '[Beschreibung] ', keywords: '[Schlüsselwörter] ', bodyText: '[Haupttext]',
    instruction: 'Analysieren Sie diese Webseite und geben Sie das Ergebnis im JSON-Format zurück.',
  },
};

export class AIAnalyzer {
  private config: AIConfig;
  private keyRotator: APIKeyRotator | null = null;

  constructor(config: AIConfig) {
    this.config = config;

    if (config.apiKeys && config.apiKeys.length > 0) {
      this.keyRotator = new APIKeyRotator(config.apiKeys);
      console.log(`[AI] Initialized with ${config.apiKeys.length} API keys`);
    }
  }

  /**
   * 分析书签
   * 使用框架内容提取进行轻量级分析
   */
  async analyzeBookmark(
    pageContent: PageContent,
    context?: {
      recentBookmarks?: IBookmark[];
    }
  ): Promise<IAIAnalysis> {
    try {
      // 1. 提取框架内容（1000-2000 字符）
      let frameworkContent;
      try {
        frameworkContent = await extractFrameworkContent(pageContent.url);
        console.log('[AI] Framework content extracted:', frameworkContent.title);
      } catch (error) {
        console.warn('[AI] Framework extraction failed, using pageContent:', error);
        // 如果提取失败，使用传入的 pageContent
        frameworkContent = null;
      }

      // 2. 调用 AI 服务分析
      const analysis = await this.callAIService(pageContent, frameworkContent, context);
      return analysis;
    } catch (error) {
      console.error('[AI] Analysis failed:', error);
      return this.getFallbackAnalysis(pageContent);
    }
  }

  /**
   * 调用AI服务
   */
  private async callAIService(pageContent: PageContent, frameworkContent: any, context?: any): Promise<IAIAnalysis> {
    switch (this.config.provider) {
      case 'proxy':
        return this.callProxyBackend(pageContent, frameworkContent, context);
      case 'ollama':
        return this.callOllama(pageContent, frameworkContent, context);
      case 'claude':
        return this.callClaude(pageContent, frameworkContent, context);
      case 'openai':
      case 'custom':
      case 'doubao':
      case 'deepseek':
      case 'aliyun':
      case 'groq':
      case 'xai':
      case 'openrouter':
        return this.callOpenAICompatible(pageContent, frameworkContent, context);
      case 'kimi':
        return this.callKimi(pageContent, frameworkContent, context);
      case 'local':
        return this.enhancedLocalAnalysis(pageContent, frameworkContent, context);
      default:
        throw new Error(`Unknown AI provider: ${this.config.provider}`);
    }
  }

  /**
   * 调用后端代理 API
   */
  private async callProxyBackend(pageContent: PageContent, frameworkContent: any, context?: any): Promise<IAIAnalysis> {
    if (!this.config.endpoint) {
      throw new Error('Proxy backend endpoint not configured');
    }

    try {
      console.log('[AI] Calling proxy backend:', this.config.endpoint);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: pageContent.url,
          title: pageContent.title,
          description: pageContent.description,
          keywords: pageContent.keywords,
          bodyText: pageContent.bodyText,
          frameworkContent,
          context,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const data = result.analysis || result.data || result;

      return {
        summary: data.summary || 'Analysis unavailable',
        tags: data.tags || [],
        confidence: data.confidence || 0.5,
        suggestedFolder: typeof data.suggestedFolder === 'string' ? data.suggestedFolder : undefined,
      };
    } catch (error) {
      console.error('[AI] Proxy backend call failed:', error);
      return this.enhancedLocalAnalysis(pageContent, frameworkContent, context);
    }
  }

  /**
   * 调用Claude API
   */
  private async callClaude(pageContent: PageContent, frameworkContent: any, context?: any): Promise<IAIAnalysis> {
    if (!this.config.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const prompt = this.buildAnalysisPrompt(pageContent, frameworkContent, context);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseAIResponse(data.content[0].text);
    } catch (error) {
      console.error('[AI] Claude API call failed:', error);
      throw error;
    }
  }

  /**
   * 调用 Ollama 本地模型
   */
  private async callOllama(pageContent: PageContent, frameworkContent: any, context?: any): Promise<IAIAnalysis> {
    const apiUrl = this.config.endpoint || 'http://localhost:11434/v1/chat/completions';
    const modelId = this.config.modelId || ''; // 默认空，用户需在设置中配置
    // Ollama 本地不需要 API Key
    const apiKey = this.config.apiKey || '';

    const prompt = this.buildAnalysisPrompt(pageContent, frameworkContent, context);

    try {
      console.log('[AI] Calling Ollama:', apiUrl, 'model:', modelId);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: 'system',
              content: this.getAnalysisSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1024,
          temperature: 0.3,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI] Ollama API error:', response.status, errorText);
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      console.log('[AI] Ollama success, tokens:', data.usage);

      return this.parseAIResponse(content);
    } catch (error) {
      console.error('[AI] Ollama call failed:', error);
      // Ollama 失败时回退到本地分析
      return this.enhancedLocalAnalysis(pageContent, frameworkContent, context);
    }
  }

  /**
   * 调用 OpenAI 兼容 API（包括 Ollama、Doubao、DeepSeek 等）
   */
  private async callOpenAICompatible(pageContent: PageContent, frameworkContent: any, context?: any): Promise<IAIAnalysis> {
    const apiUrl = this.config.endpoint || this.config.apiUrl || 'https://api.openai.com/v1/chat/completions';
    const modelId = this.config.modelId || 'gpt-3.5-turbo';
    const apiKey = this.config.apiKeys?.[0] || this.config.apiKey;

    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const prompt = this.buildAnalysisPrompt(pageContent, frameworkContent, context);

    try {
      console.log('[AI] Calling OpenAI compatible API:', apiUrl, 'model:', modelId);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: 'system',
              content: this.getAnalysisSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1024,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return this.parseAIResponse(data.choices[0].message.content);
    } catch (error) {
      console.error('[AI] OpenAI compatible API call failed:', error);
      throw error;
    }
  }

  /**
   * 调用 Kimi API (Moonshot AI)
   */
  private async callKimi(pageContent: PageContent, frameworkContent: any, context?: any): Promise<IAIAnalysis> {
    if (!this.config.apiKey && !this.keyRotator) {
      throw new Error('API key not configured');
    }

    const prompt = this.buildAnalysisPrompt(pageContent, frameworkContent, context);

    const maxRetries = this.keyRotator ? this.keyRotator.getAllKeys().length : 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const apiKey = this.keyRotator ? this.keyRotator.getNextKey() : this.config.apiKey!;

      try {
        const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'ep-20241125231507-6vqpg',
            messages: [
              {
                role: 'system',
                content: this.getAnalysisSystemPrompt(),
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 500,
            temperature: 0.2,
          }),
        });

        if (response.status === 429) {
          console.warn(`[Volcengine] Rate limit hit (attempt ${attempt + 1}/${maxRetries}), rotating to next key...`);
          lastError = new Error('Rate limit exceeded');
          continue;
        }

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Volcengine API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        console.log(`[Volcengine] Success (attempt ${attempt + 1}), tokens:`, data.usage);

        return this.parseAIResponse(content);
      } catch (error) {
        console.error(`[Volcengine] Attempt ${attempt + 1} failed:`, error);
        lastError = error as Error;
      }
    }

    console.error('[Volcengine] All API Keys exhausted, falling back to local analysis');
    return this.enhancedLocalAnalysis(pageContent, frameworkContent, context);
  }

  /**
   * AI 分析系统提示词 - 根据用户语言设置返回对应语言的提示词
   */
  private getAnalysisSystemPrompt(): string {
    const lang = getCurrentLanguage();
    return ANALYSIS_PROMPTS[lang] || ANALYSIS_PROMPTS['en'];
  }

  /**
   * 构建 AI 分析提示词
   * 使用框架内容而非完整内容，字段标签跟随用户语言
   */
  private buildAnalysisPrompt(pageContent: PageContent, frameworkContent: any, context?: any): string {
    const lang = getCurrentLanguage();
    const labels = FIELD_LABELS[lang] || FIELD_LABELS['en'];
    let prompt = '';

    // 优先使用框架内容
    if (frameworkContent) {
      prompt = `${labels.url}${pageContent.url}
${labels.title}${frameworkContent.title}`;

      if (frameworkContent.excerpt) {
        prompt += `\n${labels.excerpt}${frameworkContent.excerpt}`;
      }

      if (frameworkContent.byline) {
        prompt += `\n${labels.author}${frameworkContent.byline}`;
      }

      if (frameworkContent.siteName) {
        prompt += `\n${labels.site}${frameworkContent.siteName}`;
      }

      if (frameworkContent.textContent) {
        prompt += `\n\n${labels.content}\n${frameworkContent.textContent}`;
      }
    } else {
      // 降级使用 pageContent
      prompt = `${labels.url}${pageContent.url}
${labels.title}${pageContent.title}`;

      if (pageContent.description) {
        prompt += `\n${labels.description}${pageContent.description}`;
      }

      if (pageContent.keywords) {
        prompt += `\n${labels.keywords}${pageContent.keywords}`;
      }

      if (pageContent.bodyText) {
        prompt += `\n\n${labels.bodyText}\n${pageContent.bodyText.substring(0, 2000)}`;
      }
    }

    // 注入用户已有文件夹列表（如果有）
    if (pageContent.existingFolders && pageContent.existingFolders.length > 0) {
      const folderLabel = FOLDER_LABELS[lang] || FOLDER_LABELS['en'];
      prompt += `\n\n${folderLabel}\n${pageContent.existingFolders.join('\n')}`;
    }

    prompt += `\n\n${labels.instruction}`;

    return prompt;
  }

  /**
   * 解析 AI 响应
   * 只解析 summary、tags、confidence
   */
  private parseAIResponse(content: string): IAIAnalysis {
    try {
      let cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      cleaned = cleaned
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      console.log('[AI] Cleaned JSON:', cleaned.substring(0, 200) + '...');

      const parsed = JSON.parse(cleaned);

      const summary = this.cleanAISummary(parsed.summary || '');

      return {
        summary,
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        suggestedFolder: typeof parsed.suggestedFolder === 'string' ? parsed.suggestedFolder : undefined,
      };
    } catch (error) {
      console.error('[AI] Failed to parse response:', error);
      console.log('[AI] Raw content:', content);
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * 清理 AI 总结文本
   */
  private cleanAISummary(text: string): string {
    if (!text) return '';

    text = text
      .replace(/^["'「『]/, '')
      .replace(/["'」』]$/, '')
      .replace(/[。！？\s]+$/, '')
      .replace(/\n+/g, ' ')
      .trim();

    return text;
  }

  /**
   * 增强的本地分析算法
   * 只提取 summary、tags、confidence
   */
  private enhancedLocalAnalysis(pageContent: PageContent, frameworkContent: any, context?: any): IAIAnalysis {
    // 使用框架内容或 pageContent
    const content = frameworkContent || pageContent;
    
    const url = pageContent.url.toLowerCase();
    const title = (content.title || pageContent.title).toLowerCase();
    const description = (content.excerpt || pageContent.description || '').toLowerCase();
    const textContent = (content.textContent || pageContent.bodyText || '').toLowerCase();
    const allText = `${title} ${description} ${textContent}`.substring(0, 2000);

    const tags = this.extractTags(url, allText);
    const summary = this.generateSummary(pageContent, frameworkContent);

    // 基于内容质量计算置信度
    let confidence = 0.5;
    if (frameworkContent && frameworkContent.textContent.length > 500) {
      confidence = 0.7;
    }
    if (tags.length >= 3) {
      confidence += 0.1;
    }

    // 尝试从已有文件夹中匹配一个合适的
    let suggestedFolder: string | undefined;
    if (pageContent.existingFolders && pageContent.existingFolders.length > 0) {
      const allText = `${title} ${description} ${tags.join(' ')}`.toLowerCase();
      let bestScore = 0;
      for (const folder of pageContent.existingFolders) {
        const folderSegments = folder.split('/').filter(Boolean);
        // 跳过顶级文件夹（如 /Bookmarks Bar 本身）
        if (folderSegments.length <= 1) continue;
        let score = 0;
        for (const seg of folderSegments.slice(1)) {
          if (allText.includes(seg.toLowerCase())) {
            score += seg.length;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          suggestedFolder = folder;
        }
      }
    }

    return {
      summary,
      tags: tags.slice(0, 8),
      confidence: Math.min(confidence, 0.9),
      suggestedFolder,
    };
  }

  /**
   * 提取标签
   */
  private extractTags(url: string, text: string): string[] {
    const tags = new Set<string>();

    const techKeywords = [
      'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt',
      'typescript', 'javascript', 'python', 'java', 'go', 'rust', 'cpp',
      'nodejs', 'deno', 'bun',
      'css', 'sass', 'tailwind', 'styled-components',
      'webpack', 'vite', 'rollup', 'esbuild',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp',
      'mongodb', 'postgresql', 'mysql', 'redis',
      'graphql', 'rest', 'api',
      'testing', 'jest', 'vitest', 'cypress',
      'ai', 'machine-learning', 'deep-learning',
    ];

    const typeKeywords = [
      'tutorial', 'guide', 'documentation', 'reference',
      'tool', 'library', 'framework',
      'blog', 'article', 'news',
      'video', 'course',
    ];

    for (const keyword of techKeywords) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (pattern.test(url) || pattern.test(text)) {
        tags.add(keyword);
      }
    }

    for (const keyword of typeKeywords) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (pattern.test(text)) {
        tags.add(keyword);
      }
    }

    const domainMatch = url.match(/\/\/(?:www\.)?(\w+)\./);
    if (domainMatch && domainMatch[1]) {
      const domain = domainMatch[1];
      if (['github', 'gitlab', 'stackoverflow', 'youtube', 'medium', 'dev'].includes(domain)) {
        tags.add(domain);
        // 为特定域名添加类型标签
        if (domain === 'youtube') {
          tags.add('video');
        } else if (domain === 'github' || domain === 'gitlab') {
          tags.add('code');
        }
      }
    }

    return Array.from(tags);
  }

  /**
   * 生成摘要
   */
  private generateSummary(pageContent: PageContent, frameworkContent?: any): string {
    // 优先使用框架内容的摘要
    if (frameworkContent?.excerpt && frameworkContent.excerpt.length > 20) {
      const excerpt = frameworkContent.excerpt.length > 150
        ? frameworkContent.excerpt.substring(0, 150) + '...'
        : frameworkContent.excerpt;
      return excerpt;
    }

    // 降级使用 pageContent
    if (pageContent.description && pageContent.description.length > 20) {
      const desc = pageContent.description.length > 150
        ? pageContent.description.substring(0, 150) + '...'
        : pageContent.description;
      return desc;
    }

    if (pageContent.bodyText && pageContent.bodyText.length > 30) {
      const firstSentence = pageContent.bodyText
        .split(/[。.!！?？\n]/)
        .find(s => s.trim().length > 20);

      if (firstSentence) {
        const summary = firstSentence.trim();
        return summary.length > 150 ? summary.substring(0, 150) + '...' : summary;
      }
    }

    try {
      const hostname = new URL(pageContent.url).hostname.replace('www.', '');
      return `${pageContent.title} - ${hostname}`;
    } catch {
      return pageContent.title;
    }
  }

  /**
   * 获取后备分析结果
   */
  private getFallbackAnalysis(pageContent: PageContent): IAIAnalysis {
    const url = pageContent.url.toLowerCase();
    const title = pageContent.title.toLowerCase();

    const tags: string[] = [];

    // 检测常见网站
    if (url.includes('github.com')) {
      tags.push('github', 'code');
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      tags.push('youtube', 'video');
    } else if (url.includes('stackoverflow.com')) {
      tags.push('stackoverflow', 'qa');
    } else if (url.includes('docs') || title.includes('documentation')) {
      tags.push('docs');
    } else if (title.includes('tutorial') || title.includes('guide')) {
      tags.push('tutorial');
    }

    // 检测技术关键词
    const keywords = ['react', 'vue', 'angular', 'typescript', 'javascript', 'python', 'java', 'css', 'html'];
    keywords.forEach((keyword) => {
      if (title.includes(keyword) || url.includes(keyword)) {
        tags.push(keyword);
      }
    });

    let summary = pageContent.title;
    if (pageContent.description && pageContent.description.length > 20) {
      summary = pageContent.description.length > 100
        ? pageContent.description.substring(0, 100) + '...'
        : pageContent.description;
    } else {
      try {
        const hostname = new URL(pageContent.url).hostname.replace('www.', '');
        summary = `${pageContent.title} - ${hostname}`;
      } catch {
        summary = pageContent.title;
      }
    }

    return {
      summary,
      tags: tags.slice(0, 8),
      confidence: 0.5,
    };
  }

  /**
   * 批量分析书签
   */
  async batchAnalyze(bookmarks: IBookmark[], progressCallback?: (progress: number) => void): Promise<Map<string, IAIAnalysis>> {
    const results = new Map<string, IAIAnalysis>();
    const total = bookmarks.length;

    for (let i = 0; i < total; i++) {
      const bookmark = bookmarks[i];

      try {
        const pageContent: PageContent = {
          url: bookmark.url,
          title: bookmark.title,
          description: bookmark.aiSummary,
        };

        const analysis = await this.analyzeBookmark(pageContent);
        results.set(bookmark.id, analysis);

        if (progressCallback) {
          progressCallback((i + 1) / total);
        }

        await this.delay(1000);
      } catch (error) {
        console.error(`[AI] Failed to analyze bookmark ${bookmark.id}:`, error);
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出工厂函数
export function createAIAnalyzer(config: AIConfig): AIAnalyzer {
  return new AIAnalyzer(config);
}

// 默认实例
let defaultAnalyzer: AIAnalyzer | null = null;

interface StoredAIConfig {
  provider?: 'claude' | 'openai' | 'kimi' | 'local' | 'proxy';
  apiKey?: string;
  apiKeys?: string[];
  endpoint?: string;
}

/**
 * 获取默认 AI 分析器
 * 优先使用新的 aiConfig 配置，兼容旧的 userApiKey 配置
 */
export async function getDefaultAnalyzer(): Promise<AIAnalyzer> {
  try {
    // 优先读取新的 aiConfig（包含 Ollama 等所有 provider）
    const newConfigResult = await chrome.storage.local.get(['aiConfig']);
    const aiConfig = newConfigResult.aiConfig as any;

    if (aiConfig && aiConfig.provider) {
      console.log('[AI] Using new aiConfig:', aiConfig.provider);

      const config: AIConfig = {
        provider: aiConfig.provider as AIConfig['provider'],
        apiKeys: aiConfig.apiKeys || [],
        apiKey: aiConfig.apiKeys?.[0] || aiConfig.apiKey,
        endpoint: aiConfig.endpoint || aiConfig.apiUrl,
        apiUrl: aiConfig.apiUrl,
        modelId: aiConfig.modelId || aiConfig.model,
      };

      // Ollama 本地不需要 API Key
      if (aiConfig.provider === 'ollama') {
        config.apiKey = undefined;
        config.apiKeys = [];
      }

      defaultAnalyzer = new AIAnalyzer(config);
      return defaultAnalyzer;
    }

    // 回退到旧的 userApiKey 配置（兼容性）
    const oldConfigResult = await chrome.storage.local.get(['userApiKey', 'userApiUrl', 'userModelId']);
    const userApiKey = oldConfigResult.userApiKey;
    const userApiUrl = oldConfigResult.userApiUrl;
    const userModelId = oldConfigResult.userModelId;

    if (userApiKey) {
      console.log('[AI] Using legacy userApiKey config');
      const config: AIConfig = {
        provider: 'custom',
        apiKeys: [userApiKey],
        apiUrl: userApiUrl,
        modelId: userModelId || 'gpt-3.5-turbo',
      };
      defaultAnalyzer = new AIAnalyzer(config);
      return defaultAnalyzer;
    }

    // 没有配置，使用本地分析
    console.log('[AI] No API config found, using local analysis');
    const config: AIConfig = {
      provider: 'local',
    };
    defaultAnalyzer = new AIAnalyzer(config);
    return defaultAnalyzer;
  } catch (error) {
    console.error('[AI] Failed to load config from storage:', error);
    const config: AIConfig = {
      provider: 'local',
    };
    defaultAnalyzer = new AIAnalyzer(config);
    return defaultAnalyzer;
  }
}

/**
 * 同步版本
 */
export function getDefaultAnalyzerSync(): AIAnalyzer {
  if (!defaultAnalyzer) {
    console.warn('[AI] No cached analyzer, using local analysis');
    const config: AIConfig = {
      provider: 'local',
    };
    return new AIAnalyzer(config);
  }
  return defaultAnalyzer;
}
