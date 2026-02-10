/**
 * MockFixtures - 测试数据 Fixtures
 * 
 * 预定义的测试数据集，用于不同测试场景
 */

import type { MockFixture, MockBookmarkData, MockFolderData } from './types';

// ============ 文件夹数据 ============

const DEFAULT_FOLDERS: MockFolderData[] = [
  // 开发相关
  { chromeId: '100', title: 'Development', parentId: '1', index: 0 },
  { chromeId: '101', title: 'Frontend', parentId: '100', index: 0 },
  { chromeId: '102', title: 'Backend', parentId: '100', index: 1 },
  { chromeId: '103', title: 'DevOps', parentId: '100', index: 2 },
  { chromeId: '104', title: 'React', parentId: '101', index: 0 },
  { chromeId: '105', title: 'Vue', parentId: '101', index: 1 },
  
  // 学习资源
  { chromeId: '200', title: 'Learning', parentId: '1', index: 1 },
  { chromeId: '201', title: 'Tutorials', parentId: '200', index: 0 },
  { chromeId: '202', title: 'Documentation', parentId: '200', index: 1 },
  { chromeId: '203', title: 'Courses', parentId: '200', index: 2 },
  
  // 工具
  { chromeId: '300', title: 'Tools', parentId: '1', index: 2 },
  { chromeId: '301', title: 'Design', parentId: '300', index: 0 },
  { chromeId: '302', title: 'Productivity', parentId: '300', index: 1 },
  
  // 其他书签下的文件夹
  { chromeId: '400', title: 'Archive', parentId: '2', index: 0 },
  { chromeId: '401', title: 'Reading List', parentId: '2', index: 1 },
];

// ============ 书签数据 ============

const DEFAULT_BOOKMARKS: MockBookmarkData[] = [
  // Frontend - React
  {
    chromeId: 'bm-001',
    title: 'React Documentation',
    url: 'https://react.dev',
    parentId: '104',
    aiSummary: 'React 官方文档，包含教程、API 参考和最佳实践',
    aiTags: ['react', 'frontend', 'documentation', 'javascript'],
    aiTechStack: ['React', 'JavaScript', 'JSX'],
    starred: true,
    analytics: { visitCount: 150, importance: 95 },
  },
  {
    chromeId: 'bm-002',
    title: 'React Hooks Guide',
    url: 'https://react.dev/reference/react',
    parentId: '104',
    aiSummary: 'React Hooks 完整指南，包含 useState、useEffect 等',
    aiTags: ['react', 'hooks', 'tutorial'],
    aiTechStack: ['React'],
    starred: true,
    analytics: { visitCount: 80, importance: 85 },
  },
  {
    chromeId: 'bm-003',
    title: 'React Router',
    url: 'https://reactrouter.com',
    parentId: '104',
    aiSummary: 'React 路由库官方文档',
    aiTags: ['react', 'router', 'navigation'],
    aiTechStack: ['React', 'React Router'],
    analytics: { visitCount: 45, importance: 70 },
  },
  
  // Frontend - Vue
  {
    chromeId: 'bm-004',
    title: 'Vue.js Guide',
    url: 'https://vuejs.org/guide',
    parentId: '105',
    aiSummary: 'Vue.js 渐进式框架官方指南',
    aiTags: ['vue', 'frontend', 'framework'],
    aiTechStack: ['Vue', 'JavaScript'],
    starred: false,
    analytics: { visitCount: 60, importance: 80 },
  },
  {
    chromeId: 'bm-005',
    title: 'Vuex State Management',
    url: 'https://vuex.vuejs.org',
    parentId: '105',
    aiSummary: 'Vue 状态管理库',
    aiTags: ['vue', 'state-management', 'vuex'],
    aiTechStack: ['Vue', 'Vuex'],
    analytics: { visitCount: 30, importance: 65 },
  },
  
  // Frontend - General
  {
    chromeId: 'bm-006',
    title: 'TypeScript Handbook',
    url: 'https://www.typescriptlang.org/docs/handbook',
    parentId: '101',
    aiSummary: 'TypeScript 官方手册，类型系统完整指南',
    aiTags: ['typescript', 'javascript', 'types'],
    aiTechStack: ['TypeScript'],
    starred: true,
    analytics: { visitCount: 120, importance: 90 },
  },
  {
    chromeId: 'bm-007',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    parentId: '101',
    aiSummary: 'Mozilla 开发者网络，Web 技术权威参考',
    aiTags: ['web', 'html', 'css', 'javascript', 'reference'],
    aiTechStack: ['HTML', 'CSS', 'JavaScript'],
    starred: true,
    analytics: { visitCount: 200, importance: 98 },
  },
  {
    chromeId: 'bm-008',
    title: 'CSS Tricks',
    url: 'https://css-tricks.com',
    parentId: '101',
    aiSummary: 'CSS 技巧和教程网站',
    aiTags: ['css', 'frontend', 'design'],
    aiTechStack: ['CSS'],
    analytics: { visitCount: 55, importance: 70 },
  },
  
  // Backend
  {
    chromeId: 'bm-009',
    title: 'Node.js Documentation',
    url: 'https://nodejs.org/docs',
    parentId: '102',
    aiSummary: 'Node.js 官方文档',
    aiTags: ['nodejs', 'backend', 'javascript'],
    aiTechStack: ['Node.js', 'JavaScript'],
    starred: true,
    analytics: { visitCount: 90, importance: 85 },
  },
  {
    chromeId: 'bm-010',
    title: 'Express.js Guide',
    url: 'https://expressjs.com',
    parentId: '102',
    aiSummary: 'Express.js Web 框架指南',
    aiTags: ['express', 'nodejs', 'backend', 'api'],
    aiTechStack: ['Express', 'Node.js'],
    analytics: { visitCount: 70, importance: 75 },
  },
  {
    chromeId: 'bm-011',
    title: 'PostgreSQL Documentation',
    url: 'https://www.postgresql.org/docs',
    parentId: '102',
    aiSummary: 'PostgreSQL 数据库官方文档',
    aiTags: ['postgresql', 'database', 'sql'],
    aiTechStack: ['PostgreSQL', 'SQL'],
    analytics: { visitCount: 40, importance: 70 },
  },
  {
    chromeId: 'bm-012',
    title: 'MongoDB Manual',
    url: 'https://docs.mongodb.com/manual',
    parentId: '102',
    aiSummary: 'MongoDB NoSQL 数据库手册',
    aiTags: ['mongodb', 'database', 'nosql'],
    aiTechStack: ['MongoDB'],
    analytics: { visitCount: 35, importance: 65 },
  },
  
  // DevOps
  {
    chromeId: 'bm-013',
    title: 'Docker Documentation',
    url: 'https://docs.docker.com',
    parentId: '103',
    aiSummary: 'Docker 容器化平台官方文档',
    aiTags: ['docker', 'containers', 'devops'],
    aiTechStack: ['Docker'],
    starred: true,
    analytics: { visitCount: 85, importance: 88 },
  },
  {
    chromeId: 'bm-014',
    title: 'Kubernetes Documentation',
    url: 'https://kubernetes.io/docs',
    parentId: '103',
    aiSummary: 'Kubernetes 容器编排平台文档',
    aiTags: ['kubernetes', 'k8s', 'devops', 'orchestration'],
    aiTechStack: ['Kubernetes'],
    analytics: { visitCount: 50, importance: 80 },
  },
  {
    chromeId: 'bm-015',
    title: 'GitHub Actions',
    url: 'https://docs.github.com/actions',
    parentId: '103',
    aiSummary: 'GitHub Actions CI/CD 文档',
    aiTags: ['github', 'ci-cd', 'automation'],
    aiTechStack: ['GitHub Actions'],
    analytics: { visitCount: 65, importance: 75 },
  },
  
  // Learning - Tutorials
  {
    chromeId: 'bm-016',
    title: 'freeCodeCamp',
    url: 'https://www.freecodecamp.org',
    parentId: '201',
    aiSummary: '免费编程学习平台，包含完整课程',
    aiTags: ['learning', 'programming', 'free', 'courses'],
    userTags: ['beginner-friendly'],
    analytics: { visitCount: 100, importance: 85 },
  },
  {
    chromeId: 'bm-017',
    title: 'Codecademy',
    url: 'https://www.codecademy.com',
    parentId: '201',
    aiSummary: '交互式编程学习平台',
    aiTags: ['learning', 'interactive', 'programming'],
    analytics: { visitCount: 45, importance: 70 },
  },
  {
    chromeId: 'bm-018',
    title: 'LeetCode',
    url: 'https://leetcode.com',
    parentId: '201',
    aiSummary: '算法和数据结构练习平台',
    aiTags: ['algorithms', 'interview', 'practice'],
    starred: true,
    analytics: { visitCount: 180, importance: 92 },
  },
  
  // Learning - Documentation
  {
    chromeId: 'bm-019',
    title: 'DevDocs',
    url: 'https://devdocs.io',
    parentId: '202',
    aiSummary: '聚合多种技术文档的快速查阅工具',
    aiTags: ['documentation', 'reference', 'api'],
    starred: true,
    analytics: { visitCount: 150, importance: 90 },
  },
  {
    chromeId: 'bm-020',
    title: 'Can I Use',
    url: 'https://caniuse.com',
    parentId: '202',
    aiSummary: '浏览器兼容性查询工具',
    aiTags: ['browser', 'compatibility', 'web'],
    analytics: { visitCount: 80, importance: 78 },
  },
  
  // Learning - Courses
  {
    chromeId: 'bm-021',
    title: 'Udemy',
    url: 'https://www.udemy.com',
    parentId: '203',
    aiSummary: '在线课程平台',
    aiTags: ['courses', 'learning', 'video'],
    analytics: { visitCount: 60, importance: 65 },
  },
  {
    chromeId: 'bm-022',
    title: 'Coursera',
    url: 'https://www.coursera.org',
    parentId: '203',
    aiSummary: '大学课程在线学习平台',
    aiTags: ['courses', 'university', 'certificates'],
    analytics: { visitCount: 40, importance: 70 },
  },
  
  // Tools - Design
  {
    chromeId: 'bm-023',
    title: 'Figma',
    url: 'https://www.figma.com',
    parentId: '301',
    aiSummary: '协作设计工具',
    aiTags: ['design', 'ui', 'collaboration'],
    starred: true,
    analytics: { visitCount: 200, importance: 95 },
  },
  {
    chromeId: 'bm-024',
    title: 'Dribbble',
    url: 'https://dribbble.com',
    parentId: '301',
    aiSummary: '设计师作品展示平台',
    aiTags: ['design', 'inspiration', 'portfolio'],
    analytics: { visitCount: 70, importance: 60 },
  },
  {
    chromeId: 'bm-025',
    title: 'Coolors',
    url: 'https://coolors.co',
    parentId: '301',
    aiSummary: '配色方案生成器',
    aiTags: ['colors', 'design', 'palette'],
    analytics: { visitCount: 45, importance: 55 },
  },
  
  // Tools - Productivity
  {
    chromeId: 'bm-026',
    title: 'Notion',
    url: 'https://www.notion.so',
    parentId: '302',
    aiSummary: '全能笔记和项目管理工具',
    aiTags: ['notes', 'productivity', 'collaboration'],
    starred: true,
    analytics: { visitCount: 250, importance: 95 },
  },
  {
    chromeId: 'bm-027',
    title: 'Linear',
    url: 'https://linear.app',
    parentId: '302',
    aiSummary: '现代项目管理工具',
    aiTags: ['project-management', 'issues', 'agile'],
    analytics: { visitCount: 90, importance: 80 },
  },
  {
    chromeId: 'bm-028',
    title: 'Raycast',
    url: 'https://www.raycast.com',
    parentId: '302',
    aiSummary: 'Mac 效率启动器',
    aiTags: ['mac', 'productivity', 'launcher'],
    starred: true,
    analytics: { visitCount: 120, importance: 85 },
  },
  
  // Development - General
  {
    chromeId: 'bm-029',
    title: 'GitHub',
    url: 'https://github.com',
    parentId: '100',
    aiSummary: '代码托管和协作平台',
    aiTags: ['git', 'code', 'collaboration', 'open-source'],
    starred: true,
    analytics: { visitCount: 500, importance: 99 },
  },
  {
    chromeId: 'bm-030',
    title: 'Stack Overflow',
    url: 'https://stackoverflow.com',
    parentId: '100',
    aiSummary: '程序员问答社区',
    aiTags: ['qa', 'programming', 'community'],
    starred: true,
    analytics: { visitCount: 300, importance: 95 },
  },
  {
    chromeId: 'bm-031',
    title: 'npm',
    url: 'https://www.npmjs.com',
    parentId: '100',
    aiSummary: 'Node.js 包管理器',
    aiTags: ['npm', 'packages', 'nodejs'],
    aiTechStack: ['npm', 'Node.js'],
    analytics: { visitCount: 180, importance: 88 },
  },
  
  // Archive (其他书签)
  {
    chromeId: 'bm-032',
    title: 'Old Project Docs',
    url: 'https://example.com/old-project',
    parentId: '400',
    aiSummary: '旧项目文档',
    aiTags: ['archive', 'old'],
    status: 'archived',
    analytics: { visitCount: 5, importance: 20 },
  },
  
  // Reading List
  {
    chromeId: 'bm-033',
    title: 'Clean Code Summary',
    url: 'https://example.com/clean-code',
    parentId: '401',
    aiSummary: '代码整洁之道读书笔记',
    aiTags: ['book', 'clean-code', 'best-practices'],
    userTags: ['to-read'],
    analytics: { visitCount: 10, importance: 60 },
  },
  {
    chromeId: 'bm-034',
    title: 'System Design Primer',
    url: 'https://github.com/donnemartin/system-design-primer',
    parentId: '401',
    aiSummary: '系统设计入门指南',
    aiTags: ['system-design', 'interview', 'architecture'],
    starred: true,
    analytics: { visitCount: 75, importance: 85 },
  },
  
  // 更多书签以达到 50+
  {
    chromeId: 'bm-035',
    title: 'Tailwind CSS',
    url: 'https://tailwindcss.com',
    parentId: '101',
    aiSummary: 'Utility-first CSS 框架',
    aiTags: ['css', 'tailwind', 'utility'],
    aiTechStack: ['Tailwind CSS'],
    starred: true,
    analytics: { visitCount: 140, importance: 88 },
  },
  {
    chromeId: 'bm-036',
    title: 'Vite',
    url: 'https://vitejs.dev',
    parentId: '101',
    aiSummary: '下一代前端构建工具',
    aiTags: ['build-tool', 'frontend', 'fast'],
    aiTechStack: ['Vite'],
    analytics: { visitCount: 95, importance: 82 },
  },
  {
    chromeId: 'bm-037',
    title: 'Prisma',
    url: 'https://www.prisma.io',
    parentId: '102',
    aiSummary: 'Node.js ORM 工具',
    aiTags: ['orm', 'database', 'typescript'],
    aiTechStack: ['Prisma', 'TypeScript'],
    analytics: { visitCount: 55, importance: 75 },
  },
  {
    chromeId: 'bm-038',
    title: 'Redis Documentation',
    url: 'https://redis.io/docs',
    parentId: '102',
    aiSummary: 'Redis 内存数据库文档',
    aiTags: ['redis', 'cache', 'database'],
    aiTechStack: ['Redis'],
    analytics: { visitCount: 40, importance: 70 },
  },
  {
    chromeId: 'bm-039',
    title: 'AWS Documentation',
    url: 'https://docs.aws.amazon.com',
    parentId: '103',
    aiSummary: 'Amazon Web Services 文档',
    aiTags: ['aws', 'cloud', 'infrastructure'],
    aiTechStack: ['AWS'],
    analytics: { visitCount: 60, importance: 78 },
  },
  {
    chromeId: 'bm-040',
    title: 'Terraform',
    url: 'https://www.terraform.io',
    parentId: '103',
    aiSummary: '基础设施即代码工具',
    aiTags: ['iac', 'devops', 'infrastructure'],
    aiTechStack: ['Terraform'],
    analytics: { visitCount: 35, importance: 72 },
  },
  {
    chromeId: 'bm-041',
    title: 'Next.js',
    url: 'https://nextjs.org',
    parentId: '104',
    aiSummary: 'React 全栈框架',
    aiTags: ['nextjs', 'react', 'fullstack'],
    aiTechStack: ['Next.js', 'React'],
    starred: true,
    analytics: { visitCount: 110, importance: 90 },
  },
  {
    chromeId: 'bm-042',
    title: 'Zustand',
    url: 'https://zustand-demo.pmnd.rs',
    parentId: '104',
    aiSummary: '轻量级 React 状态管理',
    aiTags: ['react', 'state-management', 'zustand'],
    aiTechStack: ['Zustand', 'React'],
    analytics: { visitCount: 45, importance: 68 },
  },
  {
    chromeId: 'bm-043',
    title: 'Nuxt',
    url: 'https://nuxt.com',
    parentId: '105',
    aiSummary: 'Vue 全栈框架',
    aiTags: ['nuxt', 'vue', 'fullstack'],
    aiTechStack: ['Nuxt', 'Vue'],
    analytics: { visitCount: 30, importance: 72 },
  },
  {
    chromeId: 'bm-044',
    title: 'Pinia',
    url: 'https://pinia.vuejs.org',
    parentId: '105',
    aiSummary: 'Vue 官方状态管理库',
    aiTags: ['vue', 'state-management', 'pinia'],
    aiTechStack: ['Pinia', 'Vue'],
    analytics: { visitCount: 25, importance: 65 },
  },
  {
    chromeId: 'bm-045',
    title: 'Hacker News',
    url: 'https://news.ycombinator.com',
    parentId: '1',
    aiSummary: '技术新闻聚合',
    aiTags: ['news', 'tech', 'community'],
    analytics: { visitCount: 200, importance: 75 },
  },
  {
    chromeId: 'bm-046',
    title: 'Dev.to',
    url: 'https://dev.to',
    parentId: '1',
    aiSummary: '开发者社区博客平台',
    aiTags: ['blog', 'community', 'articles'],
    analytics: { visitCount: 80, importance: 65 },
  },
  {
    chromeId: 'bm-047',
    title: 'Medium',
    url: 'https://medium.com',
    parentId: '401',
    aiSummary: '博客和文章平台',
    aiTags: ['blog', 'articles', 'reading'],
    analytics: { visitCount: 90, importance: 60 },
  },
  {
    chromeId: 'bm-048',
    title: 'Excalidraw',
    url: 'https://excalidraw.com',
    parentId: '301',
    aiSummary: '手绘风格白板工具',
    aiTags: ['whiteboard', 'drawing', 'collaboration'],
    starred: true,
    analytics: { visitCount: 85, importance: 78 },
  },
  {
    chromeId: 'bm-049',
    title: 'Vercel',
    url: 'https://vercel.com',
    parentId: '103',
    aiSummary: '前端部署平台',
    aiTags: ['deployment', 'hosting', 'frontend'],
    aiTechStack: ['Vercel'],
    starred: true,
    analytics: { visitCount: 100, importance: 85 },
  },
  {
    chromeId: 'bm-050',
    title: 'Netlify',
    url: 'https://www.netlify.com',
    parentId: '103',
    aiSummary: '静态网站托管平台',
    aiTags: ['deployment', 'hosting', 'jamstack'],
    aiTechStack: ['Netlify'],
    analytics: { visitCount: 55, importance: 72 },
  },
  {
    chromeId: 'bm-051',
    title: 'Supabase',
    url: 'https://supabase.com',
    parentId: '102',
    aiSummary: 'Firebase 开源替代品',
    aiTags: ['backend', 'database', 'auth'],
    aiTechStack: ['Supabase', 'PostgreSQL'],
    analytics: { visitCount: 45, importance: 75 },
  },
  {
    chromeId: 'bm-052',
    title: 'Playwright',
    url: 'https://playwright.dev',
    parentId: '100',
    aiSummary: '端到端测试框架',
    aiTags: ['testing', 'e2e', 'automation'],
    aiTechStack: ['Playwright'],
    analytics: { visitCount: 35, importance: 70 },
  },
];

// ============ Fixtures ============

/**
 * 默认测试数据
 */
export const DEFAULT_FIXTURE: MockFixture = {
  name: 'default',
  description: '默认测试数据，包含 50+ 书签和 15+ 文件夹',
  bookmarks: DEFAULT_BOOKMARKS,
  folders: DEFAULT_FOLDERS,
};

/**
 * 空数据
 */
export const EMPTY_FIXTURE: MockFixture = {
  name: 'empty',
  description: '空数据，只有顶级文件夹',
  bookmarks: [],
  folders: [],
};

/**
 * 边界情况数据
 */
export const EDGE_CASE_FIXTURE: MockFixture = {
  name: 'edge-case',
  description: '边界情况测试数据',
  bookmarks: [
    {
      chromeId: 'edge-001',
      title: '特殊字符测试 <script>alert("xss")</script>',
      url: 'https://example.com/special?q=test&foo=bar#hash',
      parentId: '1',
      aiTags: ['test', 'special-chars'],
    },
    {
      chromeId: 'edge-002',
      title: '非常长的标题'.repeat(20),
      url: 'https://example.com/long-title',
      parentId: '1',
    },
    {
      chromeId: 'edge-003',
      title: '中文标题测试 日本語 한국어 العربية',
      url: 'https://example.com/unicode',
      parentId: '1',
      aiTags: ['unicode', 'i18n'],
    },
    {
      chromeId: 'edge-004',
      title: 'Empty URL Test',
      url: '',
      parentId: '1',
    },
    {
      chromeId: 'edge-005',
      title: '',
      url: 'https://example.com/empty-title',
      parentId: '1',
    },
    {
      chromeId: 'edge-006',
      title: 'Deeply Nested',
      url: 'https://example.com/deep',
      parentId: 'edge-folder-5',
    },
  ],
  folders: [
    { chromeId: 'edge-folder-1', title: 'Level 1', parentId: '1' },
    { chromeId: 'edge-folder-2', title: 'Level 2', parentId: 'edge-folder-1' },
    { chromeId: 'edge-folder-3', title: 'Level 3', parentId: 'edge-folder-2' },
    { chromeId: 'edge-folder-4', title: 'Level 4', parentId: 'edge-folder-3' },
    { chromeId: 'edge-folder-5', title: 'Level 5', parentId: 'edge-folder-4' },
    { chromeId: 'edge-folder-special', title: '特殊字符文件夹 <>&"\'', parentId: '1' },
  ],
};

/**
 * 大量数据（性能测试）
 */
export const LARGE_FIXTURE: MockFixture = (() => {
  const bookmarks: MockBookmarkData[] = [];
  const folders: MockFolderData[] = [];
  
  // 创建 100 个文件夹
  for (let i = 0; i < 100; i++) {
    folders.push({
      chromeId: `large-folder-${i}`,
      title: `Folder ${i}`,
      parentId: i < 10 ? '1' : `large-folder-${Math.floor(i / 10)}`,
    });
  }
  
  // 创建 1000 个书签
  for (let i = 0; i < 1000; i++) {
    bookmarks.push({
      chromeId: `large-bm-${i}`,
      title: `Bookmark ${i}`,
      url: `https://example.com/bookmark-${i}`,
      parentId: `large-folder-${i % 100}`,
      aiTags: [`tag-${i % 10}`, `category-${i % 5}`],
      starred: i % 20 === 0,
    });
  }
  
  return {
    name: 'large',
    description: '大量数据，用于性能测试（1000 书签，100 文件夹）',
    bookmarks,
    folders,
  };
})();

/**
 * 获取 fixture by name
 */
export function getFixture(name: string): MockFixture | undefined {
  const fixtures: Record<string, MockFixture> = {
    default: DEFAULT_FIXTURE,
    empty: EMPTY_FIXTURE,
    'edge-case': EDGE_CASE_FIXTURE,
    large: LARGE_FIXTURE,
  };
  return fixtures[name];
}
