// 问题之门的服务端引擎：所有分支解析、顺序校验、权限判定、版本钉选都在这里。
// 前端永远拿不到“某个选项通向哪里”，只拿到选项本身；下一跳由本模块解析。

import { buildGraph, CURRENT_VERSION, DOORS } from './graph.js';

// 按版本缓存裁剪后的图。会话一旦创建就钉死在创建时的版本上，
// 之后即使题库升级，旧会话仍按旧图复现。
const graphCache = new Map();
export function getGraph(version) {
  if (!graphCache.has(version)) graphCache.set(version, buildGraph(version));
  return graphCache.get(version);
}

export class EngineError extends Error {
  constructor(code, status, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

// ── 目标解析：静态 id 或条件规则 ──────────────────────────────────────────
function resolveTarget(option, path, graph) {
  if (typeof option.target === 'string') return option.target;
  if (option.target?.rule) {
    const rule = graph.rules[option.target.rule];
    if (!rule) throw new EngineError('rule_missing', 500);
    const history = path.map((nodeId) => ({ nodeId }));
    return rule.resolve(history);
  }
  throw new EngineError('bad_target', 500);
}

// ── 序列化：发给客户端的节点视图（不含 target） ───────────────────────────
function presentNode(node, { path, graph, store, session, atCurrent = true }) {
  const options = (node.options ?? []).map((option) => {
    let allowed = true;
    let blockedReason = null;
    try {
      const targetId = resolveTarget(option, path, graph);
      const targetNode = graph.nodeById.get(targetId);
      if (!targetNode) {
        allowed = false;
        blockedReason = '这个方向在当前版本中已不存在。';
      } else if (store.isNodeRevoked(session, targetId)) {
        allowed = false;
        blockedReason = '这条支路暂时关闭，访问权限已被收回。';
      }
    } catch {
      allowed = false;
      blockedReason = '方向暂时不可解析。';
    }
    return { optionId: option.id, label: option.label, allowed, blockedReason };
  });

  return {
    nodeId: node.id,
    type: node.type,
    doorId: node.door,
    title: node.title,
    kicker: node.kicker ?? null,
    thinker: node.thinker ?? null,
    body: node.body,
    options,
    terminal: node.type === 'terminal',
    relatedThinkers: node.relatedThinkers ?? null,
    relatedDoors: node.relatedDoors ?? null,
    // 当前节点本身被运行时收回权限：前端据此提示并禁止继续停留
    access: atCurrent && store.isNodeRevoked(session, node.id)
      ? { allowed: false, reason: '你所在的这一节刚刚失去访问权限。' }
      : { allowed: true },
  };
}

function serializeSession(session, graph, store) {
  const nodeId = session.path[session.cursor];
  const node = graph.nodeById.get(nodeId);
  if (!node) throw new EngineError('path_corrupt', 500, { nodeId });

  return {
    sessionId: session.id,
    pinnedVersion: session.version,
    currentVersion: CURRENT_VERSION,
    versionStale: session.version !== CURRENT_VERSION,
    doorId: session.doorId,
    seq: session.seq,
    cursor: session.cursor,
    depth: session.path.length,
    canGoBack: session.cursor > 0,
    ended: session.status === 'ended',
    // 已做过的选择只回显 label，供历史轨迹/面包屑使用；不回显分支结构。
    trail: session.path.slice(0, session.cursor + 1).map((id, index) => {
      const n = graph.nodeById.get(id);
      return { nodeId: id, title: n?.title ?? id, kind: n?.type ?? null, current: index === session.cursor };
    }),
    view: presentNode(node, { path: session.path.slice(0, session.cursor + 1), graph, store, session }),
  };
}

// ── 对外操作 ──────────────────────────────────────────────────────────────

export function listDoors() {
  const graph = getGraph(CURRENT_VERSION);
  return { version: CURRENT_VERSION, doors: graph.doors };
}

export function startSession(store, doorId) {
  if (!DOORS.some((door) => door.id === doorId)) {
    throw new EngineError('door_not_found', 404, { doorId });
  }
  const session = store.create({ doorId, version: CURRENT_VERSION });
  // 新建即落在入口；若入口被全局封禁则直接拒绝（极端运维情形）
  const graph = getGraph(session.version);
  store.save();
  return serializeSession(session, graph, store);
}

function locate(store, sessionId) {
  const result = store.locate(sessionId);
  if (result.error === 'missing') throw new EngineError('session_not_found', 404);
  if (result.error === 'expired') {
    throw new EngineError('session_expired', 410, {
      message: '这次探索已经过期，请从门口重新开始。',
    });
  }
  return result.session;
}

// 核心：一次选择。校验顺序 seq → 会话状态 → 选项存在 → 目标权限，全部在服务端。
export function choose(store, sessionId, payload = {}) {
  const session = locate(store, sessionId);
  let graph;
  try {
    graph = getGraph(session.version);
  } catch {
    throw new EngineError('version_gone', 410, { pinnedVersion: session.version });
  }

  if (session.status !== 'active') throw new EngineError('session_ended', 409);

  // 乱序/重复点击防护：客户端必须带着它看到的 seq。
  // 第一个请求成功后 seq 自增，随后到达的同 seq 重复请求一律判定过期。
  if (typeof payload.seq === 'number' && payload.seq !== session.seq) {
    throw new EngineError('stale_seq', 409, {
      expectedSeq: session.seq,
      // 把权威当前状态一并带回，前端可直接对齐，无需再发一次请求。
      current: serializeSession(session, graph, store),
    });
  }

  const currentNodeId = session.path[session.cursor];
  const currentNode = graph.nodeById.get(currentNodeId);
  if (!currentNode) throw new EngineError('path_corrupt', 500, { nodeId: currentNodeId });
  if (currentNode.type === 'terminal') throw new EngineError('already_terminal', 409);

  const option = currentNode.options.find((item) => item.id === payload.optionId);
  if (!option) throw new EngineError('unknown_option', 400, { optionId: payload.optionId });

  const activePath = session.path.slice(0, session.cursor + 1);
  const targetId = resolveTarget(option, activePath, graph);
  const targetNode = graph.nodeById.get(targetId);
  if (!targetNode) throw new EngineError('branch_gone', 410, { nodeId: targetId });
  if (store.isNodeRevoked(session, targetId)) {
    throw new EngineError('branch_forbidden', 403, {
      nodeId: targetId,
      message: '这条支路刚刚失去访问权限，请选择另一个方向。',
      current: serializeSession(session, graph, store),
    });
  }

  // 从历史位置后退再改道：把游标之后仍活跃的选择逐条标记为撤回（审计留痕），
  // 然后截断路径。这样一次“走回去换个方向”也能被完整复现。
  if (session.cursor < session.path.length - 1) {
    const retractCount = session.path.length - 1 - session.cursor;
    let marked = 0;
    for (let i = session.choices.length - 1; i >= 0 && marked < retractCount; i -= 1) {
      if (!session.choices[i].retracted) {
        session.choices[i].retracted = true;
        marked += 1;
      }
    }
    session.path = session.path.slice(0, session.cursor + 1);
  }

  session.seq += 1;
  session.choices.push({
    seq: session.seq,
    from: currentNodeId,
    optionId: option.id,
    to: targetId,
    at: store.now(),
    retracted: false,
  });
  session.path.push(targetId);
  session.cursor = session.path.length - 1;
  if (targetNode.type === 'terminal') session.status = 'ended';
  store.touch(session);
  store.save();

  return serializeSession(session, graph, store);
}

// 服务端后退：不是浏览器历史的视觉把戏，而是真正把探索游标移回上一个节点。
export function goBack(store, sessionId, payload = {}) {
  const session = locate(store, sessionId);
  let graph;
  try {
    graph = getGraph(session.version);
  } catch {
    throw new EngineError('version_gone', 410, { pinnedVersion: session.version });
  }

  if (typeof payload.seq === 'number' && payload.seq !== session.seq) {
    throw new EngineError('stale_seq', 409, {
      expectedSeq: session.seq,
      current: serializeSession(session, graph, store),
    });
  }
  if (session.cursor === 0) throw new EngineError('at_root', 409);

  // 撤回最后一个活跃选择（审计记录保留，可复现整段犹豫与改道）
  for (let i = session.choices.length - 1; i >= 0; i -= 1) {
    if (!session.choices[i].retracted) {
      session.choices[i].retracted = true;
      break;
    }
  }
  session.cursor -= 1;
  if (session.status === 'ended') session.status = 'active'; // 从终点退回，重新开放
  session.seq += 1;
  store.touch(session);
  store.save();

  return serializeSession(session, graph, store);
}

export function getSession(store, sessionId) {
  const session = locate(store, sessionId);
  let graph;
  try {
    graph = getGraph(session.version);
  } catch {
    throw new EngineError('version_gone', 410, { pinnedVersion: session.version });
  }
  store.touch(session);
  return serializeSession(session, graph, store);
}

// 版本迁移：用当前版本的图开新会话，并按旧选项 id 尽可能重放路径，
// 遇到第一个在新版本里不存在/含义改变的岔路口就停下，由用户在那里继续。
// 旧会话原样保留，任何一次历史探索都不会被抹掉。
export function migrateSession(store, sessionId) {
  const old = locate(store, sessionId);
  const nextVersion = CURRENT_VERSION;
  const nextGraph = getGraph(nextVersion);

  const fresh = store.create({ doorId: old.doorId, version: nextVersion });
  let replayed = 0;

  const activeChoices = old.choices.filter((entry) => !entry.retracted);
  for (const choice of activeChoices) {
    const nodeId = fresh.path[fresh.cursor];
    const node = nextGraph.nodeById.get(nodeId);
    if (!node || node.type === 'terminal') break;

    const option = node.options.find((item) => item.id === choice.optionId);
    if (!option) break; // 新版本改了这个岔路口：停在这里

    const activePath = fresh.path.slice(0, fresh.cursor + 1);
    const targetId = resolveTarget(option, activePath, nextGraph);
    const target = nextGraph.nodeById.get(targetId);
    if (!target) break;

    fresh.seq += 1;
    fresh.choices.push({
      seq: fresh.seq, from: nodeId, optionId: option.id, to: targetId,
      at: store.now(), retracted: false, replayedFrom: old.id,
    });
    fresh.path.push(targetId);
    fresh.cursor += 1;
    replayed += 1;
    if (target.type === 'terminal') { fresh.status = 'ended'; break; }
  }

  old.supersededBy = fresh.id;
  store.save();
  return { replayed, total: activeChoices.length, session: serializeSession(fresh, nextGraph, store) };
}

export function endSession(store, sessionId) {
  const session = locate(store, sessionId);
  session.status = 'ended';
  store.save();
  return { ok: true };
}
