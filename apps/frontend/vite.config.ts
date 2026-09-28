import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  return {
    plugins: [react()],
    envDir: workspaceRoot,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.FRONTEND_PORT ?? 5173),
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET ?? 'http://localhost:3000',
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
