// 四扇问题之门 —— 服务端。
// 职责：保存问题版本、分支规则与探索会话；裁决每一次选择。
// 前端只渲染这里下发的状态，不自行推导分支逻辑。
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { questionMeta, questionVersions, trees } from './data.js';

const PORT = Number(process.env.PORT || 3001);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);

// ---------------------------------------------------------------------------
// 会话存储（内存实现；接口与实现分离，可替换为 Redis/数据库而不影响路由层）
// ---------------------------------------------------------------------------
const sessions = new Map();

function pruneSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}
setInterval(pruneSessions, 60 * 1000).unref();

function getLiveSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function touchSession(session) {
  session.expiresAt = Date.now() + SESSION_TTL_MS;
}

// ---------------------------------------------------------------------------
// 分支规则：只在服务端求值
// ---------------------------------------------------------------------------
function evaluateOption(option, session) {
  const visited = new Set(session.path.map((entry) => entry.nodeId));
  const result = { id: option.id, label: option.label };
  if (option.revoked) {
    result.revoked = true;
    result.reason = option.revokedReason || '这条分支暂时不可进入';
  }
  if (option.requires?.visitedAny) {
    const satisfied = option.requires.visitedAny.some((nodeId) => visited.has(nodeId));
    if (!satisfied) {
      result.locked = true;
      result.reason = option.lockedReason || '这条分支还没有对你开放';
    }
  }
  return result;
}

function publicNode(node, session) {
  const view = {
    id: node.id,
    type: node.type,
    title: node.title,
    text: node.text,
  };
  if (node.options) view.options = node.options.map((option) => evaluateOption(option, session));
  if (node.links) view.links = node.links;
  return view;
}

// 会话的完整可复现状态：路径 + 路径上每个节点的内容。
function sessionState(session) {
  const tree = trees[session.questionId];
  const nodes = {};
  for (const entry of session.path) {
    const node = tree.nodes[entry.nodeId];
    if (node) nodes[entry.nodeId] = publicNode(node, session);
  }
  return {
    sessionId: session.id,
    questionId: session.questionId,
    version: session.version,
    expiresAt: session.expiresAt,
    path: session.path,
    nodes,
  };
}

// 依据当前版本的内容树重放选择序列。返回 { path, applied, dropped }。
function replayChoices(questionId, choices) {
  const tree = trees[questionId];
  const path = [{ nodeId: tree.start, via: null }];
  const dropped = [];
  for (const choice of choices || []) {
    const current = tree.nodes[path[path.length - 1].nodeId];
    const option = current?.options?.find((item) => item.id === choice.optionId);
    if (!current || current.id !== choice.nodeId || !option || !tree.nodes[option.next]) {
      dropped.push(choice);
      break; // 内容更新后路径分叉：在此处截断，保证剩余状态一致
    }
    path.push({ nodeId: option.next, via: { optionId: option.id, label: option.label } });
  }
  return { path, applied: path.length - 1, dropped };
}

function createSession(questionId, replay) {
  const { path, applied, dropped } = replayChoices(questionId, replay);
  const session = {
    id: randomUUID(),
    questionId,
    version: questionVersions[questionId],
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    path,
    choiceLog: replay ? replay.slice(0, applied) : [],
    idempotency: new Map(), // clientRequestId -> 已提交的响应，保证重试/双击幂等
  };
  sessions.set(session.id, session);
  return { session, applied, dropped };
}

// ---------------------------------------------------------------------------
// HTTP 辅助
// ---------------------------------------------------------------------------
class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendError(res, error) {
  sendJson(res, error.status, { error: { code: error.code, message: error.message, ...error.extra } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ApiError(400, 'BAD_JSON', '请求体不是合法的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// 路由处理
// ---------------------------------------------------------------------------
async function handleCreateSession(req, res) {
  const body = await readBody(req);
  const questionId = body.questionId;
  if (!trees[questionId]) {
    throw new ApiError(404, 'UNKNOWN_QUESTION', '这扇问题之门不存在');
  }
  if (body.replay !== undefined && !Array.isArray(body.replay)) {
    throw new ApiError(400, 'BAD_REPLAY', 'replay 必须是选择序列');
  }
  const { session, applied, dropped } = createSession(questionId, body.replay);
  sendJson(res, 201, { ...sessionState(session), applied, dropped });
}

function handleGetSession(res, sessionId) {
  const session = getLiveSession(sessionId);
  if (!session) {
    throw new ApiError(410, 'SESSION_EXPIRED', '这段探索会话已过期，需要重新开始');
  }
  touchSession(session);
  sendJson(res, 200, sessionState(session));
}

async function handleSubmitChoice(req, res, sessionId) {
  const session = getLiveSession(sessionId);
  if (!session) {
    throw new ApiError(410, 'SESSION_EXPIRED', '这段探索会话已过期，需要重新开始');
  }
  const body = await readBody(req);
  const { clientRequestId, fromIndex, nodeId, optionId } = body;
  if (typeof clientRequestId !== 'string' || clientRequestId.length === 0) {
    throw new ApiError(400, 'BAD_REQUEST', '缺少 clientRequestId');
  }
  if (!Number.isInteger(fromIndex) || typeof nodeId !== 'string' || typeof optionId !== 'string') {
    throw new ApiError(400, 'BAD_REQUEST', '缺少 fromIndex / nodeId / optionId');
  }

  // 幂等：同一 clientRequestId 的重复提交（双击、重试、断网重发）返回首次结果。
  if (session.idempotency.has(clientRequestId)) {
    touchSession(session);
    sendJson(res, 200, { ...session.idempotency.get(clientRequestId), idempotentReplay: true });
    return;
  }

  // 版本冲突：内容在会话期间更新，交由客户端重放恢复。
  if (session.version !== questionVersions[session.questionId]) {
    throw new ApiError(409, 'VERSION_CONFLICT', '这扇门的内容已更新', {
      version: questionVersions[session.questionId],
    });
  }

  // 路径错位：客户端以为的位置与服务端不一致（前进/后退错乱、并发窗口）。
  const fromEntry = session.path[fromIndex];
  if (!fromEntry || fromEntry.nodeId !== nodeId || fromIndex >= session.path.length) {
    throw new ApiError(409, 'PATH_MISMATCH', '路径与服务端不一致，已为你重新同步', sessionState(session));
  }

  const tree = trees[session.questionId];
  const node = tree.nodes[nodeId];
  const option = node?.options?.find((item) => item.id === optionId);
  if (!node || !option) {
    throw new ApiError(404, 'UNKNOWN_OPTION', '这个选项不存在');
  }
  if (option.revoked) {
    throw new ApiError(403, 'BRANCH_REVOKED', option.revokedReason || '这条分支已被撤回', {
      node: publicNode(node, session),
    });
  }
  if (option.requires?.visitedAny) {
    const visited = new Set(session.path.map((entry) => entry.nodeId));
    const satisfied = option.requires.visitedAny.some((id) => visited.has(id));
    if (!satisfied) {
      throw new ApiError(403, 'BRANCH_LOCKED', option.lockedReason || '这条分支还没有对你开放', {
        node: publicNode(node, session),
      });
    }
  }
  const nextNode = tree.nodes[option.next];
  if (!nextNode) {
    throw new ApiError(410, 'BRANCH_GONE', '这条分支已不在当前版本中');
  }

  // 从过去的某一步做出新选择：截断后续路径再追加，服务端是唯一事实来源。
  session.path = session.path.slice(0, fromIndex + 1);
  session.path.push({ nodeId: nextNode.id, via: { optionId: option.id, label: option.label } });
  session.choiceLog = session.choiceLog.slice(0, fromIndex);
  session.choiceLog.push({ nodeId, optionId });
  touchSession(session);

  const response = { ...sessionState(session), currentIndex: session.path.length - 1 };
  session.idempotency.set(clientRequestId, response);
  if (session.idempotency.size > 200) {
    const oldest = session.idempotency.keys().next().value;
    session.idempotency.delete(oldest);
  }
  sendJson(res, 200, response);
}

// 演示/运维用：递增某扇门的版本号，模拟“内容更新”。
function handleBumpVersion(res, questionId) {
  if (!trees[questionId]) {
    throw new ApiError(404, 'UNKNOWN_QUESTION', '这扇问题之门不存在');
  }
  questionVersions[questionId] += 1;
  sendJson(res, 200, { questionId, version: questionVersions[questionId] });
}

function handleListQuestions(res) {
  sendJson(res, 200, {
    questions: Object.values(questionMeta).map((meta) => ({
      ...meta,
      version: questionVersions[meta.id],
    })),
  });
}

// ---------------------------------------------------------------------------
// 服务器
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const latency = Number(url.searchParams.get('latency') || 0);
  if (latency > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(latency, 5000)));

  try {
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, sessions: sessions.size });
    }
    if (req.method === 'GET' && pathname === '/api/questions') {
      return handleListQuestions(res);
    }
    if (req.method === 'POST' && pathname === '/api/sessions') {
      return await handleCreateSession(req, res);
    }

    let match = pathname.match(/^\/api\/sessions\/([\w-]+)$/);
    if (match && req.method === 'GET') {
      return handleGetSession(res, match[1]);
    }
    match = pathname.match(/^\/api\/sessions\/([\w-]+)\/choices$/);
    if (match && req.method === 'POST') {
      return await handleSubmitChoice(req, res, match[1]);
    }
    match = pathname.match(/^\/api\/admin\/questions\/(\w+)\/bump-version$/);
    if (match && req.method === 'POST') {
      return handleBumpVersion(res, match[1]);
    }

    throw new ApiError(404, 'NOT_FOUND', '接口不存在');
  } catch (error) {
    if (error instanceof ApiError) return sendError(res, error);
    console.error('[gates] unexpected error:', error);
    return sendError(res, new ApiError(500, 'INTERNAL', '服务端开小差了，请稍后再试'));
  }
});

server.listen(PORT, () => {
  console.log(`[gates] 问题之门服务已启动: http://localhost:${PORT} (会话 TTL ${SESSION_TTL_MS / 1000}s)`);
});
