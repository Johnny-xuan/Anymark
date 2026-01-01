/**
 * 搜索工具测试
 * 测试 web_search, github_search, extract_content 工具
 * 包含 Property 9-12 属性测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  webSearchTool,
  githubSearchTool,
  extractContentTool,
  searchTools,
} from './searchTools';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock chrome.storage
const mockStorage: Record<string, any> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) => {
        const result: Record<string, any> = {};
        keys.forEach(key => {
          if (mockStorage[key]) {
            result[key] = mockStorage[key];
          }
        });
        return Promise.resolve(result);
      }),
    },
  },
});

describe('Search Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('webSearchTool', () => {
    it('should be properly defined', () => {
      expect(webSearchTool.name).toBe('web_search');
      expect(webSearchTool.description).toBeTruthy();
      expect(webSearchTool.parameters).toBeDefined();
      expect(webSearchTool.parameters.required).toContain('query');
    });

    it('should return error when query is empty', async () => {
      const result = await webSearchTool.execute({ query: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('关键词');
    });

    it('should return fallback search URLs when search fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await webSearchTool.execute({ query: 'test query' });

      expect(result.success).toBe(true);
      expect(result.data.searchUrls).toBeDefined();
      // URL encoding uses %20 for spaces, not +
      expect(result.data.searchUrls.google).toContain('test%20query');
      expect(result.data.searchUrls.duckduckgo).toContain('test%20query');
    });

    it('should use Whoogle when configured', async () => {
      mockStorage.searchConfig = { whoogleUrl: 'https://whoogle.example.com' };

      // Mock successful Whoogle response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`
          <a href="https://example.com/result1">Result 1</a>
          <p>This is the first result snippet</p>
        `),
      });

      const result = await webSearchTool.execute({ query: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('whoogle.example.com'),
        expect.any(Object)
      );
    });

    it('should fallback to DuckDuckGo when Whoogle fails', async () => {
      mockStorage.searchConfig = { whoogleUrl: 'https://whoogle.example.com' };

      // Whoogle fails
      mockFetch.mockRejectedValueOnce(new Error('Whoogle error'));

      // DuckDuckGo succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`
          <a class="result__a" href="https://example.com">Test Result</a>
          <a class="result__snippet">Test snippet</a>
        `),
      });

      const result = await webSearchTool.execute({ query: 'test' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('githubSearchTool', () => {
    it('should be properly defined', () => {
      expect(githubSearchTool.name).toBe('github_search');
      expect(githubSearchTool.description).toBeTruthy();
      expect(githubSearchTool.parameters).toBeDefined();
      expect(githubSearchTool.parameters.required).toContain('query');
    });

    it('should return error when query is empty', async () => {
      const result = await githubSearchTool.execute({ query: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('关键词');
    });

    it('should search GitHub repositories successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        json: () => Promise.resolve({
          total_count: 100,
          items: [
            {
              name: 'test-repo',
              full_name: 'user/test-repo',
              description: 'A test repository',
              html_url: 'https://github.com/user/test-repo',
              stargazers_count: 1000,
              language: 'TypeScript',
              updated_at: '2024-01-01T00:00:00Z',
              topics: ['testing', 'typescript'],
            },
          ],
        }),
      });

      const result = await githubSearchTool.execute({ query: 'test' });

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].name).toBe('test-repo');
      expect(result.data.results[0].stars).toBe(1000);
      expect(result.data.results[0].language).toBe('TypeScript');
    });

    it('should include language filter in query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        json: () => Promise.resolve({ total_count: 0, items: [] }),
      });

      await githubSearchTool.execute({
        query: 'react',
        language: 'TypeScript',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('language%3ATypeScript'),
        expect.any(Object)
      );
    });

    it('should handle rate limit error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Map([
          ['X-RateLimit-Remaining', '0'],
          ['X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 3600)],
        ]),
      });

      const result = await githubSearchTool.execute({ query: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('请求次数已达上限');
    });

    it('should use GitHub token when configured', async () => {
      mockStorage.searchConfig = { githubToken: 'test-token' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        json: () => Promise.resolve({ total_count: 0, items: [] }),
      });

      await githubSearchTool.execute({ query: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token test-token',
          }),
        })
      );
    });
  });

  describe('extractContentTool', () => {
    it('should be properly defined', () => {
      expect(extractContentTool.name).toBe('extract_content');
      expect(extractContentTool.description).toBeTruthy();
      expect(extractContentTool.parameters).toBeDefined();
      expect(extractContentTool.parameters.required).toContain('url');
    });

    it('should return error for invalid URL', async () => {
      const result = await extractContentTool.execute({ url: 'not-a-url' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('URL');
    });

    it('should extract content from HTML', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Test Page Title</title>
            <meta name="description" content="This is a test description">
            <meta name="keywords" content="test, page, keywords">
            <meta property="og:image" content="https://example.com/image.jpg">
          </head>
          <body>
            <h1>Main Heading</h1>
            <p>This is the first paragraph with some content.</p>
          </body>
          </html>
        `),
      });

      const result = await extractContentTool.execute({
        url: 'https://example.com/test',
      });

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Test Page Title');
      expect(result.data.summary).toContain('test description');
      expect(result.data.keywords).toContain('test');
      expect(result.data.ogImage).toBe('https://example.com/image.jpg');
    });

    it('should fallback when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await extractContentTool.execute({
        url: 'https://example.com/test-page',
      });

      expect(result.success).toBe(true);
      expect(result.data.extractionMethod).toBe('error-fallback');
      expect(result.data.title).toBeTruthy();
    });

    it('should fallback when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await extractContentTool.execute({
        url: 'https://example.com/not-found',
      });

      expect(result.success).toBe(true);
      expect(result.data.extractionMethod).toBe('fallback');
    });
  });

  describe('searchTools array', () => {
    it('should export all search tools', () => {
      expect(searchTools).toHaveLength(3);
      expect(searchTools.map(t => t.name)).toContain('web_search');
      expect(searchTools.map(t => t.name)).toContain('github_search');
      expect(searchTools.map(t => t.name)).toContain('extract_content');
    });
  });
});

// Property-based tests
describe('Search Tools - Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  });

  /**
   * Property 9: Web Search Fallback
   * For any web search request where the primary search service fails,
   * the Agent SHALL attempt an alternative search method before returning an error.
   */
  it('Property 9: Web Search Fallback - should always provide fallback options', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use alphanumeric strings to avoid edge cases with whitespace-only queries
        fc.stringMatching(/^[a-zA-Z0-9]{1,50}$/),
        async (query) => {
          // Simulate all search services failing
          mockFetch.mockRejectedValue(new Error('All services failed'));

          const result = await webSearchTool.execute({ query });

          // Should still succeed with fallback URLs
          expect(result.success).toBe(true);
          expect(result.data).toBeDefined();

          // Should provide manual search URLs
          if (result.data.searchUrls) {
            expect(result.data.searchUrls.google).toBeTruthy();
            expect(result.data.searchUrls.duckduckgo).toBeTruthy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: Content Extraction Fallback
   * For any URL where content extraction fails,
   * the Agent SHALL use the search snippet as the summary instead of returning empty content.
   */
  it('Property 10: Content Extraction Fallback - should never return empty on failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.webUrl(),
        async (url) => {
          // Simulate extraction failure
          mockFetch.mockRejectedValue(new Error('Extraction failed'));

          const result = await extractContentTool.execute({ url });

          // Should always succeed (with fallback)
          expect(result.success).toBe(true);
          expect(result.data).toBeDefined();

          // Should have a title (at least from URL)
          expect(result.data.title).toBeTruthy();

          // Should indicate fallback method
          expect(result.data.extractionMethod).toMatch(/fallback/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11: GitHub Search Response Format
   * For any successful GitHub search, each result SHALL include
   * repository name, description, stars count, primary language, and last update time.
   */
  it('Property 11: GitHub Search Response Format - results should have required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 30 }),
          stars: fc.integer({ min: 0, max: 1000000 }),
          language: fc.option(fc.constantFrom('JavaScript', 'TypeScript', 'Python', 'Go', 'Rust')),
        }),
        async (repoData) => {
          // Mock successful GitHub response
          mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map(),
            json: () => Promise.resolve({
              total_count: 1,
              items: [
                {
                  name: repoData.name,
                  full_name: `user/${repoData.name}`,
                  description: 'Test description',
                  html_url: `https://github.com/user/${repoData.name}`,
                  stargazers_count: repoData.stars,
                  language: repoData.language,
                  updated_at: '2024-01-01T00:00:00Z',
                  topics: [],
                },
              ],
            }),
          });

          const result = await githubSearchTool.execute({ query: 'test' });

          expect(result.success).toBe(true);
          expect(result.data.results).toHaveLength(1);

          const repo = result.data.results[0];
          // Required fields per Property 11
          expect(repo.name).toBe(repoData.name);
          expect(typeof repo.description).toBe('string');
          expect(repo.stars).toBe(repoData.stars);
          expect(repo.language).toBe(repoData.language);
          expect(repo.updatedAt).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: GitHub Rate Limit Handling
   * For any GitHub API response with status 403 (rate limit),
   * the Agent SHALL return a user-friendly message suggesting to try later.
   */
  it('Property 12: GitHub Rate Limit Handling - should provide friendly error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3600 }), // seconds until reset
        async (secondsUntilReset) => {
          const resetTimestamp = Math.floor(Date.now() / 1000) + secondsUntilReset;

          // Mock rate limit response
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            headers: new Map([
              ['X-RateLimit-Remaining', '0'],
              ['X-RateLimit-Reset', String(resetTimestamp)],
            ]),
          });

          const result = await githubSearchTool.execute({ query: 'test' });

          // Should fail gracefully
          expect(result.success).toBe(false);

          // Should have user-friendly error message
          expect(result.error).toBeTruthy();
          expect(result.error).toMatch(/请求次数|限额|重试|Token/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Search queries should be properly encoded in URLs
   */
  it('Property: Search queries should be URL-safe', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (query) => {
          // All services fail, so we get fallback URLs
          mockFetch.mockRejectedValue(new Error('Failed'));

          const result = await webSearchTool.execute({ query });

          if (result.data?.searchUrls) {
            // URLs should be valid
            Object.values(result.data.searchUrls).forEach((url: string) => {
              expect(() => new URL(url)).not.toThrow();
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: GitHub search should handle various sort options
   */
  it('Property: GitHub search should accept all valid sort options', async () => {
    const sortOptions = ['stars', 'forks', 'updated', 'best-match'] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...sortOptions),
        async (sort) => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map(),
            json: () => Promise.resolve({ total_count: 0, items: [] }),
          });

          const result = await githubSearchTool.execute({
            query: 'test',
            sort,
          });

          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});
