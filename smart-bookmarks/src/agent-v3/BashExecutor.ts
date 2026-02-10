/**
 * BashExecutor - Bash 命令执行器
 * 
 * 将书签操作映射为 Unix 文件系统命令
 * 所有命令返回纯文本输出 + 结构化数据
 * 
 * 支持依赖注入：可以注入 IBookmarkStore 用于测试
 */

import type { AgentContext, BashResult, DirectoryItem } from './types';
import { useBookmarkStore } from '../sidebar/store/bookmarkStore';
import type { IBookmarkStore } from './mock/types';
import { PatternMatcher } from './PatternMatcher';

// Chrome 顶级文件夹 ID
const TOP_LEVEL_IDS = ['1', '2', '3'];

// 顶级文件夹别名
const TOP_LEVEL_ALIASES: Record<string, string> = {
  '书签栏': '1',
  '其他书签': '2',
  '移动设备书签': '3',
  'bookmarks bar': '1',
  'other bookmarks': '2',
  'mobile bookmarks': '3',
  'bar': '1',
  'other': '2',
  'mobile': '3',
};

/**
 * BashExecutor 类
 * 
 * @param store - 可选的 IBookmarkStore 实例，用于测试时注入 MockBookmarkStore
 */
export class BashExecutor {
  private _injectedStore: IBookmarkStore | null = null;

  /**
   * 构造函数
   * @param store - 可选的 IBookmarkStore 实例，用于测试
   */
  constructor(store?: IBookmarkStore) {
    if (store) {
      this._injectedStore = store;
    }
  }

  /**
   * 获取 store（支持依赖注入）
   */
  private getStore(): IBookmarkStore {
    if (this._injectedStore) {
      return this._injectedStore;
    }
    return useBookmarkStore.getState() as unknown as IBookmarkStore;
  }
  /**
   * 执行 bash 命令（支持多命令：; 和 &&）
   */
  async execute(command: string, context: AgentContext): Promise<BashResult> {
    const trimmed = command.trim();
    if (!trimmed) {
      return { success: true, output: '', exitCode: 0 };
    }

    // 解析多命令（支持 ; 和 &&）
    const commands = this.splitCommands(trimmed);
    
    // 单命令直接执行
    if (commands.length === 1 && commands[0].operator === 'none') {
      return this.executeSingle(commands[0].cmd, context);
    }

    // 多命令顺序执行
    const outputs: string[] = [];
    let lastResult: BashResult = { success: true, output: '', exitCode: 0 };

    for (const { cmd, operator } of commands) {
      // && 操作符：前一个失败则跳过
      if (operator === '&&' && !lastResult.success) {
        continue;
      }

      lastResult = await this.executeSingle(cmd, context);
      if (lastResult.output) {
        outputs.push(`$ ${cmd}\n${lastResult.output}`);
      }

      // && 操作符：当前失败则停止
      if (operator === '&&' && !lastResult.success) {
        break;
      }
    }

    return {
      success: lastResult.success,
      output: outputs.join('\n\n'),
      exitCode: lastResult.exitCode,
      data: lastResult.data,
    };
  }

  /**
   * 分割多命令（支持 ; 和 &&）
   */
  private splitCommands(input: string): Array<{ cmd: string; operator: 'none' | ';' | '&&' }> {
    const result: Array<{ cmd: string; operator: 'none' | ';' | '&&' }> = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let i = 0;

    while (i < input.length) {
      const char = input[i];
      const nextChar = input[i + 1];

      // 处理引号
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
        current += char;
        i++;
        continue;
      }
      if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
        current += char;
        i++;
        continue;
      }

      // 不在引号内时检查分隔符
      if (!inQuote) {
        // 检查 &&
        if (char === '&' && nextChar === '&') {
          if (current.trim()) {
            result.push({ cmd: current.trim(), operator: '&&' });
          }
          current = '';
          i += 2;
          continue;
        }
        // 检查 ;
        if (char === ';') {
          if (current.trim()) {
            result.push({ cmd: current.trim(), operator: ';' });
          }
          current = '';
          i++;
          continue;
        }
      }

      current += char;
      i++;
    }

    // 最后一个命令
    if (current.trim()) {
      result.push({ cmd: current.trim(), operator: 'none' });
    }

    return result;
  }

  /**
   * 执行单个命令
   */
  private async executeSingle(command: string, context: AgentContext): Promise<BashResult> {
    const { cmd, args } = this.parseCommand(command);

    switch (cmd) {
      case 'ls':
      case 'dir':
        return this.execLs(args, context);
      case 'cd':
        return this.execCd(args, context);
      case 'pwd':
        return this.execPwd(context);
      case 'find':
      case 'search':
        return this.execFind(args, context);
      case 'mv':
      case 'move':
      case 'rename':
        return this.execMv(args, context);
      case 'cp':
      case 'copy':
        return this.execCp(args, context);
      case 'rm':
      case 'del':
        return this.execRm(args, context);
      case 'mkdir':
        return this.execMkdir(args, context);
      case 'cat':
        return this.execCat(args, context);
      case 'stat':
      case 'info':
        return this.execStat(args, context);
      case 'tree':
        return this.execTree(args, context);
      case 'wc':
      case 'count':
        return this.execWc(args, context);
      case 'open':
        return this.execOpen(args, context);
      case 'star':
        return this.execStar(args, context);
      case 'help':
        return this.execHelp(args);
      default:
        return {
          success: false,
          output: `error: command not found: ${cmd}`,
          exitCode: 127,
        };
    }
  }

  /**
   * 解析命令
   */
  private parseCommand(input: string): { cmd: string; args: string[] } {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const argsStr = input.slice(cmd.length).trim();
    const args = this.parseArgs(argsStr);
    return { cmd, args };
  }

  /**
   * 解析参数（支持引号）
   */
  private parseArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const char of argsStr) {
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current) args.push(current);
    return args;
  }

  /**
   * 获取文件夹路径
   */
  private getFolderPath(folderId: string | null): string {
    if (!folderId) return '/';
    const store = this.getStore();
    const folder = store.folders.find(f => f.chromeId === folderId);
    if (!folder) return '/';

    const path: string[] = [folder.title];
    let parentId = folder.parentId;
    while (parentId && parentId !== '0') {
      const parent = store.folders.find(f => f.chromeId === parentId);
      if (parent) {
        path.unshift(parent.title);
        parentId = parent.parentId;
      } else {
        break;
      }
    }
    return '/' + path.join('/');
  }

  /**
   * 获取书签完整路径（包含书签名称）
   */
  private getBookmarkPath(bookmarkId: string): string {
    const store = this.getStore();
    const bookmark = store.bookmarks.find(b => b.chromeId === bookmarkId);
    if (!bookmark) return '/';

    const folderPath = this.getFolderPath(bookmark.parentId);
    return folderPath === '/' ? `/${bookmark.title}` : `${folderPath}/${bookmark.title}`;
  }

  // ============ 命令实现 ============

  /**
   * ls - 列出目录内容（支持通配符过滤 + --id 精确指定文件夹）
   */
  private async execLs(args: string[], context: AgentContext): Promise<BashResult> {
    const store = this.getStore();
    let targetFolderId = context.cwd.folderId;
    let longFormat = false;
    let pattern: string | null = null;

    // 先提取 --id 标志
    const { targetId, remaining } = this.extractIdFlag(args);

    if (targetId) {
      // 按 ID 精确指定文件夹
      const folder = store.folders.find(f => f.chromeId === targetId);
      if (!folder) {
        return { success: false, output: `error: no folder with id: ${targetId}`, exitCode: 1 };
      }
      targetFolderId = folder.chromeId;
    }

    // 解析剩余参数
    for (const arg of remaining) {
      if (arg === '-l' || arg === '--long') {
        longFormat = true;
      } else if (!arg.startsWith('-')) {
        // 检查是否是通配符模式
        if (PatternMatcher.isWildcardPattern(arg)) {
          pattern = arg;
        } else if (!targetId) {
          // 路径参数（仅在没有 --id 时使用）
          const resolved = this.resolvePath(arg, context);
          if (resolved.error) {
            return { success: false, output: resolved.error, exitCode: 1 };
          }
          targetFolderId = resolved.folderId;
        }
      }
    }

    // 获取子文件夹
    let folders = store.folders.filter(f => {
      if (targetFolderId === null) {
        return TOP_LEVEL_IDS.includes(f.chromeId);
      }
      return f.parentId === targetFolderId;
    });

    // 获取书签（根目录没有书签）
    let bookmarks = targetFolderId === null ? [] :
      store.bookmarks.filter(b => b.parentId === targetFolderId);

    // 应用通配符过滤
    if (pattern) {
      const regex = PatternMatcher.globToRegex(pattern);
      folders = folders.filter(f => regex.test(f.title));
      bookmarks = bookmarks.filter(b => regex.test(b.title));

      // 如果没有匹配项，返回空结果（不是错误）
      if (folders.length === 0 && bookmarks.length === 0) {
        const path = this.getFolderPath(targetFolderId);
        return {
          success: true,
          output: `(no matches for pattern: ${pattern})`,
          data: { items: [], count: 0, path, pattern },
          exitCode: 0,
        };
      }
    }

    // 构建输出
    const lines: string[] = [];
    const items: DirectoryItem[] = [];

    for (const f of folders) {
      if (longFormat) {
        lines.push(`d\t${f.title}\t-\t[id:${f.chromeId}]`);
      } else {
        lines.push(`${f.title}/`);
      }
      items.push({ type: 'directory', name: f.title, id: f.chromeId });
    }

    for (const b of bookmarks) {
      const star = b.starred ? '*' : '-';
      // Bookmarklet URL 过长且不可读，只显示标题和类型标记
      const isBookmarklet = b.url?.startsWith('javascript:');
      const displayUrl = isBookmarklet ? '[bookmarklet]' : b.url;
      if (longFormat) {
        // 长格式：星标 标题 URL [摘要] [id:xxx]
        const summary = b.aiSummary ? ` [${b.aiSummary.slice(0, 50)}...]` : '';
        lines.push(`${star}\t${b.title}\t${displayUrl}${summary}\t[id:${b.chromeId}]`);
      } else {
        lines.push(isBookmarklet ? `${b.title} [bookmarklet]` : b.title);
      }
      items.push({
        type: 'file',
        name: b.title,
        id: b.chromeId,
        url: displayUrl,
        starred: b.starred,
        parentId: b.parentId,
        aiSummary: b.aiSummary,
        aiTags: b.aiTags,
      });
    }

    const path = this.getFolderPath(targetFolderId);
    const output = lines.length > 0 ? lines.join('\n') : '(empty)';

    return {
      success: true,
      output,
      data: { items, count: items.length, path, pattern: pattern || undefined },
      exitCode: 0,
    };
  }

  /**
   * cd - 切换目录（支持 --id 精确导航）
   */
  private async execCd(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length === 0 || args[0] === '~' || args[0] === '/') {
      context.cwd.folderId = null;
      context.cwd.path = '/';
      return {
        success: true,
        output: '/',
        data: { path: '/' },
        exitCode: 0,
      };
    }

    // 解析 --id 标志
    const { targetId, remaining } = this.extractIdFlag(args);

    if (targetId) {
      // 按 ID 精确导航
      const store = this.getStore();
      const folder = store.folders.find(f => f.chromeId === targetId);
      if (!folder) {
        return { success: false, output: `error: no folder with id: ${targetId}`, exitCode: 1 };
      }
      context.cwd.folderId = folder.chromeId;
      context.cwd.path = this.getFolderPath(folder.chromeId);
      return {
        success: true,
        output: context.cwd.path,
        data: { path: context.cwd.path },
        exitCode: 0,
      };
    }

    const target = remaining[0] || '/';
    if (target === '~' || target === '/') {
      context.cwd.folderId = null;
      context.cwd.path = '/';
      return { success: true, output: '/', data: { path: '/' }, exitCode: 0 };
    }

    const resolved = this.resolvePath(target, context);
    if (resolved.error) {
      return { success: false, output: resolved.error, exitCode: 1 };
    }

    context.cwd.folderId = resolved.folderId;
    context.cwd.path = this.getFolderPath(resolved.folderId);

    return {
      success: true,
      output: context.cwd.path,
      data: { path: context.cwd.path },
      exitCode: 0,
    };
  }

  /**
   * pwd - 显示当前目录
   */
  private async execPwd(context: AgentContext): Promise<BashResult> {
    return {
      success: true,
      output: context.cwd.path,
      data: { path: context.cwd.path },
      exitCode: 0,
    };
  }

  /**
   * find - 搜索（支持通配符）
   */
  private async execFind(args: string[], _context: AgentContext): Promise<BashResult> {
    const store = this.getStore();
    let typeFilter: 'file' | 'directory' | null = null;
    let starredOnly = false;
    let limit = 20;
    const keywords: string[] = [];

    // 解析参数
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      if (arg === '-type' && i + 1 < args.length) {
        const t = args[i + 1].toLowerCase();
        if (t === 'f' || t === 'file') typeFilter = 'file';
        else if (t === 'd' || t === 'dir') typeFilter = 'directory';
        i += 2;
      } else if (arg === '-starred') {
        starredOnly = true;
        i++;
      } else if (arg === '-limit' && i + 1 < args.length) {
        limit = parseInt(args[i + 1]) || 20;
        i += 2;
      } else if (!arg.startsWith('-')) {
        keywords.push(arg);
        i++;
      } else {
        i++;
      }
    }

    // 如果没有关键词且没有 -starred，显示用法
    if (keywords.length === 0 && !starredOnly) {
      return {
        success: false,
        output: 'usage: find <keyword> [-type f|d] [-starred] [-limit n] (支持通配符: *, ?, [...])',
        exitCode: 1,
      };
    }

    const keyword = keywords.join(' ');
    const items: DirectoryItem[] = [];
    const lines: string[] = [];

    // 检查是否使用通配符
    const isWildcard = PatternMatcher.isWildcardPattern(keyword);
    const regex = isWildcard ? PatternMatcher.globToRegex(keyword) : null;

    // 搜索文件夹（仅当有关键词且不是 starred-only 模式）
    if (typeFilter !== 'file' && keyword && !starredOnly) {
      const matchedFolders = store.folders.filter(f => {
        if (isWildcard && regex) {
          return regex.test(f.title);
        } else {
          return f.title.toLowerCase().includes(keyword.toLowerCase());
        }
      }).slice(0, limit);

      for (const f of matchedFolders) {
        const path = this.getFolderPath(f.chromeId);
        lines.push(`d\t${path}`);
        items.push({ type: 'directory', name: f.title, id: f.chromeId });
      }
    }

    // 搜索书签（增强：搜索标题、URL、AI摘要、AI标签、用户标签）
    if (typeFilter !== 'directory') {
      const matchedBookmarks = store.bookmarks.filter(b => {
        // starred-only 模式
        if (starredOnly && !b.starred) return false;
        
        // 如果没有关键词（仅 -starred），返回所有星标书签
        if (!keyword) return starredOnly && b.starred;
        
        // 通配符匹配
        if (isWildcard && regex) {
          return regex.test(b.title);
        }
        
        // 普通关键词搜索（搜索标题、URL、AI摘要、AI标签、用户标签）
        const keywordLower = keyword.toLowerCase();
        if (b.title.toLowerCase().includes(keywordLower)) return true;
        if (b.url.toLowerCase().includes(keywordLower)) return true;
        if (b.aiSummary && b.aiSummary.toLowerCase().includes(keywordLower)) return true;
        if (b.aiTags && b.aiTags.some(tag => tag.toLowerCase().includes(keywordLower))) return true;
        if (b.userTags && b.userTags.some(tag => tag.toLowerCase().includes(keywordLower))) return true;
        
        return false;
      }).slice(0, limit);

      for (const b of matchedBookmarks) {
        const star = b.starred ? '*' : '-';
        const path = this.getBookmarkPath(b.chromeId);
        lines.push(`${star}\t${path}\t${b.url}`);
        items.push({
          type: 'file',
          name: b.title,
          id: b.chromeId,
          url: b.url,
          starred: b.starred,
          parentId: b.parentId,
          path,
        });
      }
    }

    const output = lines.length > 0 ? lines.join('\n') : 'no results';

    return {
      success: true,
      output,
      data: { items, count: items.length, keyword, isWildcard },
      exitCode: 0,
    };
  }

  /**
   * mv - 移动或重命名书签/文件夹（支持通配符批量移动 + --id 精确操作）
   */
  private async execMv(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length < 2) {
      return {
        success: false,
        output: 'usage: mv <source> <dest_folder|new_name> [--id <ID>] (支持通配符: *, ?, [...])',
        exitCode: 1,
      };
    }

    const store = this.getStore();

    // 解析 --id 标志（用于精确指定源）
    const { targetId, remaining } = this.extractIdFlag(args);
    if (remaining.length < 2 && !targetId) {
      return { success: false, output: 'usage: mv <source> <dest> [--id <ID>]', exitCode: 1 };
    }

    // --id 模式下 remaining 可能只有 dest
    const source = targetId ? (remaining.length >= 2 ? remaining[0] : '') : remaining[0];
    const dest = targetId ? remaining[remaining.length - 1] : remaining[1];

    // 通配符批量移动（不与 --id 组合）
    if (!targetId && PatternMatcher.isWildcardPattern(source)) {
      // 目标必须是文件夹
      const destResolved = this.resolveFolderTarget(dest, context);
      if (!destResolved) {
        return { success: false, output: `error: destination folder not found: ${dest}`, exitCode: 1 };
      }
      if (destResolved.type === 'ambiguous') {
        return { success: false, output: this.formatAmbiguousError(dest, destResolved.candidates), exitCode: 1 };
      }
      const destFolder = destResolved.item;

      const bookmarks = this.findBookmarks(source, context);
      const folders = this.findFolders(source, context);
      if (bookmarks.length === 0 && folders.length === 0) {
        return { success: false, output: `error: no matches found for pattern: ${source}`, exitCode: 1 };
      }

      const movedItems: Array<{ type: 'file' | 'directory'; id: string; name: string }> = [];
      const outputs: string[] = [];

      for (const bookmark of bookmarks) {
        await store.moveBookmark(bookmark.chromeId, destFolder.chromeId);
        movedItems.push({ type: 'file', id: bookmark.chromeId, name: bookmark.title });
        outputs.push(`moved bookmark: ${bookmark.title}`);
      }
      for (const folder of folders) {
        if (folder.chromeId === destFolder.chromeId) {
          outputs.push(`skipped: cannot move folder "${folder.title}" into itself`);
          continue;
        }
        await store.moveFolder(folder.chromeId, destFolder.chromeId);
        movedItems.push({ type: 'directory', id: folder.chromeId, name: folder.title });
        outputs.push(`moved folder: ${folder.title}`);
      }

      return {
        success: true,
        output: outputs.join('\n'),
        data: { action: 'move', movedCount: movedItems.length, items: movedItems, pattern: source, dest: { id: destFolder.chromeId, title: destFolder.title } },
        exitCode: 0,
      };
    }

    // 单个移动/重命名（使用 resolveTarget 或 --id）
    let sourceType: 'file' | 'directory';
    let sourceItem: { chromeId: string; title: string; url?: string; starred?: boolean };

    if (targetId) {
      const byId = store.bookmarks.find(b => b.chromeId === targetId);
      if (byId) {
        sourceType = 'file';
        sourceItem = byId;
      } else {
        const fById = store.folders.find(f => f.chromeId === targetId);
        if (fById) {
          sourceType = 'directory';
          sourceItem = fById;
        } else {
          return { success: false, output: `error: no item with id: ${targetId}`, exitCode: 1 };
        }
      }
    } else {
      const resolved = this.resolveTarget(source, context);
      if (!resolved) {
        return { success: false, output: `error: not found: ${source}`, exitCode: 1 };
      }
      if (resolved.type === 'ambiguous') {
        return { success: false, output: this.formatAmbiguousError(source, resolved.candidates), exitCode: 1 };
      }
      sourceType = resolved.type;
      sourceItem = resolved.item;
    }

    // 检查目标是文件夹（移动）还是新名称（重命名）
    const destResolved = this.resolveFolderTarget(dest, context);
    const destFolder = destResolved && destResolved.type === 'directory' ? destResolved.item : null;

    if (sourceType === 'file') {
      if (destFolder) {
        await store.moveBookmark(sourceItem.chromeId, destFolder.chromeId);
        return {
          success: true,
          output: `moved bookmark "${sourceItem.title}" to "${destFolder.title}" [id:${sourceItem.chromeId}]`,
          data: { action: 'move', type: 'file', source: { id: sourceItem.chromeId, title: sourceItem.title }, dest: { id: destFolder.chromeId, title: destFolder.title } },
          exitCode: 0,
        };
      }
      await store.updateBookmark(sourceItem.chromeId, { title: dest });
      return {
        success: true,
        output: `renamed "${sourceItem.title}" to "${dest}" [id:${sourceItem.chromeId}]`,
        data: { action: 'rename', type: 'file', id: sourceItem.chromeId, oldTitle: sourceItem.title, newTitle: dest },
        exitCode: 0,
      };
    }

    // sourceType === 'directory'
    if (destFolder) {
      if (sourceItem.chromeId === destFolder.chromeId) {
        return { success: false, output: `error: cannot move folder into itself`, exitCode: 1 };
      }
      await store.moveFolder(sourceItem.chromeId, destFolder.chromeId);
      return {
        success: true,
        output: `moved folder "${sourceItem.title}" to "${destFolder.title}" [id:${sourceItem.chromeId}]`,
        data: { action: 'move', type: 'directory', source: { id: sourceItem.chromeId, title: sourceItem.title }, dest: { id: destFolder.chromeId, title: destFolder.title } },
        exitCode: 0,
      };
    }
    await store.renameFolder(sourceItem.chromeId, dest);
    return {
      success: true,
      output: `renamed folder "${sourceItem.title}" to "${dest}" [id:${sourceItem.chromeId}]`,
      data: { action: 'rename', type: 'directory', id: sourceItem.chromeId, oldTitle: sourceItem.title, newTitle: dest },
      exitCode: 0,
    };
  }

  /**
   * rm - 删除（支持通配符批量删除）
   */
  private async execRm(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length === 0) {
      return {
        success: false,
        output: 'usage: rm <bookmark|folder> (支持通配符: *, ?, [...])',
        exitCode: 1,
      };
    }

    const store = this.getStore();

    // 解析 --id 标志（精确按 ID 删除）
    let targetId: string | null = null;
    const remaining: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--id' && i + 1 < args.length) {
        targetId = args[i + 1];
        i++;
      } else {
        remaining.push(args[i]);
      }
    }

    // 通过 ID 精确删除
    if (targetId) {
      const bookmark = store.bookmarks.find(b => b.chromeId === targetId);
      if (bookmark) {
        await store.deleteBookmark(bookmark.chromeId);
        return {
          success: true,
          output: `deleted bookmark: ${bookmark.title} [id:${bookmark.chromeId}]`,
          data: { type: 'file', id: bookmark.chromeId, title: bookmark.title },
          exitCode: 0,
        };
      }
      const folder = store.folders.find(f => f.chromeId === targetId);
      if (folder) {
        await store.deleteFolder(folder.chromeId);
        return {
          success: true,
          output: `deleted folder: ${folder.title} [id:${folder.chromeId}]`,
          data: { type: 'directory', id: folder.chromeId, title: folder.title },
          exitCode: 0,
        };
      }
      return {
        success: false,
        output: `error: no item with id: ${targetId}`,
        exitCode: 1,
      };
    }

    const target = remaining.join(' ');

    // 检查是否包含通配符
    if (PatternMatcher.isWildcardPattern(target)) {
      // 批量删除模式
      const bookmarks = this.findBookmarks(target, context);
      const folders = this.findFolders(target, context);

      // 如果没有匹配项
      if (bookmarks.length === 0 && folders.length === 0) {
        return {
          success: false,
          output: `error: no matches found for pattern: ${target}`,
          exitCode: 1,
        };
      }

      const deletedItems: Array<{ type: 'file' | 'directory'; id: string; name: string }> = [];
      const outputs: string[] = [];

      // 删除匹配的书签
      for (const bookmark of bookmarks) {
        await store.deleteBookmark(bookmark.chromeId);
        deletedItems.push({ type: 'file', id: bookmark.chromeId, name: bookmark.title });
        outputs.push(`deleted bookmark: ${bookmark.title}`);
      }

      // 删除匹配的文件夹
      for (const folder of folders) {
        await store.deleteFolder(folder.chromeId);
        deletedItems.push({ type: 'directory', id: folder.chromeId, name: folder.title });
        outputs.push(`deleted folder: ${folder.title}`);
      }

      return {
        success: true,
        output: outputs.join('\n'),
        data: { 
          deletedCount: deletedItems.length,
          items: deletedItems,
          pattern: target,
        },
        exitCode: 0,
      };
    }

    // 单个删除：使用 resolveTarget 智能解析
    const resolved = this.resolveTarget(target, context);
    if (!resolved) {
      return { success: false, output: `error: not found: ${target}`, exitCode: 1 };
    }
    if (resolved.type === 'ambiguous') {
      return { success: false, output: this.formatAmbiguousError(target, resolved.candidates), exitCode: 1 };
    }
    if (resolved.type === 'file') {
      await store.deleteBookmark(resolved.item.chromeId);
      return {
        success: true,
        output: `deleted bookmark: ${resolved.item.title} [id:${resolved.item.chromeId}]`,
        data: { type: 'file', id: resolved.item.chromeId, title: resolved.item.title },
        exitCode: 0,
      };
    }
    await store.deleteFolder(resolved.item.chromeId);
    return {
      success: true,
      output: `deleted folder: ${resolved.item.title} [id:${resolved.item.chromeId}]`,
      data: { type: 'directory', id: resolved.item.chromeId, title: resolved.item.title },
      exitCode: 0,
    };
  }

  /**
   * mkdir - 创建文件夹
   */
  private async execMkdir(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length === 0) {
      return {
        success: false,
        output: 'usage: mkdir <name>',
        exitCode: 1,
      };
    }

    const store = this.getStore();
    const name = args.join(' ');
    const parentId = context.cwd.folderId || '1'; // 默认在书签栏创建

    const chromeId = await store.createFolder(name, parentId);
    if (chromeId) {
      return {
        success: true,
        output: `created folder: ${name}`,
        data: { id: chromeId, title: name, parentId },
        exitCode: 0,
      };
    }

    return {
      success: false,
      output: `error: failed to create folder: ${name}`,
      exitCode: 1,
    };
  }

  /**
   * stat - 显示详细信息
   */
  private async execStat(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length === 0) {
      return {
        success: false,
        output: 'usage: stat <bookmark|folder>',
        exitCode: 1,
      };
    }

    const store = this.getStore();

    // 解析 --id 标志
    const { targetId, remaining } = this.extractIdFlag(args);
    const target = remaining.join(' ') || args.join(' ');

    // 智能查找目标
    type BookmarkItem = ReturnType<BashExecutor['getStore']>['bookmarks'][0];
    type FolderItem = ReturnType<BashExecutor['getStore']>['folders'][0];
    let bookmark: BookmarkItem | undefined;
    let folder: FolderItem | undefined;
    if (targetId) {
      bookmark = store.bookmarks.find(b => b.chromeId === targetId);
      if (!bookmark) folder = store.folders.find(f => f.chromeId === targetId);
    } else {
      const resolved = this.resolveTarget(target, context);
      if (!resolved) {
        return { success: false, output: `error: not found: ${target}`, exitCode: 1 };
      }
      if (resolved.type === 'ambiguous') {
        return { success: false, output: this.formatAmbiguousError(target, resolved.candidates), exitCode: 1 };
      }
      if (resolved.type === 'file') bookmark = resolved.item;
      else folder = resolved.item;
    }

    if (bookmark) {
      const bookmarkPath = this.getBookmarkPath(bookmark.chromeId);
      const lines = [
        `type:\tfile`,
        `id:\t${bookmark.chromeId}`,
        `name:\t${bookmark.title}`,
        `url:\t${bookmark.url}`,
        `path:\t${bookmarkPath}`,
        `starred:\t${bookmark.starred}`,
        `created:\t${new Date(bookmark.dateAdded).toISOString()}`,
      ];
      
      // 添加 AI 分析数据
      if (bookmark.aiSummary) {
        lines.push(`summary:\t${bookmark.aiSummary}`);
      }
      if (bookmark.aiTags && bookmark.aiTags.length > 0) {
        lines.push(`ai_tags:\t${bookmark.aiTags.join(', ')}`);
      }
      if (bookmark.userTags && bookmark.userTags.length > 0) {
        lines.push(`user_tags:\t${bookmark.userTags.join(', ')}`);
      }
      if (bookmark.aiTechStack && bookmark.aiTechStack.length > 0) {
        lines.push(`tech_stack:\t${bookmark.aiTechStack.join(', ')}`);
      }
      
      // 添加统计数据
      if (bookmark.analytics) {
        lines.push(`visits:\t${bookmark.analytics.visitCount}`);
        lines.push(`importance:\t${bookmark.analytics.importance}`);
        if (bookmark.analytics.lastVisit) {
          lines.push(`last_visit:\t${new Date(bookmark.analytics.lastVisit).toISOString()}`);
        }
      }
      
      return {
        success: true,
        output: lines.join('\n'),
        data: {
          type: 'file',
          id: bookmark.chromeId,
          title: bookmark.title,
          url: bookmark.url,
          path: bookmarkPath,
          starred: bookmark.starred,
          parentId: bookmark.parentId,
          dateAdded: bookmark.dateAdded,
          aiSummary: bookmark.aiSummary,
          aiTags: bookmark.aiTags,
          userTags: bookmark.userTags,
          aiTechStack: bookmark.aiTechStack,
          analytics: bookmark.analytics,
        },
        exitCode: 0,
      };
    }

    if (folder) {
      const fld = folder;
      const subFolders = store.folders.filter(f => f.parentId === fld.chromeId);
      const bookmarks = store.bookmarks.filter(b => b.parentId === fld.chromeId);
      const lines = [
        `type:\tdirectory`,
        `id:\t${folder.chromeId}`,
        `name:\t${folder.title}`,
        `path:\t${this.getFolderPath(folder.chromeId)}`,
        `subdirs:\t${subFolders.length}`,
        `files:\t${bookmarks.length}`,
      ];
      return {
        success: true,
        output: lines.join('\n'),
        data: {
          type: 'directory',
          id: folder.chromeId,
          title: folder.title,
          path: this.getFolderPath(folder.chromeId),
          subdirs: subFolders.length,
          files: bookmarks.length,
        },
        exitCode: 0,
      };
    }

    return {
      success: false,
      output: `error: not found: ${target}`,
      exitCode: 1,
    };
  }

  /**
   * tree - 显示目录树
   */
  private async execTree(args: string[], context: AgentContext): Promise<BashResult> {
    const store = this.getStore();
    const maxDepth = args[0] ? parseInt(args[0]) : 3;
    const lines: string[] = [];

    const buildTree = (folderId: string | null, prefix: string, depth: number): void => {
      if (depth > maxDepth) return;

      const folders = store.folders.filter(f => {
        if (folderId === null) return TOP_LEVEL_IDS.includes(f.chromeId);
        return f.parentId === folderId;
      });

      folders.forEach((folder, i) => {
        const isLast = i === folders.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const bookmarkCount = store.bookmarks.filter(b => b.parentId === folder.chromeId).length;
        lines.push(`${prefix}${connector}${folder.title}/ (${bookmarkCount})`);

        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        buildTree(folder.chromeId, newPrefix, depth + 1);
      });
    };

    lines.push(context.cwd.path);
    buildTree(context.cwd.folderId, '', 1);

    return {
      success: true,
      output: lines.join('\n'),
      data: { path: context.cwd.path, depth: maxDepth },
      exitCode: 0,
    };
  }

  /**
   * open - 打开书签（支持 --id 精确操作）
   */
  private async execOpen(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length === 0) {
      return { success: false, output: 'usage: open <bookmark> [--id <ID>]', exitCode: 1 };
    }

    const { targetId, remaining } = this.extractIdFlag(args);
    const store = this.getStore();
    let bookmark: { chromeId: string; title: string; url: string } | undefined;

    if (targetId) {
      bookmark = store.bookmarks.find(b => b.chromeId === targetId);
      if (!bookmark) {
        return { success: false, output: `error: no bookmark with id: ${targetId}`, exitCode: 1 };
      }
    } else {
      const target = remaining.join(' ');
      const resolved = this.resolveTarget(target, context);
      if (!resolved) {
        return { success: false, output: `error: bookmark not found: ${target}`, exitCode: 1 };
      }
      if (resolved.type === 'ambiguous') {
        return { success: false, output: this.formatAmbiguousError(target, resolved.candidates), exitCode: 1 };
      }
      if (resolved.type === 'directory') {
        return { success: false, output: `error: "${target}" is a folder, not a bookmark. Use cd to navigate.`, exitCode: 1 };
      }
      bookmark = resolved.item;
    }

    chrome.tabs.create({ url: bookmark.url });
    return {
      success: true,
      output: `opened: ${bookmark.title} [id:${bookmark.chromeId}]`,
      data: { id: bookmark.chromeId, title: bookmark.title, url: bookmark.url },
      exitCode: 0,
    };
  }

  /**
   * star - 切换星标（支持 --id 精确操作）
   */
  private async execStar(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length === 0) {
      return { success: false, output: 'usage: star <bookmark> [--id <ID>]', exitCode: 1 };
    }

    const store = this.getStore();
    const { targetId, remaining } = this.extractIdFlag(args);
    let bookmark: { chromeId: string; title: string; starred?: boolean } | undefined;

    if (targetId) {
      bookmark = store.bookmarks.find(b => b.chromeId === targetId);
      if (!bookmark) {
        return { success: false, output: `error: no bookmark with id: ${targetId}`, exitCode: 1 };
      }
    } else {
      const target = remaining.join(' ');
      const resolved = this.resolveTarget(target, context);
      if (!resolved) {
        return { success: false, output: `error: bookmark not found: ${target}`, exitCode: 1 };
      }
      if (resolved.type === 'ambiguous') {
        return { success: false, output: this.formatAmbiguousError(target, resolved.candidates), exitCode: 1 };
      }
      if (resolved.type === 'directory') {
        return { success: false, output: `error: "${target}" is a folder, only bookmarks can be starred.`, exitCode: 1 };
      }
      bookmark = resolved.item;
    }

    await store.toggleStarred(bookmark.chromeId);
    const newState = !bookmark.starred;
    return {
      success: true,
      output: newState ? `starred: ${bookmark.title} [id:${bookmark.chromeId}]` : `unstarred: ${bookmark.title} [id:${bookmark.chromeId}]`,
      data: { id: bookmark.chromeId, title: bookmark.title, starred: newState },
      exitCode: 0,
    };
  }

  /**
   * cp - 复制书签（支持通配符批量复制 + --id 精确操作）
   */
  private async execCp(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length < 2) {
      return {
        success: false,
        output: 'usage: cp <bookmark> <dest_folder> [--id <ID>] (支持通配符: *, ?, [...])',
        exitCode: 1,
      };
    }

    const store = this.getStore();
    const { targetId, remaining } = this.extractIdFlag(args);
    if (remaining.length < 2 && !targetId) {
      return { success: false, output: 'usage: cp <bookmark> <dest> [--id <ID>]', exitCode: 1 };
    }
    const source = targetId ? (remaining.length >= 2 ? remaining[0] : '') : remaining[0];
    const dest = targetId ? remaining[remaining.length - 1] : remaining[1];

    // 解析目标文件夹
    const destResolved = this.resolveFolderTarget(dest, context);
    if (!destResolved) {
      return { success: false, output: `error: destination folder not found: ${dest}`, exitCode: 1 };
    }
    if (destResolved.type === 'ambiguous') {
      return { success: false, output: this.formatAmbiguousError(dest, destResolved.candidates), exitCode: 1 };
    }
    const destFolder = destResolved.item;

    // 通配符批量复制（不与 --id 组合）
    if (!targetId && PatternMatcher.isWildcardPattern(source)) {
      const bookmarks = this.findBookmarks(source, context);
      if (bookmarks.length === 0) {
        return { success: false, output: `error: no matches found for pattern: ${source}`, exitCode: 1 };
      }

      const copiedItems: Array<{ type: 'file'; id: string; name: string; newId: string }> = [];
      const outputs: string[] = [];
      for (const bookmark of bookmarks) {
        const newId = await store.addBookmark(bookmark.url, bookmark.title, destFolder.chromeId);
        if (newId) {
          copiedItems.push({ type: 'file', id: bookmark.chromeId, name: bookmark.title, newId });
          outputs.push(`copied bookmark: ${bookmark.title}`);
        }
      }

      return {
        success: true,
        output: outputs.join('\n'),
        data: { copiedCount: copiedItems.length, items: copiedItems, pattern: source, dest: { id: destFolder.chromeId, title: destFolder.title } },
        exitCode: 0,
      };
    }

    // 单个复制（使用 resolveTarget 或 --id）
    let bookmark: { chromeId: string; title: string; url: string } | undefined;
    if (targetId) {
      bookmark = store.bookmarks.find(b => b.chromeId === targetId);
      if (!bookmark) {
        return { success: false, output: `error: no bookmark with id: ${targetId}`, exitCode: 1 };
      }
    } else {
      const resolved = this.resolveTarget(source, context);
      if (!resolved) {
        return { success: false, output: `error: bookmark not found: ${source}`, exitCode: 1 };
      }
      if (resolved.type === 'ambiguous') {
        return { success: false, output: this.formatAmbiguousError(source, resolved.candidates), exitCode: 1 };
      }
      if (resolved.type === 'directory') {
        return { success: false, output: `error: cannot copy a folder, only bookmarks can be copied: ${source}`, exitCode: 1 };
      }
      bookmark = resolved.item;
    }

    const newId = await store.addBookmark(bookmark.url, bookmark.title, destFolder.chromeId);
    if (newId) {
      return {
        success: true,
        output: `copied "${bookmark.title}" to "${destFolder.title}" [id:${bookmark.chromeId}]`,
        data: { source: { id: bookmark.chromeId, title: bookmark.title }, dest: { id: destFolder.chromeId, title: destFolder.title }, newId },
        exitCode: 0,
      };
    }

    return { success: false, output: `error: failed to copy bookmark`, exitCode: 1 };
  }

  /**
   * cat - 查看书签内容（支持 --id 精确操作）
   */
  private async execCat(args: string[], context: AgentContext): Promise<BashResult> {
    if (args.length === 0) {
      return { success: false, output: 'usage: cat <bookmark> [--id <ID>]', exitCode: 1 };
    }

    const store = this.getStore();
    const { targetId, remaining } = this.extractIdFlag(args);
    let bookmark: { chromeId: string; title: string; url: string; aiSummary?: string; aiTags?: string[] } | undefined;

    if (targetId) {
      bookmark = store.bookmarks.find(b => b.chromeId === targetId);
      if (!bookmark) {
        return { success: false, output: `error: no bookmark with id: ${targetId}`, exitCode: 1 };
      }
    } else {
      const target = remaining.join(' ');
      const resolved = this.resolveTarget(target, context);
      if (!resolved) {
        return { success: false, output: `error: bookmark not found: ${target}`, exitCode: 1 };
      }
      if (resolved.type === 'ambiguous') {
        return { success: false, output: this.formatAmbiguousError(target, resolved.candidates), exitCode: 1 };
      }
      if (resolved.type === 'directory') {
        return { success: false, output: `error: "${target}" is a folder, not a bookmark. Use ls to view folder contents.`, exitCode: 1 };
      }
      bookmark = resolved.item;
    }

    const lines = [bookmark.url];
    if (bookmark.aiSummary) {
      lines.push(`# ${bookmark.aiSummary}`);
    }
    if (bookmark.aiTags && bookmark.aiTags.length > 0) {
      lines.push(`tags: ${bookmark.aiTags.join(', ')}`);
    }

    return {
      success: true,
      output: lines.join('\n'),
      data: {
        id: bookmark.chromeId,
        title: bookmark.title,
        url: bookmark.url,
        aiSummary: bookmark.aiSummary,
        aiTags: bookmark.aiTags,
      },
      exitCode: 0,
    };
  }

  /**
   * wc - 统计
   */
  private async execWc(args: string[], context: AgentContext): Promise<BashResult> {
    const store = this.getStore();
    let targetFolderId = context.cwd.folderId;

    // 解析路径参数
    for (const arg of args) {
      if (!arg.startsWith('-')) {
        const resolved = this.resolvePath(arg, context);
        if (!resolved.error) {
          targetFolderId = resolved.folderId;
        }
      }
    }

    if (targetFolderId === null) {
      // 根目录统计
      const totalBookmarks = store.bookmarks.length;
      const totalFolders = store.folders.length;
      const starredCount = store.bookmarks.filter(b => b.starred).length;

      return {
        success: true,
        output: `${totalBookmarks} bookmarks, ${totalFolders} folders, ${starredCount} starred`,
        data: { bookmarks: totalBookmarks, folders: totalFolders, starred: starredCount },
        exitCode: 0,
      };
    }

    // 指定文件夹统计
    const bookmarks = store.bookmarks.filter(b => b.parentId === targetFolderId);
    const subFolders = store.folders.filter(f => f.parentId === targetFolderId);
    const starredCount = bookmarks.filter(b => b.starred).length;

    return {
      success: true,
      output: `${bookmarks.length} bookmarks, ${subFolders.length} folders, ${starredCount} starred`,
      data: { bookmarks: bookmarks.length, folders: subFolders.length, starred: starredCount },
      exitCode: 0,
    };
  }

  /**
   * help - 显示帮助
   */
  private execHelp(args: string[] = []): BashResult {
    // 如果指定了具体命令，显示详细帮助
    if (args.length > 0) {
      const cmd = args[0].toLowerCase();
      const detailedHelp = this.getCommandHelp(cmd);
      if (detailedHelp) {
        return {
          success: true,
          output: detailedHelp,
          exitCode: 0,
        };
      }
      return {
        success: false,
        output: `未知命令: ${cmd}\n输入 help 查看所有可用命令`,
        exitCode: 1,
      };
    }

    // 显示所有命令概览
    const help = `可用命令:

导航:
  ls [路径] [-l] [--id <ID>]  列出目录内容（-l 显示 ID）
  cd <文件夹> [--id <ID>]     切换目录
  pwd                          显示当前路径
  tree [深度]                  显示目录树

搜索:
  find <关键词>    搜索书签和文件夹（支持通配符）
    选项: -type f|d, -starred, -limit n

查看:
  cat <书签> [--id <ID>]    查看书签内容
  stat <名称> [--id <ID>]   显示详细信息
  wc [路径]                  统计数量

操作 (支持通配符批量操作 + --id 精确操作):
  mv <源> <目标> [--id <ID>]   移动或重命名
  cp <书签> <目录> [--id <ID>] 复制书签到文件夹
  rm <名称> [--id <ID>]        删除书签或文件夹
  mkdir <名称>                  创建文件夹
  open <书签> [--id <ID>]      在浏览器打开
  star <书签> [--id <ID>]      切换星标

同名消歧:
  每个书签/文件夹有唯一 chrome ID。
  当名称匹配多个项时，命令会返回候选列表及 ID。
  使用 --id <ID> 精确指定目标。
  用 ls -l 查看所有项的 ID。

通配符:
  *   匹配任意字符    ?   匹配单个字符
  [abc] 匹配字符集    [!abc] 排除字符集

输入 help <命令> 查看详细用法，如: help cp`;

    return {
      success: true,
      output: help,
      exitCode: 0,
    };
  }

  /**
   * 获取具体命令的详细帮助
   */
  private getCommandHelp(cmd: string): string | null {
    const helpMap: Record<string, string> = {
      ls: `ls - 列出目录内容

用法:
  ls                       列出当前目录
  ls <路径>                列出指定目录
  ls -l                    长格式，显示星标、URL、摘要、ID
  ls -l --id <ID>          按 ID 列出指定文件夹内容
  ls <通配符>              过滤显示匹配的项目

示例:
  ls                       列出当前目录的书签和文件夹
  ls -l                    显示详细信息和 ID
  ls -l --id 29428         列出 ID 为 29428 的文件夹内容
  ls React*                只显示 React 开头的项目`,

      cd: `cd - 切换目录

用法:
  cd <文件夹>              切换到指定文件夹
  cd --id <ID>             按 ID 精确切换到指定文件夹
  cd /                     返回根目录
  cd ..                    返回上级目录

同名消歧: 遇到同名文件夹时，先用 ls -l 查看 ID，再用 cd --id <ID> 精确导航

示例:
  cd 书签栏                进入书签栏
  cd --id 29428            精确进入 ID 为 29428 的文件夹
  cd "AI 工具"             进入名称含空格的文件夹`,

      pwd: `pwd - 显示当前路径

用法:
  pwd             显示当前所在目录的完整路径`,

      tree: `tree - 显示目录树

用法:
  tree            显示当前目录的树形结构
  tree <深度>     限制显示深度

示例:
  tree            显示默认 3 层深度
  tree 2          只显示 2 层`,

      find: `find - 搜索书签和文件夹

用法:
  find <关键词>           搜索标题、URL、摘要、标签
  find <通配符>           使用通配符搜索
  find <关键词> -type f   只搜索书签
  find <关键词> -type d   只搜索文件夹
  find -starred           搜索所有星标书签
  find <关键词> -limit n  限制结果数量

通配符支持:
  *               匹配任意字符
  ?               匹配单个字符
  [abc]           匹配字符集中的任意一个

示例:
  find react              搜索包含 react 的书签
  find React*             搜索 React 开头的书签
  find test-?             搜索 test- 加单个字符的书签
  find -starred           列出所有星标书签
  find AI -type f         只搜索 AI 相关的书签`,

      cat: `cat - 查看书签内容

用法:
  cat <书签名>              显示书签的 URL、摘要、标签
  cat <书签名> --id <ID>    按 ID 精确查看

示例:
  cat GitHub                查看 GitHub 书签的详情
  cat --id 12345 "AI"       精确查看 ID 为 12345 的书签`,

      stat: `stat - 显示详细信息

用法:
  stat <名称>               显示书签或文件夹的详细信息
  stat <名称> --id <ID>     按 ID 精确查看

输出包含:
  - ID、名称、路径
  - URL（书签）
  - 创建时间、访问统计
  - AI 摘要、标签、技术栈`,

      wc: `wc - 统计数量

用法:
  wc              统计当前目录
  wc <路径>       统计指定目录

输出: 书签数、文件夹数、星标数`,

      mv: `mv - 移动或重命名

用法:
  mv <源> <目标文件夹>            移动到指定文件夹
  mv <源> <新名称>                重命名（目标不是文件夹时）
  mv <通配符> <目标>              批量移动匹配的项目
  mv <源> <目标> --id <ID>        按 ID 精确指定源

特性:
  - 自动全局搜索，无需先 cd
  - 同名冲突时返回候选列表，用 --id 消歧
  - 支持通配符批量操作

示例:
  mv "GitHub" "开发工具"          移动书签到文件夹
  mv --id 12345 "AI" "工具"       精确移动 ID 为 12345 的项
  mv test-* archive               批量移动`,

      cp: `cp - 复制书签

用法:
  cp <书签> <目标文件夹>          复制书签到指定文件夹
  cp <通配符> <目标>              批量复制匹配的书签
  cp <书签> <目标> --id <ID>      按 ID 精确指定源

特性:
  - 同名冲突时返回候选列表，用 --id 消歧
  - 支持通配符批量操作

示例:
  cp "GitHub" "收藏"              复制到收藏文件夹
  cp --id 12345 "AI" backup       精确复制
  cp React* backup                批量复制`,

      rm: `rm - 删除

用法:
  rm <名称>                删除书签或文件夹
  rm <通配符>              批量删除匹配的项目
  rm <名称> --id <ID>      按 ID 精确删除

警告: 删除文件夹会同时删除其中所有内容

示例:
  rm "过期链接"            删除书签
  rm --id 12345 "AI"       精确删除 ID 为 12345 的项
  rm temp-*                批量删除`,

      mkdir: `mkdir - 创建文件夹

用法:
  mkdir <名称>    在当前目录创建文件夹

示例:
  mkdir "AI 工具" 创建名为 AI 工具 的文件夹`,

      open: `open - 打开书签

用法:
  open <书签名>              在浏览器新标签页打开
  open <书签名> --id <ID>    按 ID 精确打开

示例:
  open GitHub                打开 GitHub 书签
  open --id 12345 "AI"       精确打开`,

      star: `star - 切换星标

用法:
  star <书签名>              切换书签的星标状态
  star <书签名> --id <ID>    按 ID 精确操作

示例:
  star "重要文档"            标记/取消标记为星标
  star --id 12345 "AI"       精确切换星标`,

      help: `help - 显示帮助

用法:
  help            显示所有命令概览
  help <命令>     显示指定命令的详细用法

示例:
  help cp         查看 cp 命令的详细用法`,
    };

    return helpMap[cmd] || null;
  }

  // ============ 辅助方法 ============

  /**
   * 从 args 中提取 --id 标志
   * 返回 { targetId, remaining }
   */
  private extractIdFlag(args: string[]): { targetId: string | null; remaining: string[] } {
    let targetId: string | null = null;
    const remaining: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--id' && i + 1 < args.length) {
        targetId = args[i + 1];
        i++;
      } else {
        remaining.push(args[i]);
      }
    }
    return { targetId, remaining };
  }

  /**
   * 智能解析目标名称为书签或文件夹
   *
   * 解析优先级：
   * 1. chromeId 直接匹配
   * 2. 当前目录精确匹配（文件夹优先）
   * 3. 全局精确匹配（文件夹优先）
   * 4. 当前目录模糊匹配（仅名称>2字符）
   * 5. 全局模糊匹配（仅名称>2字符）
   *
   * 多匹配消歧：精确匹配找到多个同名项时，返回 ambiguous 标记 + 候选列表
   */
  private resolveTarget(name: string, context: AgentContext):
    | { type: 'file'; item: ReturnType<BashExecutor['getStore']>['bookmarks'][0]; ambiguous?: false }
    | { type: 'directory'; item: ReturnType<BashExecutor['getStore']>['folders'][0]; ambiguous?: false }
    | { type: 'ambiguous'; candidates: Array<{ type: 'file' | 'directory'; id: string; title: string; path: string }> }
    | null {
    const store = this.getStore();
    const nameLower = name.toLowerCase();

    // 1. 按 chromeId 查找（唯一确定）
    const bookmarkById = store.bookmarks.find(b => b.chromeId === name);
    if (bookmarkById) return { type: 'file' as const, item: bookmarkById };
    const folderById = store.folders.find(f => f.chromeId === name);
    if (folderById) return { type: 'directory' as const, item: folderById };

    // 2. 当前目录精确匹配（文件夹优先）
    if (context.cwd.folderId) {
      const exactFoldersLocal = store.folders.filter(f =>
        f.parentId === context.cwd.folderId && f.title.toLowerCase() === nameLower
      );
      const exactBookmarksLocal = store.bookmarks.filter(b =>
        b.parentId === context.cwd.folderId && b.title.toLowerCase() === nameLower
      );
      const localExactTotal = exactFoldersLocal.length + exactBookmarksLocal.length;
      if (localExactTotal === 1) {
        if (exactFoldersLocal.length === 1) return { type: 'directory' as const, item: exactFoldersLocal[0] };
        return { type: 'file' as const, item: exactBookmarksLocal[0] };
      }
      if (localExactTotal > 1) {
        return this.buildAmbiguousResult(exactFoldersLocal, exactBookmarksLocal);
      }
    } else {
      // 根目录：检查顶级文件夹别名
      const aliasId = TOP_LEVEL_ALIASES[nameLower];
      if (aliasId) {
        const f = store.folders.find(f => f.chromeId === aliasId);
        if (f) return { type: 'directory' as const, item: f };
      }
      const topFolder = store.folders.find(f =>
        TOP_LEVEL_IDS.includes(f.chromeId) && f.title.toLowerCase() === nameLower
      );
      if (topFolder) return { type: 'directory' as const, item: topFolder };
    }

    // 3. 全局精确匹配（收集所有同名项）
    const exactFoldersGlobal = store.folders.filter(f => f.title.toLowerCase() === nameLower);
    const exactBookmarksGlobal = store.bookmarks.filter(b => b.title.toLowerCase() === nameLower);
    const globalExactTotal = exactFoldersGlobal.length + exactBookmarksGlobal.length;
    if (globalExactTotal === 1) {
      if (exactFoldersGlobal.length === 1) return { type: 'directory' as const, item: exactFoldersGlobal[0] };
      return { type: 'file' as const, item: exactBookmarksGlobal[0] };
    }
    if (globalExactTotal > 1) {
      return this.buildAmbiguousResult(exactFoldersGlobal, exactBookmarksGlobal);
    }

    // 4. 当前目录模糊匹配（仅名称>2字符，避免短名误匹配）
    if (nameLower.length > 2 && context.cwd.folderId) {
      const fuzzyFoldersLocal = store.folders.filter(f =>
        f.parentId === context.cwd.folderId && f.title.toLowerCase().includes(nameLower)
      );
      const fuzzyBookmarksLocal = store.bookmarks.filter(b =>
        b.parentId === context.cwd.folderId && b.title.toLowerCase().includes(nameLower)
      );
      const localFuzzyTotal = fuzzyFoldersLocal.length + fuzzyBookmarksLocal.length;
      if (localFuzzyTotal === 1) {
        if (fuzzyFoldersLocal.length === 1) return { type: 'directory' as const, item: fuzzyFoldersLocal[0] };
        return { type: 'file' as const, item: fuzzyBookmarksLocal[0] };
      }
      if (localFuzzyTotal > 1) {
        return this.buildAmbiguousResult(fuzzyFoldersLocal, fuzzyBookmarksLocal);
      }
    }

    // 5. 全局模糊匹配（仅名称 > 2 字符）
    if (nameLower.length > 2) {
      const fuzzyFolders = store.folders.filter(f => f.title.toLowerCase().includes(nameLower));
      const fuzzyBookmarks = store.bookmarks.filter(b => b.title.toLowerCase().includes(nameLower));
      const globalFuzzyTotal = fuzzyFolders.length + fuzzyBookmarks.length;
      if (globalFuzzyTotal === 1) {
        if (fuzzyFolders.length === 1) return { type: 'directory' as const, item: fuzzyFolders[0] };
        return { type: 'file' as const, item: fuzzyBookmarks[0] };
      }
      if (globalFuzzyTotal > 1) {
        return this.buildAmbiguousResult(fuzzyFolders, fuzzyBookmarks);
      }
    }

    return null;
  }

  /**
   * 构建消歧结果：列出所有候选项及其 ID 和路径
   */
  private buildAmbiguousResult(
    folders: ReturnType<BashExecutor['getStore']>['folders'],
    bookmarks: ReturnType<BashExecutor['getStore']>['bookmarks'],
  ): { type: 'ambiguous'; candidates: Array<{ type: 'file' | 'directory'; id: string; title: string; path: string }> } {
    const candidates: Array<{ type: 'file' | 'directory'; id: string; title: string; path: string }> = [];
    for (const f of folders) {
      candidates.push({ type: 'directory', id: f.chromeId, title: f.title, path: this.getFolderPath(f.chromeId) });
    }
    for (const b of bookmarks) {
      candidates.push({ type: 'file', id: b.chromeId, title: b.title, path: this.getBookmarkPath(b.chromeId) });
    }
    return { type: 'ambiguous', candidates };
  }

  /**
   * 格式化消歧错误信息，引导 LLM 用 --id 精确操作
   */
  private formatAmbiguousError(name: string, candidates: Array<{ type: 'file' | 'directory'; id: string; title: string; path: string }>): string {
    const lines = [`error: ambiguous name "${name}", multiple matches found. Use --id to specify:`];
    for (const c of candidates.slice(0, 10)) {
      const typeLabel = c.type === 'directory' ? 'folder' : 'bookmark';
      lines.push(`  ${typeLabel}\t"${c.title}"\t${c.path}\t[id:${c.id}]`);
    }
    if (candidates.length > 10) {
      lines.push(`  ... and ${candidates.length - 10} more`);
    }
    return lines.join('\n');
  }

  /**
   * 仅解析文件夹目标（用于 resolvePath/cd 和 mv/cp 的目标文件夹）
   * 优先级同 resolveTarget 但仅搜索文件夹
   */
  private resolveFolderTarget(name: string, context: AgentContext):
    | { type: 'directory'; item: ReturnType<BashExecutor['getStore']>['folders'][0] }
    | { type: 'ambiguous'; candidates: Array<{ type: 'directory'; id: string; title: string; path: string }> }
    | null {
    const store = this.getStore();
    const nameLower = name.toLowerCase();

    // 1. chromeId
    const folderById = store.folders.find(f => f.chromeId === name);
    if (folderById) return { type: 'directory', item: folderById };

    // 2. 别名
    const aliasId = TOP_LEVEL_ALIASES[nameLower];
    if (aliasId) {
      const f = store.folders.find(f => f.chromeId === aliasId);
      if (f) return { type: 'directory', item: f };
    }

    // 3. 当前目录精确
    if (context.cwd.folderId) {
      const exact = store.folders.filter(f =>
        f.parentId === context.cwd.folderId && f.title.toLowerCase() === nameLower
      );
      if (exact.length === 1) return { type: 'directory', item: exact[0] };
      if (exact.length > 1) {
        return { type: 'ambiguous', candidates: exact.map(f => ({ type: 'directory' as const, id: f.chromeId, title: f.title, path: this.getFolderPath(f.chromeId) })) };
      }
    } else {
      const topFolder = store.folders.find(f =>
        TOP_LEVEL_IDS.includes(f.chromeId) && f.title.toLowerCase() === nameLower
      );
      if (topFolder) return { type: 'directory', item: topFolder };
    }

    // 4. 全局精确
    const exactGlobal = store.folders.filter(f => f.title.toLowerCase() === nameLower);
    if (exactGlobal.length === 1) return { type: 'directory', item: exactGlobal[0] };
    if (exactGlobal.length > 1) {
      return { type: 'ambiguous', candidates: exactGlobal.map(f => ({ type: 'directory' as const, id: f.chromeId, title: f.title, path: this.getFolderPath(f.chromeId) })) };
    }

    // 5. 模糊匹配（>2字符）
    if (nameLower.length > 2) {
      if (context.cwd.folderId) {
        const fuzzyLocal = store.folders.filter(f =>
          f.parentId === context.cwd.folderId && f.title.toLowerCase().includes(nameLower)
        );
        if (fuzzyLocal.length === 1) return { type: 'directory', item: fuzzyLocal[0] };
        if (fuzzyLocal.length > 1) {
          return { type: 'ambiguous', candidates: fuzzyLocal.map(f => ({ type: 'directory' as const, id: f.chromeId, title: f.title, path: this.getFolderPath(f.chromeId) })) };
        }
      }
      const fuzzyGlobal = store.folders.filter(f => f.title.toLowerCase().includes(nameLower));
      if (fuzzyGlobal.length === 1) return { type: 'directory', item: fuzzyGlobal[0] };
      if (fuzzyGlobal.length > 1) {
        return { type: 'ambiguous', candidates: fuzzyGlobal.map(f => ({ type: 'directory' as const, id: f.chromeId, title: f.title, path: this.getFolderPath(f.chromeId) })) };
      }
    }

    return null;
  }

  /**
   * 解析路径（使用 resolveFolderTarget 替代 findFolder）
   */
  private resolvePath(path: string, context: AgentContext): { folderId: string | null; error?: string } {
    const store = this.getStore();

    if (path === '/' || path === '~') {
      return { folderId: null };
    }

    if (path === '..') {
      if (context.cwd.folderId === null) {
        return { folderId: null };
      }
      if (TOP_LEVEL_IDS.includes(context.cwd.folderId)) {
        return { folderId: null };
      }
      const current = store.folders.find(f => f.chromeId === context.cwd.folderId);
      return { folderId: current?.parentId || null };
    }

    // 查找文件夹（使用智能解析）
    const resolved = this.resolveFolderTarget(path, context);
    if (!resolved) {
      return { folderId: null, error: `error: no such directory: ${path}` };
    }
    if (resolved.type === 'ambiguous') {
      const lines = [`error: ambiguous folder name "${path}", multiple matches. Use ls -l to find IDs:`];
      for (const c of resolved.candidates.slice(0, 10)) {
        lines.push(`  folder\t"${c.title}"\t${c.path}\t[id:${c.id}]`);
      }
      return { folderId: null, error: lines.join('\n') };
    }
    return { folderId: resolved.item.chromeId };
  }

  /**
   * 查找文件夹
   */
  private findFolder(name: string, context: AgentContext) {
    const store = this.getStore();
    const nameLower = name.toLowerCase();

    // 检查别名
    const aliasId = TOP_LEVEL_ALIASES[nameLower];
    if (aliasId) {
      return store.folders.find(f => f.chromeId === aliasId);
    }

    // 在当前目录查找
    if (context.cwd.folderId === null) {
      // 根目录：先查找顶级文件夹
      let folder = store.folders.find(f =>
        TOP_LEVEL_IDS.includes(f.chromeId) && f.title.toLowerCase() === nameLower
      );
      if (folder) return folder;
      
      // 全局精确匹配
      folder = store.folders.find(f => f.title.toLowerCase() === nameLower);
      if (folder) return folder;
      
      // 全局模糊匹配
      return store.folders.find(f => f.title.toLowerCase().includes(nameLower));
    }

    // 先精确匹配
    let folder = store.folders.find(f =>
      f.parentId === context.cwd.folderId && f.title.toLowerCase() === nameLower
    );
    if (folder) return folder;

    // 模糊匹配
    folder = store.folders.find(f =>
      f.parentId === context.cwd.folderId && f.title.toLowerCase().includes(nameLower)
    );
    if (folder) return folder;

    // 全局搜索
    return store.folders.find(f => f.title.toLowerCase().includes(nameLower));
  }

  /**
   * 查找书签
   */
  private findBookmark(name: string, context: AgentContext) {
    const store = this.getStore();
    const nameLower = name.toLowerCase();

    // 按 ID 查找
    let bookmark = store.bookmarks.find(b => b.chromeId === name);
    if (bookmark) return bookmark;

    // 在当前目录精确匹配
    if (context.cwd.folderId) {
      bookmark = store.bookmarks.find(b =>
        b.parentId === context.cwd.folderId && b.title.toLowerCase() === nameLower
      );
      if (bookmark) return bookmark;

      // 当前目录模糊匹配
      bookmark = store.bookmarks.find(b =>
        b.parentId === context.cwd.folderId && b.title.toLowerCase().includes(nameLower)
      );
      if (bookmark) return bookmark;
    }

    // 全局搜索
    return store.bookmarks.find(b => b.title.toLowerCase().includes(nameLower));
  }

  /**
   * 查找匹配模式的所有书签（支持通配符）
   * @param pattern - 通配符模式或普通名称
   * @param context - 执行上下文
   * @returns 匹配的书签数组
   */
  private findBookmarks(pattern: string, context: AgentContext) {
    const store = this.getStore();
    
    // 检查是否包含通配符
    if (!PatternMatcher.isWildcardPattern(pattern)) {
      // 无通配符，使用现有的单个查找逻辑
      const bookmark = this.findBookmark(pattern, context);
      return bookmark ? [bookmark] : [];
    }

    // 使用通配符匹配
    const regex = PatternMatcher.globToRegex(pattern);
    const results: typeof store.bookmarks = [];

    // 优先在当前目录查找
    if (context.cwd.folderId) {
      const localMatches = store.bookmarks.filter(b =>
        b.parentId === context.cwd.folderId && regex.test(b.title)
      );
      results.push(...localMatches);
    }

    // 全局查找（排除已找到的）
    const globalMatches = store.bookmarks.filter(b =>
      !results.some(r => r.chromeId === b.chromeId) && regex.test(b.title)
    );
    results.push(...globalMatches);

    return results;
  }

  /**
   * 查找匹配模式的所有文件夹（支持通配符）
   * @param pattern - 通配符模式或普通名称
   * @param context - 执行上下文
   * @returns 匹配的文件夹数组
   */
  private findFolders(pattern: string, context: AgentContext) {
    const store = this.getStore();
    
    // 检查是否包含通配符
    if (!PatternMatcher.isWildcardPattern(pattern)) {
      // 无通配符，使用现有的单个查找逻辑
      const folder = this.findFolder(pattern, context);
      return folder ? [folder] : [];
    }

    // 使用通配符匹配
    const regex = PatternMatcher.globToRegex(pattern);
    const results: typeof store.folders = [];

    // 优先在当前目录查找
    if (context.cwd.folderId === null) {
      // 根目录：查找顶级文件夹
      const topLevelMatches = store.folders.filter(f =>
        TOP_LEVEL_IDS.includes(f.chromeId) && regex.test(f.title)
      );
      results.push(...topLevelMatches);
    } else {
      // 在当前目录查找
      const localMatches = store.folders.filter(f =>
        f.parentId === context.cwd.folderId && regex.test(f.title)
      );
      results.push(...localMatches);
    }

    // 全局查找（排除已找到的）
    const globalMatches = store.folders.filter(f =>
      !results.some(r => r.chromeId === f.chromeId) && regex.test(f.title)
    );
    results.push(...globalMatches);

    return results;
  }
}

/** 单例 */
export const bashExecutor = new BashExecutor();
