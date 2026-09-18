import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemorySessionStore } from './session-store.js';
import { getGraph, choose, goBack, listDoors, migrateSession, startSession, getSession, EngineError } from './engine.js';
import { CURRENT_VERSION } from './graph.js';

function makeStore(now = 1000) {
  let clock = now;
  const store = new MemorySessionStore({ ttlMs: 100, now: () => clock });
  return {
    store,
    advance(ms) { clock += ms; },
  };
}

test('门列表暴露四个问题与当前版本', () => {
  const payload = listDoors();
  assert.equal(payload.version, CURRENT_VERSION);
  assert.deepEqual(payload.doors.map((d) => d.id), ['human', 'knowledge', 'real', 'life']);
});

test('节点视图不泄露分支目标，只返回选项标签与权限', () => {
  const { store } = makeStore();
  const session = startSession(store, 'human');
  assert.ok(session.view.options.every((o) => !('target' in o)));
  assert.deepEqual(session.view.options.map((o) => o.allowed), [true, true, true]);
  assert.equal(session.pinnedVersion, CURRENT_VERSION);
  assert.equal(session.canGoBack, false);
});

test('一条完整路径：回答 → 反问 → 犹豫 → 终点，seq 单调递增', () => {
  const { store } = makeStore();
  let s = startSession(store, 'human');
  assert.equal(s.seq, 0);

  s = choose(store, s.sessionId, { optionId: 'h_r_1', seq: s.seq }); // 灵魂
  assert.equal(s.view.nodeId, 'human_soul');
  assert.equal(s.view.type, 'answer');
  assert.equal(s.seq, 1);
  assert.ok(s.canGoBack);

  s = choose(store, s.sessionId, { optionId: 'h_s_1', seq: s.seq }); // 身体反问
  assert.equal(s.view.nodeId, 'human_body_ask');
  assert.equal(s.view.type, 'counter');

  s = choose(store, s.sessionId, { optionId: 'h_b_1', seq: s.seq }); // 习惯
  s = choose(store, s.sessionId, { optionId: 'h_h_1', seq: s.seq }); // 收束终点
  assert.equal(s.view.nodeId, 'human_terminal_synthesis');
  assert.equal(s.ended, true);
  assert.equal(s.view.terminal, true);
});

test('条件规则：同一选项因历史不同落向不同节点', () => {
  // 路径 A：先经过“理性”分支，再触发 REAL_PHENOMENA → 落向 reason 版本
  const a = makeStore();
  let s = startSession(a.store, 'real');
  s = choose(a.store, s.sessionId, { optionId: 'r_r_2', seq: s.seq }); // real_reason
  s = choose(a.store, s.sessionId, { optionId: 'k_rs2_1', seq: s.seq }); // real_forms
  s = choose(a.store, s.sessionId, { optionId: 'r_f_2', seq: s.seq }); // 条件规则 REAL_PHENOMENA
  assert.equal(s.view.nodeId, 'real_phenomena_reason');

  // 路径 B：从感官 → 错觉，触发同一规则 → 落向 senses 版本
  const b = makeStore();
  let u = startSession(b.store, 'real');
  u = choose(b.store, u.sessionId, { optionId: 'r_r_1', seq: u.seq }); // real_senses
  u = choose(b.store, u.sessionId, { optionId: 'r_s_1', seq: u.seq }); // real_illusion
  u = choose(b.store, u.sessionId, { optionId: 'r_i_2', seq: u.seq }); // 同一条件规则
  assert.equal(u.view.nodeId, 'real_phenomena_senses');

  // 路径 C：先经语言 → 此在 → 触发同一规则 → 落向 language 版本
  const c = makeStore();
  let v = startSession(c.store, 'real');
  v = choose(c.store, v.sessionId, { optionId: 'r_r_3', seq: v.seq }); // real_language
  v = choose(c.store, v.sessionId, { optionId: 'r_l_2', seq: v.seq }); // real_dasein
  v = choose(c.store, v.sessionId, { optionId: 'r_d_3', seq: v.seq }); // 同一条件规则
  assert.equal(v.view.nodeId, 'real_phenomena_language');
});

test('乱序/重复请求：过期 seq 被拒绝并返回权威 current', () => {
  const { store } = makeStore();
  const s0 = startSession(store, 'human');
  const first = choose(store, s0.sessionId, { optionId: 'h_r_1', seq: 0 });
  assert.equal(first.seq, 1);

  // 用户快速双击，第二个请求仍带 seq=0
  assert.throws(
    () => choose(store, s0.sessionId, { optionId: 'h_r_1', seq: 0 }),
    (error) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.code, 'stale_seq');
      assert.equal(error.status, 409);
      assert.equal(error.extra.current.seq, 1);
      assert.equal(error.extra.current.view.nodeId, 'human_soul');
      return true;
    },
  );

  // 正确 seq 继续工作，说明没有产生重复跳转
  const next = choose(store, s0.sessionId, { optionId: 'h_s_1', seq: 1 });
  assert.equal(next.view.nodeId, 'human_body_ask');
});

test('服务端后退：游标回退、选择被标记撤回、改道后旧路不复活', () => {
  const { store } = makeStore();
  let s = startSession(store, 'human');
  s = choose(store, s.sessionId, { optionId: 'h_r_1', seq: 0 }); // soul
  const soulSessionId = s.sessionId;
  s = choose(store, s.sessionId, { optionId: 'h_s_1', seq: 1 }); // body_ask
  assert.equal(s.cursor, 2);

  s = goBack(store, soulSessionId, { seq: 2 });
  assert.equal(s.view.nodeId, 'human_soul');
  assert.equal(s.cursor, 1);
  assert.equal(s.seq, 3);
  assert.equal(s.ended, false);

  // 改道：走向“今天还成立吗”
  s = choose(store, soulSessionId, { optionId: 'h_s_2', seq: 3 });
  assert.equal(s.view.nodeId, 'human_soul_doubt');

  // 审计日志保留撤回记录，可完整复现犹豫与改道
  const raw = store.locate(soulSessionId).session;
  assert.ok(raw.choices.some((c) => c.retracted && c.to === 'human_body_ask'));
  assert.ok(raw.choices.some((c) => !c.retracted && c.to === 'human_soul_doubt'));
});

test('分支突然失权：目标节点被 revoke 后选择被 403 拒绝，选项在视图中标记禁用', () => {
  const { store } = makeStore();
  let s = startSession(store, 'human');
  store.revokeNode('human_soul'); // 管理员此刻收回该分支

  s = getSession(store, s.sessionId);
  const soulOption = s.view.options.find((o) => o.optionId === 'h_r_1');
  assert.equal(soulOption.allowed, false);
  assert.match(soulOption.blockedReason, /暂时关闭/);

  assert.throws(
    () => choose(store, s.sessionId, { optionId: 'h_r_1', seq: s.seq }),
    (error) => error.code === 'branch_forbidden' && error.status === 403,
  );

  // 另一条路仍然畅通
  const alt = choose(store, s.sessionId, { optionId: 'h_r_2', seq: s.seq });
  assert.equal(alt.view.nodeId, 'human_context');
});

test('会话级失权不影响其它会话', () => {
  const { store } = makeStore();
  const a = startSession(store, 'human');
  const b = startSession(store, 'human');
  const rawA = store.locate(a.sessionId).session;
  rawA.revokedBranches.add('human_soul');

  const aView = getSession(store, a.sessionId);
  assert.equal(aView.view.options.find((o) => o.optionId === 'h_r_1').allowed, false);
  const bView = getSession(store, b.sessionId);
  assert.equal(bView.view.options.find((o) => o.optionId === 'h_r_1').allowed, true);
});

test('会话过期：超过 TTL 后返回 session_expired(410)，并与“不存在”区分', () => {
  const { store, advance } = makeStore();
  const s = startSession(store, 'human');
  advance(50);
  assert.equal(store.locate(s.sessionId).error, undefined);
  advance(51); // 合计 101 > ttl 100
  // locate 是“探测”：返回 expired 且按定义删除会话，因此只第一次得到 410，
  // 之后同一 token 与从未存在的 token 一样返回 404。
  const located = store.locate(s.sessionId);
  assert.equal(located.error, 'expired');
  assert.throws(
    () => getSession(store, s.sessionId),
    (error) => error.code === 'session_not_found' && error.status === 404,
  );
  assert.throws(
    () => getSession(store, 'nonexistent-token'),
    (error) => error.code === 'session_not_found' && error.status === 404,
  );
});

test('过期但尚未被探测的会话，GET 返回 410 session_expired', () => {
  const { store, advance } = makeStore();
  const s = startSession(store, 'human');
  advance(101);
  // 不先调用 store.locate，直接走引擎（模拟真实 HTTP：会话已死但还在表里）
  assert.throws(
    () => getSession(store, s.sessionId),
    (error) => error.code === 'session_expired' && error.status === 410,
  );
});

test('版本钉选：旧会话不受新版本题库影响，且视图暴露 versionStale', () => {
  const v3 = getGraph('3.0.0');
  assert.ok(v3.nodeById.has('knowledge_def'), 'v3 应有知识定义入口');
  assert.ok(v3.nodeById.has('real_language'), 'v3 应有语言入口');

  const v1 = getGraph('1.0.0');
  assert.equal(v1.nodeById.has('knowledge_def'), false, 'v1 不应包含后加节点');
  assert.equal(v1.nodeById.has('real_language'), false);

  // v1 知识门的根只有 2 个选项（“先定义知道”入口在 v3 才加入）
  const v1Root = v1.nodeById.get('knowledge_root');
  assert.equal(v1Root.options.length, 2);
  assert.equal(v1Root.options.some((o) => o.id === 'k_r_3'), false);

  // v2 有城邦支路但没有斯多葛（斯多葛是 v3 才补入的）
  const v2 = getGraph('2.0.0');
  assert.equal(v2.nodeById.has('life_polis'), true);
  assert.equal(v2.nodeById.has('life_stoic'), false);

  // v1 两者都没有，且习惯之问的中道直接收束到繁盛终点
  const v1Life = getGraph('1.0.0');
  assert.equal(v1Life.nodeById.has('life_polis'), false);
  assert.equal(v1Life.nodeById.has('life_stoic'), false);
  const v1Habit = v1Life.nodeById.get('life_habit');
  assert.ok(v1Habit.options.some((o) => o.target === 'life_terminal_flourish'));
});

test('版本迁移：按选项 id 重放，旧会话保留，在新岔路口停下', () => {
  // 手工构造一个 v1 会话：只能通过内部 store 注入旧版本
  const { store } = makeStore();
  const old = store.create({ doorId: 'knowledge', version: '1.0.0' });
  const v1Graph = getGraph('1.0.0');

  // v1: root(2 选项) → exp → cause → doubt → terminal_doubt
  const walk = (graph, optionIds) => {
    for (const optionId of optionIds) {
      const node = graph.nodeById.get(old.path[old.cursor]);
      const option = node.options.find((o) => o.id === optionId);
      // 用 v1 引擎手工推进
      old.seq += 1;
      const target = option.target;
      old.choices.push({ seq: old.seq, from: node.id, optionId, to: target, at: 0, retracted: false });
      old.path.push(target);
      old.cursor += 1;
    }
  };
  walk(v1Graph, ['k_r_1', 'k_e_1', 'k_c_1', 'k_d_1']); // 到 knowledge_terminal_doubt
  assert.equal(old.path[old.cursor], 'knowledge_terminal_doubt');

  const result = migrateSession(store, old.id);
  // 四个岔路口在 v3 中都还在（选项 id 与落点一致），因此完整重放 4 步抵达终点；
  // 一旦某个岔路口在新版被改动，迁移会在那之前停下并交还选择权。
  assert.equal(result.total, 4);
  assert.equal(result.replayed, 4);
  assert.equal(result.session.view.nodeId, 'knowledge_terminal_doubt');
  assert.equal(result.session.pinnedVersion, '3.0.0');

  // 旧会话仍在（用于复现），并记录了后继
  const oldStill = store.locate(old.id).session;
  assert.equal(oldStill.supersededBy, result.session.sessionId);
});

test('版本迁移在第一个被改动的岔路口停下', () => {
  const { store } = makeStore();
  const old = store.create({ doorId: 'knowledge', version: '1.0.0' });
  const v1Graph = getGraph('1.0.0');

  // 手工走到 v1 根 → 经验 → 因果，再补一条“被新版删除的选项” k_df_1。
  // k_df_1 在 v1 属于 knowledge_def，但此处构造一个从 knowledge_cause 出发、
  // 使用新版已不存在选项 id 的选择，模拟“旧版有、新版删”的岔路。
  for (const optionId of ['k_r_1', 'k_e_1']) {
    const node = v1Graph.nodeById.get(old.path[old.cursor]);
    const option = node.options.find((o) => o.id === optionId);
    old.seq += 1;
    old.choices.push({ seq: old.seq, from: node.id, optionId, to: option.target, at: 0, retracted: false });
    old.path.push(option.target);
    old.cursor += 1;
  }
  // 旧版这里做过一个在 v3 已被删除的选择 id
  old.seq += 1;
  old.choices.push({ seq: 3, from: 'knowledge_cause', optionId: 'k_df_1', to: 'knowledge_exp', at: 0, retracted: false });
  old.path.push('knowledge_exp');
  old.cursor = 3;

  const result = migrateSession(store, old.id);
  assert.equal(result.total, 3);
  assert.equal(result.replayed, 2, '重放到被删除选项之前停下');
  assert.equal(result.session.view.nodeId, 'knowledge_cause', '停在出问题的岔路口，交还选择权');
  assert.equal(result.session.pinnedVersion, '3.0.0');
});

test('非法 doorId / 未知选项 / 终点继续选择都被拒绝', () => {
  const { store } = makeStore();
  assert.throws(() => startSession(store, 'nope'), (e) => e.code === 'door_not_found' && e.status === 404);

  let s = startSession(store, 'human');
  assert.throws(() => choose(store, s.sessionId, { optionId: 'bogus', seq: 0 }),
    (e) => e.code === 'unknown_option' && e.status === 400);

  // 走到终点后再选择
  s = choose(store, s.sessionId, { optionId: 'h_r_3', seq: 0 }); // question
  s = choose(store, s.sessionId, { optionId: 'h_q_3', seq: 1 }); // method
  s = choose(store, s.sessionId, { optionId: 'h_m_1', seq: 2 }); // terminal_method
  assert.equal(s.ended, true);
  assert.throws(() => choose(store, s.sessionId, { optionId: 'x', seq: 3 }),
    (e) => e.code === 'session_ended');
});

test('根节点不能后退', () => {
  const { store } = makeStore();
  const s = startSession(store, 'human');
  assert.throws(() => goBack(store, s.sessionId, { seq: 0 }), (e) => e.code === 'at_root');
});
