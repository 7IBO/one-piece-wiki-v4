import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 4100,
    proxy: {
      // Use 127.0.0.1 explicitly: on Windows "localhost" resolves to ::1
      // first, but the Bun API server binds to 127.0.0.1 only, so the
      // proxy gets ECONNREFUSED. The IPv4 literal sidesteps the issue.
      '/api': {
        target: 'http://127.0.0.1:4101',
        changeOrigin: true,
      },
    },
  },
});
