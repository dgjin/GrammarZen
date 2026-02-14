import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // 加载环境变量 (.env 文件)
  // 第三个参数 '' 表示加载所有变量，不仅仅是 VITE_ 开头的
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
    // 优化 pdfjs-dist 的构建支持
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext'
      }
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    define: {
      // 关键修复：在 Vercel 构建环境中，变量可能存在于 process.env 中而不是被 loadEnv 读取
      // 因此我们需要优先使用 env 中的变量，如果没有则回退到 process.env
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY),
      'process.env.SPARK_API_KEY': JSON.stringify(env.SPARK_API_KEY || process.env.SPARK_API_KEY),
      // 防止浏览器报错 "process is not defined"
      'process.env': {}
    },
  };
});