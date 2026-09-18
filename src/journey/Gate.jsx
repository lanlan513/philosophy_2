import React, { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ChevronRight, Loader2, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { STATUS, useJourney } from './stateMachine.js';
import { useJourneyKeys } from './keyboard.js';
import { clearToken, readToken, saveToken } from './tokenStore.js';

const TYPE_LABEL = {
  root: '门口',
  answer: '一条回答',
  hesitation: '一次犹豫',
  counter: '一次反问',
  terminal: '路径终点',
};

const TYPE_PREFIX = {
  answer: '回答 · ',
  hesitation: '犹豫 · ',
  counter: '反问 · ',
};

export function Gate({ door, onExitToQuestions }) {
  const resumeToken = readToken(door.id);
  const navigate = useNavigate();
  const { state, actions } = useJourney({ doorId: door.id, resumeToken });
  const { status, session, error, notice, pending } = state;

  const listRef = useRef(null);
  const headingRef = useRef(null);
  const lastNodeRef = useRef(null);
  const panelRef = useRef(null);

  const busy = pending !== null || status === STATUS.STARTING || status === STATUS.LOADING_NEXT || status === STATUS.LOADING_BACK;
  const inPath = Boolean(session);

  // 会话建立/变更：登记 token；过期或丢失则清除
  useEffect(() => {
    if (session?.sessionId) saveToken(session.doorId, session.sessionId);
  }, [session?.sessionId, session?.doorId]);

  useEffect(() => {
    if (status === STATUS.SESSION_EXPIRED || status === STATUS.SESSION_MISSING) clearToken(door.id);
  }, [status, door.id]);

  // 节点切换后把焦点移到新节点标题，屏幕阅读器随即朗读新内容。
  // 加载完成时（atNode/ended）执行，且仅在 nodeId 真正变化时。
  const nodeId = session?.view?.nodeId ?? null;
  useEffect(() => {
    if ((status === STATUS.AT_NODE || status === STATUS.ENDED) && nodeId && nodeId !== lastNodeRef.current) {
      lastNodeRef.current = nodeId;
      headingRef.current?.focus();
    }
  }, [status, nodeId]);

  // 浏览器前进/后退（bfcache 恢复）时，本地可能停留在旧游标：
  // pageshow 后强制与服务端对齐一次，杜绝“前进后退错位”。
  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted) {
        const token = readToken(door.id);
        if (token) window.location.reload();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [door.id]);

  const canGoBack = Boolean(session?.canGoBack) && !busy;
  useJourneyKeys({
    enabled: inPath && (status === STATUS.AT_NODE || status === STATUS.ENDED),
    optionCount: session?.view?.options?.length ?? 0,
    canGoBack,
    onChoose: actions.chooseOption,
    onBack: actions.back,
    listRef,
    busy,
  });

  const restartDoor = useCallback(() => {
    clearToken(door.id);
    navigate(0);
  }, [door.id, navigate]);

  return (
    <main className="gate" style={{ '--accent': door.accent }}>
      <a className="skip-link" href="#gate-content">跳到当前内容</a>

      <GateHeader
        door={door}
        depth={session?.depth ?? 0}
        pinnedVersion={session?.pinnedVersion}
        currentVersion={session?.currentVersion}
        versionStale={session?.versionStale}
        onExit={onExitToQuestions}
      />

      <div id="gate-content" className="gate-stage section-pad" ref={panelRef}>
        {(status === STATUS.BOOTING || status === STATUS.STARTING) && (
          <LoadingPanel title={status === STATUS.STARTING ? `正在推开「${door.title}」` : '正在唤醒档案馆'}
            hint="路径、版本与会话由服务端准备" />
        )}

        {!inPath && status === STATUS.FAILED && (
          <RecoveryPanel
            icon={TriangleAlert}
            title="门暂时打不开"
            body={error?.message ?? '发生了未预期的错误。'}
            actions={<><button className="gate-btn primary" onClick={actions.retry}><RefreshCw size={15} />重试</button>
              <Link className="gate-btn ghost" to="/questions">返回问题索引</Link></>}
          />
        )}

        {inPath && (
          <JourneyView
            door={door}
            session={session}
            status={status}
            headingRef={headingRef}
            listRef={listRef}
            busy={busy}
            onChoose={actions.chooseOption}
            onBack={actions.back}
            dimmed={status === STATUS.OFFLINE_RETRY}
          />
        )}

        {/* 非阻断提示（分支失权 / 乱序对齐 / 迁移说明） */}
        {notice && (status === STATUS.AT_NODE || status === STATUS.ENDED || status === STATUS.LOADING_NEXT || status === STATUS.LOADING_BACK) && (
          <div className="gate-notice" role="status" aria-live="polite">
            <TriangleAlert size={15} aria-hidden />
            <span>{notice.message}</span>
            <button className="notice-close" onClick={actions.dismissNotice} aria-label="关闭提示">×</button>
          </div>
        )}

        {/* 阻断性恢复面板：离线 / 过期 / 版本 / 权限 */}
        {status === STATUS.OFFLINE_RETRY && (
          <BlockingPanel
            icon={WifiOff}
            title="网络已断开"
            body="你的探索进度保存在服务端，连接恢复后会自动继续刚才的选择，不会重复提交。"
            actions={<button className="gate-btn primary" onClick={actions.retry}><RefreshCw size={15} />立即重试</button>}
          />
        )}

        {status === STATUS.SESSION_EXPIRED && (
          <BlockingPanel
            icon={TriangleAlert}
            title="这次探索已经过期"
            body={error?.message ?? '为了保持路径可复现，服务端只保留最近两小时的活动会话。可以从这扇门重新开始。'}
            actions={<><button className="gate-btn primary" onClick={restartDoor}><RefreshCw size={15} />从门口重新开始</button>
              <Link className="gate-btn ghost" to="/questions">返回问题索引</Link></>}
          />
        )}

        {status === STATUS.SESSION_MISSING && (
          <BlockingPanel
            icon={TriangleAlert}
            title="找不到这次探索"
            body="会话可能已被清理。旧的阅读路径不会被改动，但需要新开一条才能继续。"
            actions={<><button className="gate-btn primary" onClick={restartDoor}>重新进入这扇门</button>
              <Link className="gate-btn ghost" to="/questions">返回问题索引</Link></>}
          />
        )}

        {status === STATUS.VERSION_CONFLICT && (
          <BlockingPanel
            icon={TriangleAlert}
            title="问题库更新到了新版本"
            body={`你的这次探索钉在 v${session?.pinnedVersion ?? '旧版本'}，当前是 v${session?.currentVersion ?? '新版本'}。旧路径保持原样可复现；也可以让服务端按新版重放你已做的选择，并在第一个不同的岔路口停下。`}
            actions={
              <>
                <button className="gate-btn primary" onClick={actions.migrate} disabled={pending?.kind === 'migrate'}>
                  {pending?.kind === 'migrate' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                  迁移到新版本
                </button>
                <button className="gate-btn ghost" onClick={restartDoor}>放弃旧路径，从门口重开</button>
              </>
            }
          />
        )}

        {status === STATUS.FORBIDDEN && (
          <BlockingPanel
            icon={TriangleAlert}
            title="这一节失去了访问权限"
            body={error?.message ?? '该分支的访问权限刚刚被收回。'}
            actions={
              <>
                {session?.canGoBack && <button className="gate-btn primary" onClick={actions.back} disabled={busy}><ArrowLeft size={15} />返回上一节</button>}
                <Link className="gate-btn ghost" to="/questions">返回问题索引</Link>
              </>
            }
          />
        )}
      </div>
    </main>
  );
}

function GateHeader({ door, depth, pinnedVersion, currentVersion, versionStale, onExit }) {
  return (
    <div className="gate-topbar section-pad">
      <Link to="/questions" className="back-link" onClick={onExit}>
        <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} aria-hidden />返回问题索引
      </Link>
      <nav className="gate-crumb" aria-label="探索进度">
        <span className="crumb-door">{door.number} · {door.title}</span>
        {depth > 0 && <span className="crumb-depth" aria-live="polite">第 {depth} 节</span>}
      </nav>
      <span className="gate-version" title={`会话版本 v${pinnedVersion ?? currentVersion}`}>
        PATH v{pinnedVersion ?? currentVersion}{versionStale ? ' · 旧版' : ''}
      </span>
    </div>
  );
}

function JourneyView({ door, session, status, headingRef, listRef, busy, onChoose, onBack, dimmed }) {
  const view = session.view;
  const isTerminal = view.terminal;

  return (
    <div className={`journey ${dimmed ? 'is-dimmed' : ''}`} aria-busy={busy ? 'true' : 'false'}>
      <Trail trail={session.trail} />

      <article className="node-card" aria-labelledby="node-title">
        <header className="node-head">
          <span className="kicker">
            {TYPE_PREFIX[view.type] ?? ''}{TYPE_LABEL[view.type] ?? '阅读'}
            {view.thinker ? ` · ${view.thinker}` : ''}
          </span>
          <h2 id="node-title" ref={headingRef} tabIndex={-1} className="node-title">
            {view.title}
          </h2>
        </header>

        <div className="node-body">
          {view.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>

        {!isTerminal && (
          <fieldset className="node-options" ref={listRef} aria-label="选择接下来的方向">
            <legend className="options-legend">你要往哪里走？（方向由服务端裁定）</legend>
            {(status === STATUS.LOADING_NEXT || status === STATUS.LOADING_BACK) && (
              <div className="node-loading" role="status" aria-live="polite">
                <Loader2 size={16} className="spin" aria-hidden />
                {status === STATUS.LOADING_BACK ? '正在返回上一节…' : '正在展开下一节…'}
              </div>
            )}
            <div className={busy ? 'options-list is-busy' : 'options-list'}>
              {view.options.map((option, index) => (
                <OptionButton
                  key={option.optionId}
                  option={option}
                  index={index}
                  disabled={busy}
                  onChoose={onChoose}
                />
              ))}
            </div>
          </fieldset>
        )}

        {isTerminal && <TerminalFooter view={view} door={door} />}

        <div className="node-actions">
          <button className="gate-btn ghost" onClick={onBack} disabled={!session.canGoBack || busy}
            aria-disabled={!session.canGoBack || busy}>
            <ArrowLeft size={15} aria-hidden />
            返回上一节
            <kbd>Esc</kbd>
          </button>
          {!isTerminal && <span className="keyboard-hint">数字键 1–{Math.min(view.options.length, 9)} 可直接选择</span>}
        </div>
      </article>
    </div>
  );
}

function OptionButton({ option, index, disabled, onChoose }) {
  const blocked = option.allowed === false;
  const hintId = blocked ? `blocked-${option.optionId}` : undefined;
  return (
    <div className="option-wrap">
      <button
        type="button"
        data-option-id={option.optionId}
        className={`option-btn ${blocked ? 'is-blocked' : ''}`}
        disabled={disabled || blocked}
        aria-disabled={blocked || undefined}
        aria-describedby={hintId}
        onClick={() => !blocked && onChoose(option.optionId)}
      >
        <span className="option-index" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
        <span className="option-label">{option.label}</span>
        {!blocked
          ? <ChevronRight size={17} className="option-arrow" aria-hidden />
          : <TriangleAlert size={16} className="option-warn" aria-hidden />}
      </button>
      {blocked && <p id={hintId} className="option-blocked-reason">{option.blockedReason ?? '暂时不可通行'}</p>}
    </div>
  );
}

function Trail({ trail }) {
  if (!trail?.length) return null;
  return (
    <nav className="trail" aria-label="你走过的节点">
      <ol>
        {trail.map((entry, index) => (
          <li key={`${entry.nodeId}-${index}`} className={entry.current ? 'is-current' : ''} aria-current={entry.current ? 'step' : undefined}>
            <span className="trail-dot" aria-hidden />
            <span className="trail-title">{entry.current ? entry.title : `第 ${index + 1} 节`}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TerminalFooter({ view, door }) {
  return (
    <footer className="terminal-footer">
      <span className="kicker">LEAVE WITH A QUESTION</span>
      {view.relatedThinkers && (
        <div className="terminal-thinkers">
          <span>继续认识：</span>
          {view.relatedThinkers.map((name) => (
            <Link key={name} to={`/philosophers?q=${encodeURIComponent(name)}`} className="thinker-chip">
              {name}<ArrowUpRight size={14} aria-hidden />
            </Link>
          ))}
        </div>
      )}
      {view.relatedDoors && (
        <div className="terminal-doors">
          <span>相邻的门：</span>
          {view.relatedDoors.map((id) => (
            <Link key={id} to={`/gate/${id}`} className="thinker-chip">
              {doorTitle(id)}<ArrowUpRight size={14} aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </footer>
  );
}

function doorTitle(id) {
  return { human: '人是什么', knowledge: '知识从哪里来', real: '什么是真实', life: '怎样生活' }[id] ?? id;
}

function LoadingPanel({ title, hint }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <Loader2 size={22} className="spin" aria-hidden />
      <h2>{title}</h2>
      <p>{hint}</p>
    </div>
  );
}

function RecoveryPanel({ icon: Icon, title, body, actions }) {
  return (
    <div className="state-panel" role="alert">
      <Icon size={22} aria-hidden />
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="state-actions">{actions}</div>
    </div>
  );
}

function BlockingPanel({ icon: Icon, title, body, actions }) {
  return (
    <div className="blocking-panel" role="alertdialog" aria-modal="false" aria-labelledby="blocking-title">
      <div className="blocking-card">
        <Icon size={22} aria-hidden />
        <h2 id="blocking-title">{title}</h2>
        <p>{body}</p>
        <div className="state-actions">{actions}</div>
      </div>
    </div>
  );
}
