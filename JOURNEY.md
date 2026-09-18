# 四扇问题之门 · Doors of Question

把哲学的四个核心问题做成会真正改变阅读方向的入口。选择“人是什么 / 知识从哪里来 /
什么是真实 / 怎样生活”后，进入的不是一篇文章，而是一条由**回答、犹豫、反问**
组成、可反复改道的阅读路径。

核心原则：**问题版本、分支规则、探索会话全部在服务端**，前端只有一个明确的状态机，
不把任何“下一跳”逻辑放进前端或 localStorage。

## 运行

```bash
npm install
npm run build        # 构建前端到 dist/
npm start            # 同一个 Node 服务托管 API + 静态前端 → http://localhost:5173
```

开发模式（前端热更新 + API 代理到 5173）：

```bash
npm run server       # 终端 A：问题之门服务
npm run dev          # 终端 B：Vite (5174)，/api、/admin 代理到 5173
```

测试：

```bash
npm test             # 28 个测试：图完整性、引擎、HTTP 端到端、前端状态机
```

## 目录

```
server/
  graph.js          唯一事实来源：四个门、节点（回答/犹豫/反问/终点）、
                    条件分支规则 RULES、三个版本的图裁剪
  engine.js         分支解析、seq 顺序校验、服务端后退、失权判定、版本迁移
  session-store.js  会话存储（内存实现，可换持久化后端）；全局/会话级失权名单
  index.js          零依赖 HTTP 服务：/api、/admin、静态托管 + SPA 回退
  *.test.js         引擎与 HTTP 端到端测试
src/journey/
  stateMachine.js   显式状态机（reducer + 执行层 hook），含全部异常转移
  Gate.jsx          门/路径 UI：ARIA、焦点管理、键盘操作、恢复面板
  keyboard.js       ↑↓/←→ 移动、数字键直达、Esc/Backspace 返回
  api.js            传输层：错误归一化、并发请求合并
  tokenStore.js     只存不透明会话 token（sessionStorage），不存任何路径逻辑
test/
  stateMachine.test.js  前端状态机的纯函数测试
```

## 服务端契约

| 方法 & 路径 | 作用 |
| --- | --- |
| `GET  /api/doors` | 当前题库版本 + 四扇门 |
| `POST /api/sessions` `{doorId}` | 创建会话，钉在当前版本，返回入口节点视图 |
| `GET  /api/sessions/:id` | 取权威会话状态（刷新恢复用） |
| `POST /api/sessions/:id/choices` `{optionId, seq}` | 选择；服务端解析下一跳 |
| `POST /api/sessions/:id/back` `{seq}` | 服务端后退一节（游标回退，旧选择标记撤回） |
| `POST /api/sessions/:id/migrate` | 升级到新版本图，按选项 id 重放，在首个分歧岔路停下 |
| `DELETE /api/sessions/:id` | 结束会话 |
| `POST /admin/revoke` `{nodeId, sessionId?}` | 让某分支立即失权（全局或单会话） |
| `POST /admin/restore` `{nodeId}` | 恢复访问 |

节点视图**只含选项标签与 `allowed/blockedReason`，从不含 target**；下一步去哪完全由
服务端根据当前版本的图与已走历史裁定。条件分支（如真实之门的“现象算真实吗”）
会因为你走过理性、感官还是语言之路而落向不同节点。

## 版本化

会话创建时钉住版本（v1 / v2 / v3），题库升级后旧会话仍按旧图完整复现，不会被悄悄改写。
客户端在每次响应里看到 `pinnedVersion / currentVersion / versionStale`，发现落后时弹出
**迁移面板**：服务端开一个新版本会话，按旧选项 id 逐步重放，遇到第一个在新版被改动的
岔路口就停下并交还选择权，旧会话原样保留（`supersededBy` 指向新会话）。

## 异常情形如何处理

- **快速重复点击**：前端 reducer 在已有 pending 时吞掉后续选择；后端用单调 `seq`
  拒绝乱序/重复请求，返回 `409 stale_seq` 并附带权威 `current`，前端直接对齐。
  API 层还会合并同参数并发请求。
- **接口乱序**：所有写操作带 `seq`，先到的请求自增序号，后到的旧请求一律失效。
- **会话过期**：TTL（默认 2 小时）后返回 `410 session_expired`，与 `404 不存在`区分，
  前端给出“从门口重新开始”面板并清掉本地 token。
- **版本更新**：见上，钉版本 + 显式迁移，绝不静默改写。
- **前进/后退错位**：后退是服务端真回退（非浏览器视觉把戏）；bfcache 恢复（`pageshow`
  persisted）时强制与服务端对齐，杜绝本地游标与服务端不一致。
- **断网恢复**：请求失败进入 `offlineRetry`，记录最后一次意图；`online` 事件触发后
  自动续传同一个选择/返回，不重复提交；也可手动重试。
- **分支突然失权**：管理员/权限系统随时 revoke；节点视图把对应选项标为禁用并说明，
  强行请求返回 `403 branch_forbidden`；若当前所在节点本身被收回，进入 `forbidden`
  阻断面板引导返回。支持全局失权与单会话失权。

## 可访问性

- 语义化 `article / fieldset / nav(aria-label)`，选项为原生 `<button>`。
- 每次节点切换把焦点移到新标题（`tabIndex=-1`），屏幕阅读器随即朗读。
- `aria-live` 区域播报加载、对齐与失权提示；阻断面板用 `alertdialog`。
- 完整键盘：Tab 顺序、方向键移动、数字键 1–9 直达、Esc/Backspace 返回、可见 focus ring、
  跳到正文的 skip link。
