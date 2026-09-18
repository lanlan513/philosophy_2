// 问题之门 API 客户端：只做传输。
// 分支规则、版本裁剪、会话状态全部在服务端；这里不缓存任何“下一跳”。
// 所有错误都归一化成 ApiError，UI 状态机据 code 决定如何恢复。

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(code, status, payload = {}) {
    super(payload.message ?? code);
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

let inFlight = new Map();

async function request(method, path, body, { dedupeKey = null } = {}) {
  const key = dedupeKey ?? `${method} ${path} ${body ? JSON.stringify(body) : ''}`;

  // 同参数的并发请求直接复用同一个 Promise：组件 StrictMode 双调用、
  // 快速重复触发 effect 都不会在服务端产生两次写入。
  if (inFlight.has(key)) return inFlight.get(key);

  const run = (async () => {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      // 断网 / CORS / 服务器未响应
      throw new ApiError(
        navigator.onLine === false ? 'offline' : 'network',
        0,
        { message: navigator.onLine === false ? '网络已断开' : '网络异常，请稍后重试' },
      );
    }

    let payload = null;
    try { payload = await res.json(); } catch { /* 非 JSON 响应 */ }

    if (!res.ok) {
      const code = payload?.error ?? `http_${res.status}`;
      throw new ApiError(code, res.status, payload ?? {});
    }
    return payload;
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

export const api = {
  doors: () => request('GET', '/doors'),
  start: (doorId, nonce = 0) =>
    request('POST', '/sessions', { doorId }, { dedupeKey: `start:${doorId}:${nonce}` }),
  resume: (sessionId) => request('GET', `/sessions/${encodeURIComponent(sessionId)}`),
  choose: (sessionId, optionId, seq) =>
    request('POST', `/sessions/${encodeURIComponent(sessionId)}/choices`, { optionId, seq },
      { dedupeKey: `choose:${sessionId}:${seq}:${optionId}` }),
  back: (sessionId, seq) =>
    request('POST', `/sessions/${encodeURIComponent(sessionId)}/back`, { seq },
      { dedupeKey: `back:${sessionId}:${seq}` }),
  migrate: (sessionId) =>
    request('POST', `/sessions/${encodeURIComponent(sessionId)}/migrate`),
};

// 测试/演示辅助：模拟“某分支突然失去访问权限”。
// 无 ADMIN_KEY 时只允许本机 loopback 调用，见 server/index.js。
export async function adminRevoke(nodeId, sessionId = null) {
  const res = await fetch('/admin/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(import.meta.env.VITE_ADMIN_KEY ? { 'x-admin-key': import.meta.env.VITE_ADMIN_KEY } : {}) },
    body: JSON.stringify({ nodeId, sessionId }),
  });
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error ?? 'forbidden', res.status);
  return res.json();
}
export async function adminRestore(nodeId) {
  const res = await fetch('/admin/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(import.meta.env.VITE_ADMIN_KEY ? { 'x-admin-key': import.meta.env.VITE_ADMIN_KEY } : {}) },
    body: JSON.stringify({ nodeId }),
  });
  return res.json();
}
