import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // 加载环境变量 (.env 文件)
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
      target: 'esnext'
    },
    define: {
      // 关键修复：在构建时将 process.env.API_KEY 替换为具体的值
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY),
      'process.env.SPARK_API_KEY': JSON.stringify(env.SPARK_API_KEY),
      // 防止浏览器报错 "process is not defined"
      'process.env': {}
    },
  };
});