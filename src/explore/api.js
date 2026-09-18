// 问题之门 API 客户端。所有分支裁决都在服务端，这里只负责请求与错误分类。
export class ApiError extends Error {
  constructor(status, code, message, payload = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    // fetch 只在网络层失败时抛错（断网、DNS、服务不可达）
    throw new ApiError(0, 'NETWORK', '网络连接中断');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // 非 JSON 响应按未知错误处理
  }
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? `请求失败（${res.status}）`, err);
  }
  return data;
}

export const api = {
  listQuestions: () => request('/api/questions'),
  createSession: (questionId, replay) =>
    request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ questionId, ...(replay ? { replay } : {}) }),
    }),
  getSession: (sessionId) => request(`/api/sessions/${sessionId}`),
  submitChoice: (sessionId, intent) =>
    request(`/api/sessions/${sessionId}/choices`, {
      method: 'POST',
      body: JSON.stringify(intent),
    }),
};
