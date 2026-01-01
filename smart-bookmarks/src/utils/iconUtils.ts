/**
 * 智能图标工具 - 根据 URL 和内容自动选择图标
 */

import {
  FileText,
  Video,
  Music,
  Image,
  Code,
  BookOpen,
  Newspaper,
  ShoppingCart,
  Github,
  Twitter,
  Youtube,
  Linkedin,
  Facebook,
  Mail,
  Search,
  Globe,
  Database,
  Cloud,
  Terminal,
  Palette,
  Camera,
  type LucideIcon,
} from 'lucide-react';

/**
 * 根据 URL 域名识别来源图标
 */
export const getSourceIcon = (url: string): LucideIcon | null => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // 社交媒体
    if (hostname.includes('github.com')) return Github;
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return Twitter;
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return Youtube;
    if (hostname.includes('linkedin.com')) return Linkedin;
    if (hostname.includes('facebook.com')) return Facebook;
    
    // 开发工具
    if (hostname.includes('stackoverflow.com')) return Code;
    if (hostname.includes('medium.com')) return BookOpen;
    if (hostname.includes('dev.to')) return Terminal;
    
    // 设计工具
    if (hostname.includes('figma.com')) return Palette;
    if (hostname.includes('dribbble.com')) return Camera;
    
    // 搜索引擎
    if (hostname.includes('google.com')) return Search;
    if (hostname.includes('bing.com')) return Search;
    
    // 邮件
    if (hostname.includes('mail') || hostname.includes('gmail')) return Mail;
    
    // 新闻
    if (hostname.includes('news') || hostname.includes('blog')) return Newspaper;
    
    // 电商
    if (hostname.includes('amazon') || hostname.includes('shop') || hostname.includes('store')) {
      return ShoppingCart;
    }
    
    // 云服务
    if (hostname.includes('aws') || hostname.includes('azure') || hostname.includes('cloud')) {
      return Cloud;
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * 根据内容类型识别图标
 */
export const getContentIcon = (url: string, title?: string): LucideIcon => {
  const urlLower = url.toLowerCase();
  const titleLower = title?.toLowerCase() || '';
  
  // 视频
  if (
    urlLower.includes('video') ||
    urlLower.includes('youtube') ||
    urlLower.includes('vimeo') ||
    titleLower.includes('video') ||
    /\.(mp4|avi|mov|wmv)$/i.test(urlLower)
  ) {
    return Video;
  }
  
  // 音频
  if (
    urlLower.includes('music') ||
    urlLower.includes('spotify') ||
    urlLower.includes('soundcloud') ||
    titleLower.includes('music') ||
    titleLower.includes('audio') ||
    /\.(mp3|wav|flac)$/i.test(urlLower)
  ) {
    return Music;
  }
  
  // 图片
  if (
    urlLower.includes('image') ||
    urlLower.includes('photo') ||
    urlLower.includes('picture') ||
    /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(urlLower)
  ) {
    return Image;
  }
  
  // 代码/技术
  if (
    urlLower.includes('github') ||
    urlLower.includes('gitlab') ||
    urlLower.includes('stackoverflow') ||
    urlLower.includes('code') ||
    titleLower.includes('code') ||
    titleLower.includes('programming')
  ) {
    return Code;
  }
  
  // 文档
  if (
    urlLower.includes('doc') ||
    urlLower.includes('pdf') ||
    titleLower.includes('documentation') ||
    /\.(pdf|doc|docx|txt)$/i.test(urlLower)
  ) {
    return FileText;
  }
  
  // 博客/文章
  if (
    urlLower.includes('blog') ||
    urlLower.includes('article') ||
    urlLower.includes('post') ||
    titleLower.includes('blog')
  ) {
    return BookOpen;
  }
  
  // 新闻
  if (
    urlLower.includes('news') ||
    titleLower.includes('news')
  ) {
    return Newspaper;
  }
  
  // 数据库
  if (
    urlLower.includes('database') ||
    urlLower.includes('sql') ||
    titleLower.includes('database')
  ) {
    return Database;
  }
  
  // 默认
  return Globe;
};

/**
 * 获取最佳图标（优先来源，其次内容）
 */
export const getBestIcon = (url: string, title?: string): LucideIcon => {
  const sourceIcon = getSourceIcon(url);
  if (sourceIcon) return sourceIcon;
  
  return getContentIcon(url, title);
};
