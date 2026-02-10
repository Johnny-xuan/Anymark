/**
 * AI 分析器测试
 * 
 * 运行方式：npx vitest run src/utils/aiAnalyzer.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome API
const mockChrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
  },
};

// @ts-ignore
globalThis.chrome = mockChrome;

// 测试用的 URL 列表
const TEST_URLS = [
  {
    url: 'https://react.dev/learn',
    title: 'Quick Start – React',
    expectedTags: ['react', 'tutorial', 'javascript'],
  },
  {
    url: 'https://github.com/facebook/react',
    title: 'facebook/react: The library for web and native user interfaces',
    expectedTags: ['github', 'react', 'code'],
  },
  {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up',
    expectedTags: ['video', 'youtube'],
  },
  {
    url: 'https://stackoverflow.com/questions/tagged/typescript',
    title: 'Newest typescript Questions - Stack Overflow',
    expectedTags: ['stackoverflow', 'typescript', 'qa'],
  },
  {
    url: 'https://docs.python.org/3/tutorial/index.html',
    title: 'The Python Tutorial — Python 3.12 documentation',
    expectedTags: ['python', 'docs', 'tutorial'],
  },
];

describe('AI Analyzer - Local Analysis', () => {
  beforeEach(() => {
    // 配置为本地分析模式
    mockChrome.storage.local.get.mockResolvedValue({
      aiConfig: { provider: 'local' },
    });
  });

  it('should analyze React documentation', async () => {
    const { AIAnalyzer } = await import('./aiAnalyzer');
    const analyzer = new AIAnalyzer({ provider: 'local' });

    const result = await analyzer.analyzeBookmark({
      url: 'https://react.dev/learn',
      title: 'Quick Start – React',
      description: 'Learn React step by step with interactive examples',
    });

    console.log('React analysis result:', result);

    expect(result.summary).toBeTruthy();
    expect(result.tags).toBeInstanceOf(Array);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should analyze GitHub repository', async () => {
    const { AIAnalyzer } = await import('./aiAnalyzer');
    const analyzer = new AIAnalyzer({ provider: 'local' });

    const result = await analyzer.analyzeBookmark({
      url: 'https://github.com/facebook/react',
      title: 'facebook/react: The library for web and native user interfaces',
      description: 'React is a JavaScript library for building user interfaces',
    });

    console.log('GitHub analysis result:', result);

    expect(result.summary).toBeTruthy();
    expect(result.tags).toContain('github');
  });

  it('should analyze YouTube video', async () => {
    const { AIAnalyzer } = await import('./aiAnalyzer');
    const analyzer = new AIAnalyzer({ provider: 'local' });

    const result = await analyzer.analyzeBookmark({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
    });

    console.log('YouTube analysis result:', result);

    expect(result.tags).toContain('video');
  });

  it('should analyze Stack Overflow question', async () => {
    const { AIAnalyzer } = await import('./aiAnalyzer');
    const analyzer = new AIAnalyzer({ provider: 'local' });

    const result = await analyzer.analyzeBookmark({
      url: 'https://stackoverflow.com/questions/tagged/typescript',
      title: 'Newest typescript Questions - Stack Overflow',
    });

    console.log('StackOverflow analysis result:', result);

    expect(result.tags).toContain('stackoverflow');
  });

  it('should analyze Python documentation', async () => {
    const { AIAnalyzer } = await import('./aiAnalyzer');
    const analyzer = new AIAnalyzer({ provider: 'local' });

    const result = await analyzer.analyzeBookmark({
      url: 'https://docs.python.org/3/tutorial/index.html',
      title: 'The Python Tutorial — Python 3.12 documentation',
      description: 'Python is an easy to learn, powerful programming language',
    });

    console.log('Python docs analysis result:', result);

    expect(result.tags).toContain('python');
  });

  it('should handle all test URLs', async () => {
    const { AIAnalyzer } = await import('./aiAnalyzer');
    const analyzer = new AIAnalyzer({ provider: 'local' });

    console.log('\n========== 批量测试结果 ==========\n');

    for (const testCase of TEST_URLS) {
      const result = await analyzer.analyzeBookmark({
        url: testCase.url,
        title: testCase.title,
      });

      console.log(`📌 ${testCase.title}`);
      console.log(`   URL: ${testCase.url}`);
      console.log(`   Summary: ${result.summary}`);
      console.log(`   Tags: [${result.tags.join(', ')}]`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      console.log('');

      expect(result.summary).toBeTruthy();
      expect(result.tags.length).toBeGreaterThan(0);
    }
  });
});

describe('AI Analyzer - Fallback Analysis', () => {
  it('should provide fallback when AI fails', async () => {
    const { AIAnalyzer } = await import('./aiAnalyzer');
    const analyzer = new AIAnalyzer({ provider: 'local' });

    // 测试一个没有任何信息的 URL
    const result = await analyzer.analyzeBookmark({
      url: 'https://example.com/some-random-page',
      title: 'Some Random Page',
    });

    console.log('Fallback analysis result:', result);

    expect(result.summary).toBeTruthy();
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });
});
