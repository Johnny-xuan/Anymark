import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

// https://vite.dev/config/
export default defineConfig({
  // Chrome扩展需要使用相对路径
  base: './',

  plugins: [
    react(),
    // 自定义插件：复制文件到dist目录
    {
      name: 'copy-files',
      closeBundle() {
        mkdirSync('dist', { recursive: true });
        copyFileSync('public/manifest.json', 'dist/manifest.json');
      },
    },
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // 侧边栏入口
        sidebar: resolve(__dirname, 'sidebar.html'),
        // 弹出窗口入口
        popup: resolve(__dirname, 'popup.html'),
        // 后台服务worker
        background: resolve(__dirname, 'src/background/index.ts'),
        // Content scripts
        'content-toast': resolve(__dirname, 'src/content/toast.ts'),
        'content-pixel-buddy': resolve(__dirname, 'src/content/pixelBuddy.ts'),
        // 引导页入口
        onboarding: resolve(__dirname, 'onboarding.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // background service worker需要在根目录
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          // content scripts也需要在根目录
          if (chunkInfo.name === 'content-toast') {
            return 'content-toast.js';
          }
          if (chunkInfo.name === 'content-pixel-buddy') {
            return 'content-pixel-buddy.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },

  // 开发服务器配置
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },

  // 解析配置
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/sidebar/components'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@types': resolve(__dirname, 'src/types'),
    },
  },
});
