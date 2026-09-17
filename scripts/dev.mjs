/* Local static + API server. Mirrors the Worker: /api/* is evaluated here, rule files are not served. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from '../api.js';

const root = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const port = Number(process.env.PORT) || 8787;
const PUBLIC = new Set(['.html', '.css', '.js', '.svg', '.ico', '.txt', '.map', '.woff2', '.png']);
const PRIVATE = new Set(['api.js', 'domains.js', 'engine.js', 'words.js', 'worker.js', 'package.json', 'package-lock.json', 'wrangler.toml']);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, `http://127.0.0.1:${port}`).href, {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req),
      duplex: 'half',
    });
    const api = await handleApi(request);
    if (api) {
      res.writeHead(api.status, Object.fromEntries(api.headers));
      res.end(Buffer.from(await api.arrayBuffer()));
      return;
    }
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const rel = normalize(path).replace(/^[/\\]+/, '');
    if (rel.startsWith('..') || PRIVATE.has(rel.split(/[/\\]/).pop()) || rel.startsWith('scripts/') || rel.startsWith('.github/')) {
      res.writeHead(404).end('Not found');
      return;
    }
    const ext = extname(rel);
    if (!PUBLIC.has(ext)) { res.writeHead(404).end('Not found'); return; }
    const file = join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(404).end('Not found'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' }).end(data);
  } catch (err) {
    if (err.code === 'ENOENT') { res.writeHead(404).end('Not found'); return; }
    console.error(err);
    res.writeHead(500).end('Server error');
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

server.listen(port, '127.0.0.1', () => {
  console.log(`Rule running at http://127.0.0.1:${port}`);
});
