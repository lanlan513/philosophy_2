import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// 通过子进程启动真实 HTTP 服务，端到端验证 API 契约（含乱序、失权、过期、版本）。
const port = 5891;
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['server/index.js', '--port', String(port), '--ttl-ms', '400'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, NODE_ENV: 'test' },
});
after(() => child.kill('SIGTERM'));

const base = `http://127.0.0.1:${port}`;

async function waitForServer(retries = 40) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${base}/api/doors`);
      if (res.ok) return;
    } catch { /* 尚未监听 */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server did not start');
}

async function json(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

test('HTTP: 完整选择流 + 乱序 409 + 失权 403 + 过期 410', async () => {
  await waitForServer();

  const doors = await json('GET', '/api/doors');
  assert.equal(doors.status, 200);
  assert.equal(doors.payload.doors.length, 4);

  const start = await json('POST', '/api/sessions', { doorId: 'human' });
  assert.equal(start.status, 201);
  const sid = start.payload.sessionId;
  assert.equal(start.payload.seq, 0);
  assert.equal(start.payload.view.options.length, 3);
  // 视图不含任何分支目标信息
  assert.ok(start.payload.view.options.every((o) => o.target === undefined));

  // 正常前进一步
  const step = await json('POST', `/api/sessions/${sid}/choices`, { optionId: 'h_r_1', seq: 0 });
  assert.equal(step.status, 200);
  assert.equal(step.payload.view.nodeId, 'human_soul');
  assert.equal(step.payload.seq, 1);

  // 快速重复点击（旧 seq）→ 409 stale_seq 且带权威 current
  const dup = await json('POST', `/api/sessions/${sid}/choices`, { optionId: 'h_r_1', seq: 0 });
  assert.equal(dup.status, 409);
  assert.equal(dup.payload.error, 'stale_seq');
  assert.equal(dup.payload.current.view.nodeId, 'human_soul');

  // 服务端后退
  const back = await json('POST', `/api/sessions/${sid}/back`, { seq: 1 });
  assert.equal(back.status, 200);
  assert.equal(back.payload.view.nodeId, 'human_root');

  // 管理员让某分支失权（loopback 允许）
  const revoke = await json('POST', '/admin/revoke', { nodeId: 'human_soul' });
  assert.equal(revoke.status, 200);
  const blocked = await json('POST', `/api/sessions/${sid}/choices`, { optionId: 'h_r_1', seq: back.payload.seq });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.payload.error, 'branch_forbidden');

  // GET 后该选项显示为禁用
  const refreshed = await json('GET', `/api/sessions/${sid}`);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.payload.view.options.find((o) => o.optionId === 'h_r_1').allowed, false);

  // 恢复后畅通
  await json('POST', '/admin/restore', { nodeId: 'human_soul' });
  const restored = await json('POST', `/api/sessions/${sid}/choices`, { optionId: 'h_r_1', seq: refreshed.payload.seq });
  assert.equal(restored.status, 200);
  assert.equal(restored.payload.view.nodeId, 'human_soul');

  // 会话过期（ttl 400ms）
  await new Promise((resolve) => setTimeout(resolve, 450));
  const expired = await json('GET', `/api/sessions/${sid}`);
  assert.equal(expired.status, 410);
  assert.equal(expired.payload.error, 'session_expired');

  // 未知会话
  const missing = await json('GET', '/api/sessions/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.payload.error, 'session_not_found');

  // 错误的 doorId
  const badDoor = await json('POST', '/api/sessions', { doorId: 'nope' });
  assert.equal(badDoor.status, 404);
  assert.equal(badDoor.payload.error, 'door_not_found');
});

test('HTTP: 迁移到新版本（通过内部存储难以直接构造旧版本，这里验证端点存在性）', async () => {
  await waitForServer();
  const start = await json('POST', '/api/sessions', { doorId: 'life' });
  const migrate = await json('POST', `/api/sessions/${start.payload.sessionId}/migrate`);
  // 当前版本创建的会话迁移是幂等的（重放全部）
  assert.equal(migrate.status, 200);
  assert.equal(migrate.payload.session.pinnedVersion, start.payload.pinnedVersion);
});
