import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4100,
    proxy: {
      '/api': {
        target: 'http://localhost:4101',
        changeOrigin: true,
      },
    },
  },
});
