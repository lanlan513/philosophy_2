// 探索状态机：前端只持有服务端状态的镜像与 UI 相位（phase），
// 路径、版本、分支可用性一律以服务端下发为准。
//
// phase 迁移：
//   booting --BOOT_OK--> ready --BOOT_START(参数变化)--> booting
//   booting --BOOT_FAIL--> failed --BOOT_START(重试)--> booting
//   ready 下 submitting 标记一次选择事务的进行态（防快速重复点击）
export const initialState = {
  phase: 'booting',
  bootError: null,
  submitting: false,
  questionId: null,
  sessionId: null,
  version: null,
  expiresAt: null,
  path: [], // [{ nodeId, via: { optionId, label } | null }]
  nodes: {}, // nodeId -> 服务端下发的节点内容（含已求值的选项状态）
  notice: null, // { tone: 'info' | 'warn' | 'error', text }
  offline: false,
  hasPendingIntent: false, // 断网期间保留了一个未提交的选择
};

export function reducer(state, action) {
  switch (action.type) {
    case 'BOOT_START':
      return { ...initialState, offline: state.offline };
    case 'BOOT_FAIL':
      return { ...state, phase: 'failed', bootError: action.message, submitting: false };
    case 'STATE_APPLIED': {
      // 服务端全量状态（会话创建 / 选择成功 / 错位重同步 / 重放恢复）
      const p = action.payload;
      return {
        ...state,
        phase: 'ready',
        bootError: null,
        questionId: p.questionId,
        sessionId: p.sessionId,
        version: p.version,
        expiresAt: p.expiresAt,
        path: p.path,
        nodes: p.nodes,
        offline: false,
        hasPendingIntent: false,
        notice: action.notice !== undefined ? action.notice : state.notice,
      };
    }
    case 'NODE_REFRESH': {
      // 分支被撤回/锁定后，服务端回传的当前节点最新状态
      const node = action.node;
      if (!node) return state;
      return { ...state, nodes: { ...state.nodes, [node.id]: node } };
    }
    case 'SUBMIT_START':
      return { ...state, submitting: true };
    case 'SUBMIT_END':
      return { ...state, submitting: false };
    case 'NOTICE':
      return { ...state, notice: action.notice };
    case 'CLEAR_NOTICE':
      return { ...state, notice: null };
    case 'SET_OFFLINE':
      return { ...state, offline: action.offline, hasPendingIntent: action.hasPending ?? state.hasPendingIntent };
    default:
      return state;
  }
}

export const TYPE_LABELS = {
  gate: '入口',
  answer: '回答',
  hesitation: '犹豫',
  counter: '反问',
  exit: '出口',
};
