import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};
const server = createServer((request, response) => {
  let path: string;
  try { path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
  catch { response.writeHead(400).end('Bad request'); return; }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, normalize(path)));
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end('Forbidden'); return; }
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    response.writeHead(200, { 'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
});
const port = Number(process.argv[2]) || 8080;
server.listen(port, '127.0.0.1', () => console.log(`FOLDLINE served at http://127.0.0.1:${port}`));
