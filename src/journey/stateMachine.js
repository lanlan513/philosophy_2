// 问题之门的前端状态机 + 执行层。
//
// 状态（status）：
//   booting           首次挂载，正在拉取门列表 / 恢复会话
//   ready             门已就绪，停在门廊（尚未进入一扇门）
//   starting          正在创建会话（点了某扇门）
//   atNode            已在一条路径的某个节点上（idle，可选择/返回）
//   loadingNext       选择已提交、等待下一节（期间禁用所有交互，防重复点击）
//   loadingBack       正在服务端后退
//   offlineRetry      请求因断网失败，等待网络恢复自动重试
//   sessionExpired    会话已在服务端过期
//   sessionMissing    token 对应的会话不存在
//   versionConflict   服务端题库已升级，本会话钉在旧版本，等待迁移决定
//   forbidden         当前节点本身失去访问权限
//   ended             到达终点（仍可返回上一节或从门廊重开）
//   failed            其它未预期错误
//
// 不变量：
//   - 任何写操作都携带服务端下发的 seq；服务端用它拒绝乱序请求（stale_seq）。
//   - 同时只有一个 pending 写请求，重复触发直接被 reducer 丢弃（快速点击安全）。
//   - 服务端响应是权威状态；stale_seq / forbidden 响应附带 current，直接对齐。

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { api, ApiError } from './api.js';

export const STATUS = {
  BOOTING: 'booting', READY: 'ready', STARTING: 'starting',
  AT_NODE: 'atNode', LOADING_NEXT: 'loadingNext', LOADING_BACK: 'loadingBack',
  OFFLINE_RETRY: 'offlineRetry', SESSION_EXPIRED: 'sessionExpired',
  SESSION_MISSING: 'sessionMissing', VERSION_CONFLICT: 'versionConflict',
  FORBIDDEN: 'forbidden', ENDED: 'ended', FAILED: 'failed',
};

export const ACTION = {
  BOOT_DOORS: 'BOOT_DOORS',
  BOOT_SESSION: 'BOOT_SESSION',
  ENTER_START: 'ENTER_START',
  CHOOSE_START: 'CHOOSE_START',
  BACK_START: 'BACK_START',
  SESSION_LOADED: 'SESSION_LOADED',
  REQUEST_FAILED: 'REQUEST_FAILED',
  NETWORK_ONLINE: 'NETWORK_ONLINE',
  MIGRATE_START: 'MIGRATE_START',
  RETRY: 'RETRY',
  EXIT: 'EXIT',
  DISMISS_NOTICE: 'DISMISS_NOTICE',
};

export function initialState() {
  return {
    status: STATUS.BOOTING,
    doors: [],
    doorsVersion: null,
    session: null,        // 服务端权威会话对象
    routeDoorId: null,    // 当前 URL 指定的门
    pending: null,        // { kind, optionId? }
    error: null,          // { code, message, sticky }
    notice: null,         // 非阻断提示
    lastIntent: null,     // 断网恢复后要续上的最后一次写操作
  };
}

function adoptSession(session) {
  const migration = session._migration;
  const notice = migration
    ? {
      id: `migrated:${session.sessionId}`,
      message: migration.replayed > 0
        ? `问题库已升级：已按新版本重放前 ${migration.replayed} 个选择，请在新的岔路口继续。`
        : '问题库已升级：入口处就有新的岔路，请重新选择。',
    }
    : undefined;
  const patch = { ...(notice ? { notice } : {}) };
  if (session.view?.access?.allowed === false) {
    return { session, status: STATUS.FORBIDDEN, error: { code: 'node_forbidden', message: session.view.access.reason }, ...patch };
  }
  if (session.ended) return { session, status: STATUS.ENDED, error: null, ...patch };
  return { session, status: STATUS.AT_NODE, error: null, ...patch };
}

export function reducer(state, action) {
  switch (action.type) {
    case ACTION.BOOT_DOORS:
      return {
        ...state, doors: action.doors, doorsVersion: action.version,
        status: action.session ? undefined : STATUS.READY,
        ...(action.session ? adoptSession(action.session) : {}),
      };

    case ACTION.BOOT_SESSION:
      if (action.missing) return { ...state, status: STATUS.READY, session: null };
      return { ...state, ...adoptSession(action.session) };

    case ACTION.ENTER_START:
      if (state.pending) return state;
      return { ...state, status: STATUS.STARTING, routeDoorId: action.doorId, pending: { kind: 'start', nonce: action.nonce }, error: null, notice: null };

    case ACTION.CHOOSE_START: {
      if (state.pending) return state;
      const option = state.session?.view?.options?.find((o) => o.optionId === action.optionId);
      if (!option) return state;
      if (option.allowed === false) {
        return { ...state, notice: { id: action.optionId, message: option.blockedReason ?? '这个方向暂时不可通行。' } };
      }
      return {
        ...state, status: STATUS.LOADING_NEXT,
        pending: { kind: 'choose', optionId: action.optionId },
        lastIntent: { kind: 'choose', optionId: action.optionId },
        error: null, notice: null,
      };
    }

    case ACTION.BACK_START:
      if (state.pending || !state.session?.canGoBack) return state;
      return {
        ...state, status: STATUS.LOADING_BACK, pending: { kind: 'back' },
        lastIntent: { kind: 'back' }, error: null, notice: null,
      };

    case ACTION.SESSION_LOADED:
      return { ...state, pending: null, ...adoptSession(action.session) };

    case ACTION.REQUEST_FAILED: {
      const { error } = action;
      const base = { ...state, pending: null };

      if (error.code === 'offline' || error.code === 'network') {
        return { ...base, status: STATUS.OFFLINE_RETRY, error: { code: error.code, message: error.message } };
      }
      if (error.code === 'stale_seq' && error.payload?.current) {
        return { ...base, ...adoptSession(error.payload.current),
          notice: { id: `stale:${error.payload.current.seq}`, message: '操作顺序与服务端不一致，界面已自动对齐。' } };
      }
      if (error.code === 'session_expired') {
        return { ...base, status: STATUS.SESSION_EXPIRED, error: { code: error.code, message: error.message, sticky: true } };
      }
      if (error.code === 'session_not_found') {
        return { ...base, status: STATUS.SESSION_MISSING, error: { code: error.code, sticky: true } };
      }
      if (error.code === 'version_gone') {
        return { ...base, status: STATUS.VERSION_CONFLICT, error: { code: 'version_conflict', sticky: true } };
      }
      if (error.code === 'branch_forbidden') {
        return {
          ...base, ...(error.payload?.current ? adoptSession(error.payload.current) : { status: STATUS.AT_NODE }),
          notice: { id: `forbidden:${error.payload?.nodeId ?? ''}`,
            message: error.payload?.message ?? '这条支路刚刚失去访问权限，请选择另一个方向。' },
        };
      }
      if (error.code === 'branch_gone' || error.code === 'unknown_option') {
        return { ...base, status: STATUS.AT_NODE,
          notice: { id: error.code, message: '这个方向在当前版本中已不存在，请改选其它入口。' } };
      }
      if (error.code === 'already_terminal') {
        return { ...base, ...(error.payload?.current ? adoptSession(error.payload.current) : { status: STATUS.ENDED }) };
      }
      if (error.code === 'at_root') return { ...base, status: STATUS.AT_NODE };

      return {
        ...base,
        status: state.session ? (state.session.ended ? STATUS.ENDED : STATUS.AT_NODE) : STATUS.FAILED,
        error: { code: error.code ?? 'failed', message: error.message ?? '请求失败，请重试。' },
      };
    }

    case ACTION.NETWORK_ONLINE: {
      if (state.status !== STATUS.OFFLINE_RETRY) return state;
      const intent = state.lastIntent;
      if (intent?.kind === 'choose') {
        return { ...state, status: STATUS.LOADING_NEXT, pending: { kind: 'choose', optionId: intent.optionId }, error: null };
      }
      if (intent?.kind === 'back') {
        return { ...state, status: STATUS.LOADING_BACK, pending: { kind: 'back' }, error: null };
      }
      if (state.routeDoorId) {
        return { ...state, status: STATUS.STARTING, pending: { kind: 'start' }, error: null };
      }
      return { ...state, status: state.session ? STATUS.AT_NODE : STATUS.READY, error: null };
    }

    case ACTION.MIGRATE_START:
      if (state.pending) return state;
      return { ...state, pending: { kind: 'migrate' }, error: null };

    case ACTION.RETRY: {
      if (state.pending) return state;
      const intent = state.lastIntent;
      if (intent?.kind === 'choose') {
        return { ...state, status: STATUS.LOADING_NEXT, pending: { kind: 'choose', optionId: intent.optionId }, error: null };
      }
      if (intent?.kind === 'back') {
        return { ...state, status: STATUS.LOADING_BACK, pending: { kind: 'back' }, error: null };
      }
      if (state.routeDoorId) {
        return { ...state, status: STATUS.STARTING, pending: { kind: 'start' }, error: null };
      }
      return { ...state, status: state.session ? STATUS.AT_NODE : STATUS.BOOTING, error: null };
    }

    case ACTION.EXIT:
      return { ...initialState(), doors: state.doors, doorsVersion: state.doorsVersion, status: STATUS.READY };

    case ACTION.DISMISS_NOTICE:
      return { ...state, notice: null };

    default:
      return state;
  }
}

function isOfflineError(error) {
  return error.code === 'offline' || error.code === 'network';
}

export function useJourney({ doorId, resumeToken }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const bootedRef = useRef(false);
  const startedForDoorRef = useRef(null);
  const startNonceRef = useRef(0);

  // ── 启动：门列表 + 可选的会话恢复 ─────────────────────────────────────
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    let cancelled = false;
    (async () => {
      let doorsPayload = null;
      try {
        doorsPayload = await api.doors();
      } catch (error) {
        if (!cancelled) dispatch({ type: ACTION.REQUEST_FAILED, error });
        return;
      }
      if (cancelled) return;

      if (!resumeToken) {
        dispatch({ type: ACTION.BOOT_DOORS, doors: doorsPayload.doors, version: doorsPayload.version });
        return;
      }
      try {
        const session = await api.resume(resumeToken);
        if (!cancelled) dispatch({ type: ACTION.BOOT_DOORS, doors: doorsPayload.doors, version: doorsPayload.version, session });
      } catch (error) {
        if (cancelled) return;
        // 刷新时会话已过期/不存在：安静地落回门廊，仍把门列表准备好
        if (error.code === 'session_expired' || error.code === 'session_not_found') {
          dispatch({ type: ACTION.BOOT_DOORS, doors: doorsPayload.doors, version: doorsPayload.version });
        } else if (isOfflineError(error)) {
          dispatch({ type: ACTION.BOOT_DOORS, doors: doorsPayload.doors, version: doorsPayload.version });
          dispatch({ type: ACTION.REQUEST_FAILED, error });
        } else {
          dispatch({ type: ACTION.REQUEST_FAILED, error });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [resumeToken]);

  // 路由变化（点了另一扇门 / 首次进入且无 token 可恢复）：启动新会话。
  // 只在“空闲态”触发：booting 由启动 effect 处理；loading/阻断态交给各自的恢复动作。
  const activeDoor = state.session?.doorId ?? null;
  useEffect(() => {
    if (!doorId || state.status === STATUS.BOOTING) return;
    if (state.pending) return;

    const idleHere = state.status === STATUS.AT_NODE || state.status === STATUS.ENDED;
    if (idleHere && activeDoor === doorId) {
      startedForDoorRef.current = doorId; // 已在此门，无需新建
      return;
    }
    // 阻断/错误态不自动新建，避免覆盖用户正在做的恢复决策
    const blocked = [
      STATUS.OFFLINE_RETRY, STATUS.SESSION_EXPIRED, STATUS.SESSION_MISSING,
      STATUS.VERSION_CONFLICT, STATUS.FORBIDDEN, STATUS.LOADING_NEXT,
      STATUS.LOADING_BACK, STATUS.STARTING,
    ].includes(state.status);
    if (blocked) return;

    // ready / failed：仅在尚未为当前门发起过 start 时发起（去重快速重渲染）
    if (startedForDoorRef.current === doorId && state.status !== STATUS.FAILED) return;
    startedForDoorRef.current = doorId;
    startNonceRef.current += 1;
    dispatch({ type: ACTION.ENTER_START, doorId, nonce: startNonceRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorId, state.status, state.pending, activeDoor]);

  // ── pending 执行层：reducer 只描述“要做什么”，这里真正发请求 ───────────
  useEffect(() => {
    const pending = state.pending;
    if (!pending) return;
    let cancelled = false;

    const fail = (error) => { if (!cancelled) dispatch({ type: ACTION.REQUEST_FAILED, error }); };
    const ok = (session) => { if (!cancelled) dispatch({ type: ACTION.SESSION_LOADED, session }); };

    (async () => {
      const current = stateRef.current.session;
      try {
        if (pending.kind === 'start') {
          ok(await api.start(state.routeDoorId ?? doorId, pending.nonce));
        } else if (!current) {
          fail(new ApiError('no_session', 0, { message: '会话不存在' }));
        } else if (pending.kind === 'choose') {
          ok(await api.choose(current.sessionId, pending.optionId, current.seq));
        } else if (pending.kind === 'back') {
          ok(await api.back(current.sessionId, current.seq));
        } else if (pending.kind === 'migrate') {
          const result = await api.migrate(current.sessionId);
          if (!cancelled) {
            dispatch({
              type: ACTION.SESSION_LOADED,
              session: {
                ...result.session,
                // 迁移说明随会话一起带入，渲染层展示一次后由 DISMISS_NOTICE 清掉
                _migration: { replayed: result.replayed, total: result.total },
              },
            });
          }
        }
      } catch (error) {
        fail(error instanceof ApiError ? error : new ApiError('failed', 0, { message: String(error) }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pending]);

  // ── 断网 / 恢复：离线时挂起，网络回来自动续上最后一次操作 ───────────────
  useEffect(() => {
    const onOnline = () => dispatch({ type: ACTION.NETWORK_ONLINE });
    const onOffline = () => { /* navigator.onLine=false 会在下一次请求失败时体现 */ };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const chooseOption = useCallback((optionId) => dispatch({ type: ACTION.CHOOSE_START, optionId }), []);
  const back = useCallback(() => dispatch({ type: ACTION.BACK_START }), []);
  const migrate = useCallback(() => dispatch({ type: ACTION.MIGRATE_START }), []);
  const retry = useCallback(() => dispatch({ type: ACTION.RETRY }), []);
  const exit = useCallback(() => dispatch({ type: ACTION.EXIT }), []);
  const dismissNotice = useCallback(() => dispatch({ type: ACTION.DISMISS_NOTICE }), []);

  return useMemo(() => ({
    state, actions: { chooseOption, back, migrate, retry, exit, dismissNotice },
  }), [state, chooseOption, back, migrate, retry, exit, dismissNotice]);
}
