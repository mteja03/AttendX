import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Injects Firebase web config for `public/firebase-messaging-sw.js` (classic worker; no import.meta). */
function firebaseSwInitPlugin() {
  let viteEnv = {};

  const buildSwInitScript = (env) => {
    const s = (key) => JSON.stringify(env[key] ?? '');
    return [
      `self.FIREBASE_API_KEY=${s('VITE_FIREBASE_API_KEY')};`,
      `self.FIREBASE_AUTH_DOMAIN=${s('VITE_FIREBASE_AUTH_DOMAIN')};`,
      `self.FIREBASE_PROJECT_ID=${s('VITE_FIREBASE_PROJECT_ID')};`,
      `self.FIREBASE_STORAGE_BUCKET=${s('VITE_FIREBASE_STORAGE_BUCKET')};`,
      `self.FIREBASE_MESSAGING_SENDER_ID=${s('VITE_FIREBASE_MESSAGING_SENDER_ID')};`,
      `self.FIREBASE_APP_ID=${s('VITE_FIREBASE_APP_ID')};`,
    ].join('\n');
  };

  return {
    name: 'firebase-sw-init',
    configResolved(config) {
      viteEnv = loadEnv(config.mode, process.cwd(), 'VITE_');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url !== '/firebase-sw-init.js') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buildSwInitScript(viteEnv));
      });
    },
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist');
      if (!fs.existsSync(distDir)) return;
      fs.writeFileSync(path.join(distDir, 'firebase-sw-init.js'), buildSwInitScript(viteEnv), 'utf8');
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), firebaseSwInitPlugin()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/pages/audit/') || id.includes('\\src\\pages\\audit\\')) return 'audit';
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
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
