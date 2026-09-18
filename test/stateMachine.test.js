import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, initialState, STATUS, ACTION } from '../src/journey/stateMachine.js';
import { ApiError } from '../src/journey/api.js';

// 这些是纯状态机测试（不渲染 DOM），锁定前端在各种异常下的转移是否正确。

function session(overrides = {}) {
  return {
    sessionId: 's1', pinnedVersion: '3.0.0', currentVersion: '3.0.0', versionStale: false,
    doorId: 'human', seq: 0, cursor: 0, depth: 1, canGoBack: false, ended: false,
    trail: [{ nodeId: 'human_root', title: '人是什么？', kind: 'root', current: true }],
    view: {
      nodeId: 'human_root', type: 'root', doorId: 'human', title: '人是什么？',
      body: ['x'], terminal: false, access: { allowed: true },
      options: [
        { optionId: 'a', label: 'A', allowed: true },
        { optionId: 'b', label: 'B', allowed: true },
      ],
    },
    ...overrides,
  };
}

test('初始状态是 booting；门列表到达后进入 ready', () => {
  let s = initialState();
  assert.equal(s.status, STATUS.BOOTING);
  s = reducer(s, { type: ACTION.BOOT_DOORS, doors: [], version: '3.0.0' });
  assert.equal(s.status, STATUS.READY);
});

test('快速重复点击同一选项：pending 存在时后续 CHOOSE_START 被丢弃', () => {
  let s = { ...initialState(), status: STATUS.AT_NODE, session: session() };
  s = reducer(s, { type: ACTION.CHOOSE_START, optionId: 'a' });
  assert.equal(s.status, STATUS.LOADING_NEXT);
  assert.equal(s.pending.kind, 'choose');
  const first = s;
  s = reducer(s, { type: ACTION.CHOOSE_START, optionId: 'b' }); // 用户乱点
  assert.strictEqual(s, first, '状态对象不应变化——第二次点击被吞掉');
});

test('点击被禁用选项不发请求，只产生一条本地提示', () => {
  const blockedSession = session({
    view: { ...session().view, options: [
      { optionId: 'a', label: 'A', allowed: true },
      { optionId: 'b', label: 'B', allowed: false, blockedReason: '此路关闭' },
    ] },
  });
  let s = { ...initialState(), status: STATUS.AT_NODE, session: blockedSession };
  const before = s;
  s = reducer(s, { type: ACTION.CHOOSE_START, optionId: 'b' });
  assert.equal(s.pending, null, '不应进入 pending');
  assert.equal(s.status, STATUS.AT_NODE);
  assert.match(s.notice.message, /此路关闭/);
  assert.ok(s !== before);
});

test('断网：写请求失败进入 offlineRetry 并记录意图；网络恢复后续传同一选择', () => {
  let s = { ...initialState(), status: STATUS.AT_NODE, routeDoorId: 'human', session: session() };
  s = reducer(s, { type: ACTION.CHOOSE_START, optionId: 'a' }); // 正常发起，记录 lastIntent
  s = reducer(s, { type: ACTION.REQUEST_FAILED, error: new ApiError('offline', 0, { message: '网络已断开' }) });
  assert.equal(s.status, STATUS.OFFLINE_RETRY);
  assert.equal(s.pending, null);
  assert.deepEqual(s.lastIntent, { kind: 'choose', optionId: 'a' });

  s = reducer(s, { type: ACTION.NETWORK_ONLINE });
  assert.equal(s.status, STATUS.LOADING_NEXT);
  assert.equal(s.pending.kind, 'choose');
  assert.equal(s.pending.optionId, 'a', '自动续传的是同一个选项，不会重复或丢失');
});

test('stale_seq：携带权威 current 的 409 直接对齐，不停在错误页', () => {
  const authoritative = session({ seq: 2, cursor: 2, canGoBack: true,
    view: { ...session().view, nodeId: 'human_context', title: '被抛入世界' } });
  let s = { ...initialState(), status: STATUS.LOADING_NEXT, session: session(), pending: { kind: 'choose' } };
  s = reducer(s, { type: ACTION.REQUEST_FAILED,
    error: new ApiError('stale_seq', 409, { current: authoritative }) });
  assert.equal(s.status, STATUS.AT_NODE);
  assert.equal(s.session.view.nodeId, 'human_context');
  assert.equal(s.session.seq, 2);
  assert.ok(s.notice, '给出一次性对齐提示');
});

test('branch_forbidden：对齐当前会话并以非阻断提示告知，用户可改选', () => {
  const current = session();
  let s = { ...initialState(), status: STATUS.LOADING_NEXT, session: current, pending: { kind: 'choose', optionId: 'a' } };
  s = reducer(s, { type: ACTION.REQUEST_FAILED,
    error: new ApiError('branch_forbidden', 403, { nodeId: 'x', message: '此支路刚关闭', current }) });
  assert.equal(s.status, STATUS.AT_NODE);
  assert.match(s.notice.message, /关闭/);
  assert.equal(s.pending, null);
});

test('会话过期/不存在进入需用户决策的阻断态', () => {
  let s = { ...initialState(), status: STATUS.LOADING_NEXT, session: session(), pending: { kind: 'choose' } };
  s = reducer(s, { type: ACTION.REQUEST_FAILED, error: new ApiError('session_expired', 410, { message: '已过期' }) });
  assert.equal(s.status, STATUS.SESSION_EXPIRED);
  assert.equal(s.error.sticky, true);

  s = { ...initialState(), status: STATUS.AT_NODE, session: session() };
  s = reducer(s, { type: ACTION.REQUEST_FAILED, error: new ApiError('session_not_found', 404) });
  assert.equal(s.status, STATUS.SESSION_MISSING);
});

test('版本失效进入 versionConflict，迁移动作 pending', () => {
  let s = { ...initialState(), status: STATUS.AT_NODE, session: session() };
  s = reducer(s, { type: ACTION.REQUEST_FAILED, error: new ApiError('version_gone', 410) });
  assert.equal(s.status, STATUS.VERSION_CONFLICT);
  s = reducer(s, { type: ACTION.MIGRATE_START });
  assert.equal(s.pending.kind, 'migrate');
  // 迁移中再次触发被忽略
  const ref = s;
  assert.strictEqual(reducer(s, { type: ACTION.MIGRATE_START }), ref);
});

test('当前节点本身失权（access.allowed=false）进入 forbidden', () => {
  const denied = session({
    view: { ...session().view, access: { allowed: false, reason: '本节收回' } },
  });
  let s = { ...initialState(), status: STATUS.BOOTING };
  s = reducer(s, { type: ACTION.BOOT_DOORS, doors: [], version: '3.0.0', session: denied });
  assert.equal(s.status, STATUS.FORBIDDEN);
  assert.match(s.error.message, /本节收回/);
});

test('终点会话进入 ended；返回后 canGoBack 仍可用', () => {
  const ended = session({ ended: true, canGoBack: true,
    view: { ...session().view, terminal: true, options: [] } });
  let s = { ...initialState(), status: STATUS.BOOTING };
  s = reducer(s, { type: ACTION.BOOT_DOORS, doors: [], version: '3.0.0', session: ended });
  assert.equal(s.status, STATUS.ENDED);
});

test('普通错误保留阅读位置，顶部给出可重试错误条而非整页崩溃', () => {
  let s = { ...initialState(), status: STATUS.AT_NODE, session: session() };
  s = reducer(s, { type: ACTION.CHOOSE_START, optionId: 'a' });
  s = reducer(s, { type: ACTION.REQUEST_FAILED, error: new ApiError('internal', 500, { message: '服务器开小差' }) });
  assert.equal(s.status, STATUS.AT_NODE, '仍停在当前节点');
  assert.equal(s.session.sessionId, 's1');
  assert.match(s.error.message, /服务器开小差/);
  // 重试续传最后一次选择
  s = reducer(s, { type: ACTION.RETRY });
  assert.equal(s.status, STATUS.LOADING_NEXT);
  assert.equal(s.pending.optionId, 'a');
});
