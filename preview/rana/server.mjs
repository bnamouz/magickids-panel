import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { openStore } from './store.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Sandbox server must not run in production');
const store = await openStore(path.join(root, 'data'));
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Demo-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  const scope = createHash('sha256').update(String(req.headers['x-visitor-id'] || 'local-test-visitor')).digest('hex');
  const key = String(req.headers['x-demo-key'] || '');
  try {
    if (files[url.pathname] && req.method === 'GET') {
      const [name, type] = files[url.pathname]; res.setHeader('Content-Type', type);
      res.end(await fs.readFile(path.join(root, 'dist', name))); return;
    }
    let body = {};
    if (req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('invalid_request'), { status: 415 });
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw Object.assign(new Error('invalid_request'), { status: 413 }); }
      try { body = JSON.parse(raw); } catch { throw Object.assign(new Error('invalid_request'), { status: 400 }); }
    }
    let data;
    const route = req.method + ' ' + url.pathname;
    if (route === 'GET /api/bootstrap') data = await store.bootstrap(scope);
    else if (route === 'GET /api/slots') data = await store.slots(scope);
    else if (route === 'GET /api/mine') data = await store.mine(scope, key);
    else if (route === 'GET /api/staff') data = await store.staff(scope, key);
    else if (route === 'POST /api/request') data = await store.create(scope, key, body);
    else if (route === 'POST /api/decision') data = await store.decide(scope, key, body);
    else if (route === 'POST /api/availability') data = await store.availability(scope, key, body);
    else { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
  } catch (e) {
    const status = e.status || 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: status === 500 ? 'server_error' : e.message }));
  }
});
server.listen(4317, '0.0.0.0', () => console.log('Rana isolated preview on 4317. Fake calendar only; no email, no production credentials.'));
