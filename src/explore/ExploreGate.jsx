import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Cloud, Compass, DoorOpen, Loader2, MessageSquare, Reply, RotateCcw, WifiOff, X } from 'lucide-react';
import { api } from './api';
import { initialState, reducer, TYPE_LABELS } from './machine';
import { questions } from '../data';

const TYPE_ICONS = { gate: DoorOpen, answer: MessageSquare, hesitation: Cloud, counter: Reply, exit: Compass };

function parseStep(raw) {
  const n = Number.parseInt(raw ?? '0', 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

export default function ExploreGate() {
  const { questionId, sessionId, step: stepParam } = useParams();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [bootNonce, setBootNonce] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  // ---- 时序与并发守卫 -------------------------------------------------
  const seqRef = useRef(0); // 单调递增的请求序号：过期响应一律丢弃（接口乱序）
  const busyRef = useRef(false); // 选择事务进行中：忽略重复点击
  const mountedRef = useRef(true);
  const pendingRef = useRef(null); // 断网时保留的选择意图（含幂等键）
  const stateRef = useRef(state);
  stateRef.current = state;
  const step = parseStep(stepParam);
  const stepRef = useRef(step);
  stepRef.current = step;
  const headingRef = useRef(null);

  const alive = (seq) => mountedRef.current && seq === seqRef.current;

  useEffect(() => () => { mountedRef.current = false; }, []);

  // ---- 启动：无会话则开门，有会话则取回完整状态 ------------------------
  useEffect(() => {
    const cached = stateRef.current;
    if (sessionId && cached.phase === 'ready' && cached.sessionId === sessionId && cached.questionId === questionId) {
      return; // 状态已与 URL 一致（如创建会话后的重定向），无需再取
    }
    const seq = ++seqRef.current;
    dispatch({ type: 'BOOT_START' });
    (async () => {
      try {
        if (!sessionId) {
          const payload = await api.createSession(questionId);
          if (!alive(seq)) return;
          dispatch({ type: 'STATE_APPLIED', payload });
          navigate(`/explore/${questionId}/${payload.sessionId}/0`, { replace: true });
        } else {
          const payload = await api.getSession(sessionId);
          if (!alive(seq)) return;
          dispatch({ type: 'STATE_APPLIED', payload });
        }
      } catch (err) {
        if (!alive(seq)) return;
        if (err.code === 'SESSION_EXPIRED') {
          // 过期会话的足迹已不可考：如实告知并重新开门
          try {
            const payload = await api.createSession(questionId);
            if (!alive(seq)) return;
            dispatch({ type: 'STATE_APPLIED', payload, notice: { tone: 'info', text: '上一段探索会话已过期，已为你重新开门。' } });
            navigate(`/explore/${questionId}/${payload.sessionId}/0`, { replace: true });
          } catch (err2) {
            if (alive(seq)) dispatch({ type: 'BOOT_FAIL', message: err2.message });
          }
        } else {
          dispatch({ type: 'BOOT_FAIL', message: err.code === 'NETWORK' ? '无法连接档案馆服务，请检查网络后重试。' : err.message });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, sessionId, bootNonce]);

  // ---- 会话恢复：过期 / 版本更新后，用足迹在服务端重放 ------------------
  async function resession(reasonText) {
    const s = stateRef.current;
    const replay = s.path.slice(1).map((entry, i) => ({ nodeId: s.path[i].nodeId, optionId: entry.via.optionId }));
    try {
      const payload = await api.createSession(s.questionId, replay);
      const droppedNote = payload.dropped?.length ? `；其中 ${payload.dropped.length} 步因内容更新未能恢复` : '';
      dispatch({ type: 'STATE_APPLIED', payload, notice: { tone: 'info', text: reasonText + droppedNote } });
      const clamped = Math.min(stepRef.current, payload.path.length - 1);
      navigate(`/explore/${payload.questionId}/${payload.sessionId}/${clamped}`, { replace: true });
      return payload.sessionId;
    } catch (err) {
      dispatch({ type: 'NOTICE', notice: { tone: 'error', text: err.code === 'NETWORK' ? '网络中断，恢复会话失败，联网后请重试。' : `恢复会话失败：${err.message}` } });
      return null;
    }
  }

  // ---- 选择事务：重试上限内自动恢复，其余错误分类呈现 -------------------
  async function runChoice(intent) {
    const seq = ++seqRef.current;
    busyRef.current = true;
    dispatch({ type: 'SUBMIT_START' });
    let sid = stateRef.current.sessionId;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const payload = await api.submitChoice(sid, intent);
          if (!alive(seq)) return;
          dispatch({ type: 'STATE_APPLIED', payload });
          navigate(`/explore/${payload.questionId}/${payload.sessionId}/${payload.currentIndex}`);
          return;
        } catch (err) {
          if (!alive(seq)) return;
          if ((err.code === 'SESSION_EXPIRED' || err.code === 'VERSION_CONFLICT') && attempt < 2) {
            const reason = err.code === 'SESSION_EXPIRED'
              ? '会话已过期，已按你的足迹自动恢复'
              : `这扇门的内容已更新（v${err.payload?.version ?? '?'}），已为你重放路径`;
            const newSid = await resession(reason);
            if (!alive(seq) || !newSid) return;
            sid = newSid;
            continue;
          }
          handleChoiceError(err, intent);
          return;
        }
      }
    } finally {
      if (alive(seq)) {
        busyRef.current = false;
        dispatch({ type: 'SUBMIT_END' });
      }
    }
  }

  function handleChoiceError(err, intent) {
    if (err.code === 'PATH_MISMATCH' && err.payload?.path) {
      // 前进/后退错位：以服务端状态为准整体重同步
      dispatch({ type: 'STATE_APPLIED', payload: err.payload, notice: { tone: 'warn', text: '路径与服务端不一致，已重新同步。' } });
      const clamped = Math.min(stepRef.current, err.payload.path.length - 1);
      navigate(`/explore/${err.payload.questionId}/${err.payload.sessionId}/${clamped}`, { replace: true });
    } else if (err.code === 'BRANCH_REVOKED' || err.code === 'BRANCH_LOCKED') {
      // 分支突然失去访问权限：刷新该节点选项，留在原地
      if (err.payload?.node) dispatch({ type: 'NODE_REFRESH', node: err.payload.node });
      dispatch({ type: 'NOTICE', notice: { tone: 'warn', text: err.message } });
    } else if (err.code === 'NETWORK') {
      pendingRef.current = intent; // 保留同一幂等键，恢复后安全重发
      dispatch({ type: 'SET_OFFLINE', offline: true, hasPending: true });
      dispatch({ type: 'NOTICE', notice: { tone: 'error', text: '网络中断：这次选择已保留，连接恢复后自动继续。' } });
    } else {
      dispatch({ type: 'NOTICE', notice: { tone: 'error', text: err.message } });
    }
  }

  function choose(nodeId, optionId, fromIndex) {
    if (busyRef.current || stateRef.current.phase !== 'ready') return; // 快速重复点击
    runChoice({ clientRequestId: crypto.randomUUID(), nodeId, optionId, fromIndex });
  }

  function retryPending() {
    const intent = pendingRef.current;
    if (!intent) return;
    pendingRef.current = null;
    runChoice(intent);
  }

  const retryPendingRef = useRef(retryPending);
  retryPendingRef.current = retryPending;

  // ---- 断网 / 恢复 ------------------------------------------------------
  useEffect(() => {
    const onOnline = () => {
      dispatch({ type: 'SET_OFFLINE', offline: false });
      if (stateRef.current.phase === 'failed') setBootNonce((n) => n + 1);
      else retryPendingRef.current();
    };
    const onOffline = () => dispatch({ type: 'SET_OFFLINE', offline: true });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ---- 步序钳制：URL 中的 step 超出路径时收敛（前进/后退错位）------------
  const maxStep = state.path.length - 1;
  const safeStep = Math.min(step, Math.max(0, maxStep));
  useEffect(() => {
    if (state.phase !== 'ready' || !state.sessionId) return;
    if (step > maxStep) {
      navigate(`/explore/${state.questionId}/${state.sessionId}/${Math.max(0, maxStep)}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.sessionId, maxStep, step]);

  const entry = state.path[safeStep];
  const node = entry ? state.nodes[entry.nodeId] : null;
  const currentNodeId = node?.id;
  const isViewingPast = state.phase === 'ready' && safeStep < maxStep;

  // ---- 无障碍：焦点与公告 ---------------------------------------------
  useEffect(() => {
    if (state.phase === 'ready' && currentNodeId) headingRef.current?.focus();
  }, [currentNodeId, state.phase]);

  useEffect(() => {
    if (state.phase === 'ready' && node) {
      setAnnouncement(`第 ${safeStep + 1} 步，${TYPE_LABELS[node.type]}：${node.title}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodeId, state.phase]);

  useEffect(() => {
    if (state.notice) setAnnouncement(state.notice.text);
  }, [state.notice]);

  // ---- 键盘：全程可经 Tab / Enter 完成（路径步、选项、上一步均为原生按钮）。
  // 不全局拦截方向键/Backspace，避免劫持屏幕阅读器浏览模式的光标键。
  const goBackRef = useRef(() => {});
  goBackRef.current = () => {
    const s = stateRef.current;
    if (s.phase !== 'ready' || busyRef.current) return;
    const target = Math.min(stepRef.current, s.path.length - 1) - 1;
    if (target >= 0) navigate(`/explore/${s.questionId}/${s.sessionId}/${target}`);
  };

  const meta = questions.find((q) => q.id === questionId);
  const accent = meta?.accent ?? '#c75b3d';

  return (
    <main className="explore-main section-pad" style={{ '--accent': accent }}>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

      <header className="explore-topbar">
        <Link className="back-link" to="/questions">
          <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} aria-hidden="true" />返回问题之门
        </Link>
        <span className="explore-meta">
          {meta ? `GATE ${meta.number}` : 'GATE'} · 内容 v{state.version ?? '—'} · 会话 {state.sessionId ? state.sessionId.slice(0, 8) : '未建立'}
        </span>
      </header>

      {state.notice && (
        <div className={`explore-notice is-${state.notice.tone}`} role={state.notice.tone === 'info' ? 'status' : 'alert'}>
          <span>{state.notice.text}</span>
          <button type="button" aria-label="关闭提示" onClick={() => dispatch({ type: 'CLEAR_NOTICE' })}><X size={15} /></button>
        </div>
      )}

      {state.offline && (
        <div className="explore-offline" role="alert">
          <WifiOff size={16} aria-hidden="true" />
          <span>连接已断开{state.hasPendingIntent ? '，有 1 次选择尚未提交' : ''}。</span>
          <button type="button" onClick={retryPending} disabled={!state.hasPendingIntent}>
            <RotateCcw size={14} aria-hidden="true" />立即重试
          </button>
        </div>
      )}

      {state.phase === 'booting' && (
        <div className="explore-loading" role="status">
          <Loader2 className="spin" size={22} aria-hidden="true" />
          <p>正在开门……</p>
        </div>
      )}

      {state.phase === 'failed' && (
        <div className="explore-failed" role="alert">
          <h1>门暂时打不开。</h1>
          <p>{state.bootError}</p>
          <button type="button" className="text-link as-button" onClick={() => setBootNonce((n) => n + 1)}>
            重试 <RotateCcw size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      {state.phase === 'ready' && node && (
        <>
          <nav className="path-rail" aria-label="已走过的探索路径">
            <ol>
              {state.path.map((item, index) => {
                const itemNode = state.nodes[item.nodeId];
                const isCurrent = index === safeStep;
                return (
                  <li key={`${item.nodeId}-${index}`}>
                    <button
                      type="button"
                      className={isCurrent ? 'path-step is-current' : 'path-step'}
                      aria-current={isCurrent ? 'step' : undefined}
                      onClick={() => navigate(`/explore/${state.questionId}/${state.sessionId}/${index}`)}
                    >
                      <span className="path-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="path-title">{itemNode?.title ?? '……'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <article className={`node-card is-${node.type}`} aria-busy={state.submitting}>
            <span className="node-type">
              {React.createElement(TYPE_ICONS[node.type] ?? MessageSquare, { size: 14, 'aria-hidden': true })}
              {TYPE_LABELS[node.type]} · 第 {safeStep + 1} / {state.path.length} 步
            </span>
            <h1 ref={headingRef} tabIndex={-1}>{node.title}</h1>
            <p className="node-text">{node.text}</p>

            {node.options && (
              <ul className="option-list" aria-label="可选方向">
                {node.options.map((option, index) => {
                  const unavailable = option.locked || option.revoked;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        className="option-button"
                        disabled={state.submitting || unavailable}
                        aria-describedby={option.reason ? `opt-reason-${option.id}` : undefined}
                        onClick={() => choose(node.id, option.id, safeStep)}
                      >
                        <span className="option-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        <span className="option-label">{option.label}</span>
                        {option.locked && <span className="option-flag">未解锁</span>}
                        {option.revoked && <span className="option-flag">已撤回</span>}
                        <ChevronRight size={16} aria-hidden="true" className="option-arrow" />
                      </button>
                      {option.reason && <p className="option-reason" id={`opt-reason-${option.id}`}>{option.reason}</p>}
                    </li>
                  );
                })}
              </ul>
            )}

            {node.links && (
              <div className="exit-links">
                <span className="kicker">继续前往</span>
                <div>
                  {node.links.map((link) => (
                    <Link key={link.to} to={link.to} className="exit-link">
                      {link.label}<ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </article>

          <footer className="explore-actions">
            <button type="button" className="step-back" onClick={() => goBackRef.current()} disabled={safeStep === 0 || state.submitting}>
              <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} aria-hidden="true" />上一步
            </button>
            {isViewingPast && (
              <>
                <p className="fork-hint">你正在回看过去的一步；在这里做出新选择会改写之后的路径。</p>
                <button type="button" className="step-back" onClick={() => navigate(`/explore/${state.questionId}/${state.sessionId}/${maxStep}`)}>
                  回到最新一步<ChevronRight size={15} aria-hidden="true" />
                </button>
              </>
            )}
            <span className="kbd-hint" aria-hidden="true">键盘：Tab 移动 · Enter 选择</span>
          </footer>
        </>
      )}
    </main>
  );
}
