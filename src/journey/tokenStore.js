// 会话 token 的本地登记。注意：这里只存“不透明 token”，
// 不存任何路径/分支/版本逻辑——刷新页面后一切状态仍由服务端重建。
const PREFIX = 'journey-session:';

export function saveToken(doorId, sessionId) {
  try { sessionStorage.setItem(PREFIX + doorId, sessionId); } catch { /* 隐私模式等 */ }
}
export function readToken(doorId) {
  try { return sessionStorage.getItem(PREFIX + doorId); } catch { return null; }
}
export function clearToken(doorId) {
  try { sessionStorage.removeItem(PREFIX + doorId); } catch { /* noop */ }
}
