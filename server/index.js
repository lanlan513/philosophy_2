// 问题之门 HTTP 服务（零框架依赖，Node 内置 http）。
// 同时承担：
//   /api/doors|sessions...   问题之门的权威 API（版本、分支、会话全在服务端）
//   /admin/revoke|restore    运维级：演示/触发“某分支突然失去访问权限”
//   其余路径                 托管 Vite 构建出的静态前端
//
// 启动：node server/index.js [--port 5173] [--ttl-ms 7200000]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';
import {
  choose, endSession, getSession, listDoors,
  migrateSession, startSession, goBack,
} from './engine.js';
import { MemorySessionStore } from './session-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const PUBLIC_DIR = join(__dirname, '..', 'public');

const PORT = Number(argValue('--port') ?? process.env.PORT ?? 5173);
const TTL_MS = Number(argValue('--ttl-ms') ?? process.env.SESSION_TTL_MS ?? 2 * 60 * 60 * 1000);
const ADMIN_KEY = process.env.ADMIN_KEY ?? ''; // 为空时管理端点只允许本机 loopback

export const store = new MemorySessionStore({ ttlMs: TTL_MS });
setInterval(() => store.prune(), 5 * 60 * 1000).unref?.();

function argValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function sendError(res, error) {
  sendJson(res, error.status ?? 500, {
    error: error.code ?? 'internal_error',
    message: error.extra?.message ?? error.message,
    ...(error.extra ?? {}),
  });
}

async function readJson(req) {
  const limit = 16 * 1024;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) {
      const error = new Error('body_too_large');
      error.status = 413; error.code = 'body_too_large';
      throw error;
    }
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch {
    const error = new Error('bad_json');
    error.status = 400; error.code = 'bad_json';
    throw error;
  }
}

// ── 路由 ───────────────────────────────────────────────────────────────────
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  // GET /api/doors —— 当前版本与四扇门
  if (method === 'GET' && parts.length === 2 && parts[1] === 'doors') {
    return sendJson(res, 200, listDoors());
  }

  // POST /api/sessions { doorId }
  if (method === 'POST' && parts.length === 2 && parts[1] === 'sessions') {
    const body = await readJson(req);
    return sendJson(res, 201, startSession(store, body.doorId));
  }

  // 以下都需要 /api/sessions/:id/...
  const sessionId = parts[2];
  if (parts[1] !== 'sessions' || !sessionId) return sendJson(res, 404, { error: 'not_found' });

  if (method === 'GET' && parts.length === 3) {
    return sendJson(res, 200, getSession(store, sessionId));
  }
  if (method === 'DELETE' && parts.length === 3) {
    return sendJson(res, 200, endSession(store, sessionId));
  }
  if (method === 'POST' && parts.length === 4 && parts[3] === 'choices') {
    const body = await readJson(req);
    return sendJson(res, 200, choose(store, sessionId, body));
  }
  if (method === 'POST' && parts.length === 4 && parts[3] === 'back') {
    const body = await readJson(req);
    return sendJson(res, 200, goBack(store, sessionId, body));
  }
  if (method === 'POST' && parts.length === 4 && parts[3] === 'migrate') {
    return sendJson(res, 200, migrateSession(store, sessionId));
  }

  return sendJson(res, 404, { error: 'not_found' });
}

// 运维/演示端点：让某个分支“突然失去访问权限”，以及恢复。
// 生产中应对接真实权限系统；这里用 ADMIN_KEY（X-Admin-Key）或本机回环做最小防护。
async function handleAdmin(req, res, url) {
  const authorized = ADMIN_KEY
    ? req.headers['x-admin-key'] === ADMIN_KEY
    : req.socket.localAddress === req.socket.remoteAddress
      && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  if (!authorized) return sendJson(res, 403, { error: 'forbidden' });

  if (req.method === 'POST' && url.pathname === '/admin/revoke') {
    const body = await readJson(req);
    if (!body.nodeId) return sendJson(res, 400, { error: 'node_id_required' });
    if (body.sessionId) {
      const located = store.locate(body.sessionId);
      if (located.error) return sendJson(res, 404, { error: located.error });
      located.session.revokedBranches.add(body.nodeId);
      store.save();
      return sendJson(res, 200, { nodeId: body.nodeId, scope: 'session', revoked: true });
    }
    return sendJson(res, 200, store.revokeNode(body.nodeId));
  }
  if (req.method === 'POST' && url.pathname === '/admin/restore') {
    const body = await readJson(req);
    if (!body.nodeId) return sendJson(res, 400, { error: 'node_id_required' });
    if (body.sessionId) {
      const located = store.locate(body.sessionId);
      if (located.error) return sendJson(res, 404, { error: located.error });
      located.session.revokedBranches.delete(body.nodeId);
      store.save();
      return sendJson(res, 200, { nodeId: body.nodeId, scope: 'session', restored: true });
    }
    return sendJson(res, 200, store.restoreNode(body.nodeId));
  }
  if (req.method === 'GET' && url.pathname === '/admin/revoked') {
    return sendJson(res, 200, { globalRevoked: [...store.globalRevoked] });
  }
  return sendJson(res, 404, { error: 'not_found' });
}

// ── 静态资源（SPA 回退到 index.html） ─────────────────────────────────────
async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safePath = normalize(pathname).replace(/^([./\\])+/, '');

  // 先 dist，构建缺失时（纯 dev 调试 API）回退 public
  for (const base of [DIST_DIR, PUBLIC_DIR]) {
    const filePath = join(base, safePath);
    if (!filePath.startsWith(base)) continue;
    try {
      const data = await readFile(filePath);
      res.writeHead(200, {
        'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
        ...(extname(filePath) === '.html' ? { 'cache-control': 'no-store' } : {}),
      });
      return res.end(data);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  // SPA 回退
  try {
    const index = await readFile(join(DIST_DIR, 'index.html'));
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
    return res.end(index);
  } catch {
    return sendJson(res, 200, {
      name: 'the-philosophy-archive-api',
      status: 'ok',
      hint: '前端尚未构建：先运行 npm run build；API 可直接使用 /api/doors',
    });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, x-admin-key');
    res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/admin/')) return await handleAdmin(req, res, url);
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url);
    return sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    return sendError(res, error);
  }
});

server.listen(PORT, () => {
  console.log(`问题之门服务已启动 → http://localhost:${PORT}`);
  console.log(`会话 TTL: ${Math.round(TTL_MS / 1000)}s`);
});

export { server };
