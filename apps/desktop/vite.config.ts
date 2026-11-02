import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// 운영 환경 파일을 읽지 않고 공개 데모만 빌드한다.
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  envDir: false,
  base: './',
  plugins: [react()],
  resolve: { alias: {
    '@fieldlink/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    'socket.io-client': fileURLToPath(new URL('./src/demo/socket.ts', import.meta.url)),
  } },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://demo.invalid'),
    'import.meta.env.VITE_KIOSK_EDITION': JSON.stringify('tunnel-preview'),
  },
  build: {
    outDir: '../../dist', emptyOutDir: true,
    commonjsOptions: { include: [/node_modules/, /agent-status-cache\.cjs$/] },
  },
  server: { port: 5173, strictPort: true, host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
});
