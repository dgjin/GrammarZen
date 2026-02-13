import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 加载环境变量 (.env 文件)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // 关键修复：在构建时将 process.env.API_KEY 替换为具体的值
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // 防止浏览器报错 "process is not defined"
      'process.env': {}
    },
  };
});