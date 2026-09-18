// 服务端会话存储。默认内存实现（Map），可替换为任何持久化后端：
// 会话、历史、版本钉选全部只活在服务端，前端只持有一个不透明的会话 token。
//
// 会话结构：
// {
//   id, version, doorId, createdAt, updatedAt, expiresAt,
//   path: string[],     // 节点 id 序列（可能长于 cursor+1：后退留下的旧路）
//   cursor: number,     // 当前所在 path 下标；选择时从游标处截断或追加
//   choices: [{ seq, from, optionId, to, at, retracted, replayedFrom? }],
//                        // 只追加的审计日志，连“撤回的改道”也保留，保证可复现
//   seq,                // 单调递增，服务端用它识别乱序/过期请求
//   status,             // 'active' | 'ended'
//   revokedBranches: Set<string>,  // 本会话单独失权的节点
//   supersededBy?,      // 版本迁移后指向新会话
// }

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 2; // 2 小时不活动即过期

export class MemorySessionStore {
  constructor({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
    this.now = now;
    // 节点级“突发失权”名单：管理员/权限系统可随时 revoke，对所有会话即时生效。
    this.globalRevoked = new Set();
  }

  create({ doorId, version }) {
    const now = this.now();
    const id = randomToken();
    const session = {
      id,
      version,
      doorId,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.ttlMs,
      path: [`${doorId}_root`],
      cursor: 0,
      choices: [],
      seq: 0,
      status: 'active',
      revokedBranches: new Set(),
    };
    this.sessions.set(id, session);
    return session;
  }

  // 区分“从未存在”与“曾存在但已过期”，前端据此给出不同的恢复动作。
  locate(id) {
    const session = this.sessions.get(id);
    if (!session) return { error: 'missing' };
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(id);
      return { error: 'expired' };
    }
    return { session };
  }

  get(id) {
    return this.locate(id).session ?? null;
  }

  touch(session) {
    session.updatedAt = this.now();
    session.expiresAt = this.now() + this.ttlMs;
  }

  save() { /* Map 即写即存；持久化后端在此落盘 */ }

  destroy(id) { this.sessions.delete(id); }

  // 供管理员操作/演示“某分支突然失去访问权限”
  revokeNode(nodeId) {
    this.globalRevoked.add(nodeId);
    return { nodeId, revoked: true, at: this.now() };
  }

  restoreNode(nodeId) {
    this.globalRevoked.delete(nodeId);
    return { nodeId, restored: true, at: this.now() };
  }

  isNodeRevoked(session, nodeId) {
    return this.globalRevoked.has(nodeId) || session.revokedBranches.has(nodeId);
  }

  // 周期清理过期会话
  prune() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }
}

function randomToken() {
  // 32 hex chars；不依赖外部加密库
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!bytes[0]) {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
