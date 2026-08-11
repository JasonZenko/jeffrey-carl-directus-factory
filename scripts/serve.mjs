#!/usr/bin/env node
/**
 * Static review server for the built site (site/dist).
 *
 * Preserves legacy paths exactly: a request for /p/dentist-...-p466.asp is
 * served from dist/p/dentist-...-p466.asp/index.html with no redirect, so
 * the independent auditor sees HTTP 200 at the preserved legacy path.
 * Every response carries X-Robots-Tag: noindex, nofollow.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../site/dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

function resolveFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = join(ROOT, clean);
  if (!base.startsWith(ROOT)) return null;
  const candidates = [base, `${base}.html`, join(base, 'index.html'), `${base.replace(/\/$/, '')}.html`];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const file = resolveFile(url.pathname === '/' ? '/index.html' : url.pathname);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-cache');
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const type = extname(file) === '.html' || !TYPES[extname(file)]
    ? (TYPES[extname(file)] ?? 'application/octet-stream')
    : TYPES[extname(file)];
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`review server: http://${HOST}:${PORT} (root ${ROOT})`);
});
