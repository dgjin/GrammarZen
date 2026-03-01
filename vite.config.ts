import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Using cast to allow process.cwd() usage despite missing type definition in some contexts.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext'
      }
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    // Using define to replace process.env.KEY with the actual string value during build.
    define: {
      'process.env.VITE_API_KEY': JSON.stringify(env.VITE_API_KEY || ''),
      'process.env.VITE_DEEPSEEK_API_KEY': JSON.stringify(env.VITE_DEEPSEEK_API_KEY || ''),
      'process.env.VITE_SPARK_API_KEY': JSON.stringify(env.VITE_SPARK_API_KEY || ''),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
      'process.env.VITE_KIMI_API_KEY': JSON.stringify(env.VITE_KIMI_API_KEY || ''),
      'process.env.VITE_MINMAX_API_KEY': JSON.stringify(env.VITE_MINMAX_API_KEY || ''),
      // We do NOT define 'process.env': {} here because we handle it in index.html
      // This avoids potential conflicts with the specific replacements above.
    },
  };
});