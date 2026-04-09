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
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory')) return 'charts';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) return 'vendor';
          if (id.includes('node_modules/xlsx') || id.includes('node_modules/exceljs') || id.includes('node_modules/file-saver')) return 'file-export';
          if (id.includes('node_modules/jszip')) return 'zip';
          if (id.includes('node_modules/html2canvas')) return 'html2canvas';
          return undefined;
        },
      },
    },
  },
});
