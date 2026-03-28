import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts')) return 'charts';
          if (id.includes('xlsx') || id.includes('file-saver')) return 'file-export';
          if (id.includes('jszip')) return 'zip';
          if (id.includes('html2canvas')) return 'html2canvas';
          if (id.includes('firebase')) {
            if (id.includes('firebase/storage')) return 'firebase-storage';
            if (id.includes('firestore')) return 'firebase-db';
            if (id.includes('auth')) return 'firebase-auth';
            if (id.includes('app')) return 'firebase-app';
            return 'firebase-misc';
          }
          if (id.includes('react-router')) return 'react-router';
          if (id.includes('react-dom') || /node_modules[/\\]react[/\\]/.test(id)) {
            return 'react-core';
          }
          return undefined;
        },
      },
    },
  },
});
