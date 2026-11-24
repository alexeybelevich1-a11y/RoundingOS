// Tiny static file server for local development: serves the repo as-is, like GitHub Pages does.
// Usage: pnpm dev [-- --port 8000]. Also imported by scripts/test.mjs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const BLOCKED = new Set(['node_modules', '.git', 'data']);

export function startServer(port = 8000, host = '127.0.0.1') {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(ROOT, path));
      const rel = file.slice(ROOT.length + 1).split(sep);
      if (!(file === ROOT || file.startsWith(ROOT + sep)) || BLOCKED.has(rel[0])) throw Object.assign(new Error(), { code: 'ENOENT' });
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(e.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const port = Number(i > 0 ? process.argv[i + 1] : process.env.PORT || 8000);
  const server = await startServer(port);
  const { port: p } = server.address();
  console.log(`RoundingOS dev server: http://localhost:${p}/`);
  console.log(`Tests in the browser:  http://localhost:${p}/tests/index.html`);
}
