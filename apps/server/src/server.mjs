import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createDemoStore } from './demo-store.mjs';

const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://127.0.0.1:4173']);
export function createDemoServer(store = createDemoStore()) {
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!/^127\.0\.0\.1:\d+$/.test(request.headers.host || '') || (origin && !allowedOrigins.has(origin))) {
      response.writeHead(403); response.end(JSON.stringify({ error: '루프백 데모 접근만 허용합니다.' })); return;
    }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      if (!['GET', 'POST', 'PUT'].includes(request.method || '')) throw Object.assign(new Error('지원하지 않는 메서드'), { status: 405 });
      let size = 0; const parts = [];
      for await (const part of request) {
        size += part.length;
        if (size > 65536) throw Object.assign(new Error('요청 크기 초과'), { status: 413 });
        parts.push(part);
      }
      const body = size ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {};
      const value = await store.handle(request.method, request.url, body);
      response.writeHead(200); response.end(JSON.stringify(value));
    } catch (error) {
      response.writeHead(error instanceof SyntaxError ? 400 : error.status || 500);
      response.end(JSON.stringify({ error: error.status || error instanceof SyntaxError ? error.message : '데모 서버 오류' }));
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createDemoServer();
  server.listen(4177, '127.0.0.1', () => console.log('로컬 데모 서버: http://127.0.0.1:4177'));
  server.on('error', () => { console.error('데모 서버를 열 수 없습니다. 4177 포트 사용 여부를 확인하세요.'); process.exitCode = 1; });
}
