import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发期把 /api 与 /admin 代理给问题之门服务（node server/index.js）；
// 生产期由同一个 Node 服务直接托管 dist。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:5173', changeOrigin: true },
      '/admin': { target: 'http://localhost:5173', changeOrigin: true },
    },
  },
});
