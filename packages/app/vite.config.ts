import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@onfile/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@onfile/api': path.resolve(__dirname, '../api/src/index.ts'),
      '@onfile/ui': path.resolve(__dirname, '../ui/src/index.ts'),
      '@onfile/feature-profile': path.resolve(__dirname, '../feature-profile/src/index.tsx'),
      '@onfile/feature-jobs': path.resolve(__dirname, '../feature-jobs/src/index.tsx'),
      '@onfile/feature-resume-studio': path.resolve(__dirname, '../feature-resume-studio/src/index.tsx'),
      '@onfile/feature-applications': path.resolve(__dirname, '../feature-applications/src/index.tsx'),
      '@onfile/feature-interviews': path.resolve(__dirname, '../feature-interviews/src/index.tsx'),
      '@onfile/feature-insights': path.resolve(__dirname, '../feature-insights/src/index.tsx'),
      '@onfile/feature-settings': path.resolve(__dirname, '../feature-settings/src/index.tsx'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
