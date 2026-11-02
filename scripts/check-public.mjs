import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 알려진 식별자·키 형식만 검사한다. 조직의 소스 공개 검토를 대체하지 않는다.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const ignored = new Set(['node_modules', 'bin', 'obj', '.git']);
const allowed = new Set(['.md', '.html', '.css', '.js', '.mjs', '.cjs', '.json', '.svg', '.png', '.ts', '.tsx', '.cts', '.cs', '.csproj']);
const blocked = [
  /tskey-(?:auth|client|api)-[a-z0-9]{10,}/i,
  /-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----/,
  /[A-Z]:[\\/]Users[\\/][^\s'"<>]+/i,
  /[A-Z0-9._%+-]+@(?:gmail|naver|daum|outlook)\.[A-Z]+/i,
];
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    if (item.isSymbolicLink()) throw new Error('심볼릭 링크 포함');
    if (ignored.has(item.name)) return [];
    const full = path.join(dir, item.name);
    return item.isDirectory() ? walk(full) : [full];
  });
}
let files = 0, links = 0;
for (const file of walk(root)) {
  const relative = path.relative(root, file);
  const ext = path.extname(file);
  if (!allowed.has(ext) && path.basename(file) !== '.gitignore') throw new Error(`허용하지 않은 파일: ${relative}`);
  if (/(^|[\\/])\.env(?:\.|$)/.test(relative)) throw new Error('환경 설정 파일 포함');
  files++;
  if (ext === '.png') {
    const png = fs.readFileSync(file);
    if (png.subarray(1, 4).toString() !== 'PNG') throw new Error(`PNG 형식 오류: ${relative}`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  // 검사 규칙 자체에는 금지 문자열이 들어 있으므로 내용 검사에서 제외한다.
  if (relative.replaceAll('\\', '/') !== 'scripts/check-public.mjs') {
    for (const pattern of blocked) if (pattern.test(text)) throw new Error(`민감 패턴: ${relative} (${pattern})`);
  }
  if (ext === '.md') for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(match[1].split('#')[0]));
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) throw new Error(`깨진 문서 링크: ${relative} → ${match[1]}`);
    links++;
  }
}
console.log(JSON.stringify({ result: 'PASS', files, relativeLinks: links, knownSensitivePatterns: 0, note: '일반 사설 IP·프로토콜 상수·패키지 저장소 URL은 코드 예제에 포함한다.' }, null, 2));
