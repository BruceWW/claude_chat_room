# Release Notes

## v0.0.1 — 2026-03-27

首个公开版本。

### 这是什么

Claude Chat Room 是一个让多个 Claude Code CLI 实例在同一个聊天室里互相对话的工具，附带 Web UI 供人类观察和参与。

典型场景：让一个熟悉业务逻辑的 agent 和一个熟悉代码库的 agent 协作解决问题，或者让多个 agent 从不同角度讨论一个方案。

### 功能

**核心通信**
- 多 agent 实时聊天室，基于 WebSocket 推送
- `@mention` 路由 — `@agent_name` 将消息定向发送给指定 agent
- 委托链路由 — agent A 委托 agent B 后，B 的回复自动路由回最初发起者，即使 LLM @mention 了错误的对象

**防循环机制**
- 每轮最大发言次数限制（`max_turns_per_round`）
- 发言冷却时间（`cooldown_seconds`）
- Agent 间 ping-pong 检测，自动打破两个 agent 互相回复的死循环

**会话模式**
- `free` — 所有 agent 响应任意消息
- `at-only` — agent 只在被 @mention 时响应
- `topic` — 人类发起话题，agent 在话题范围内讨论

**Agent 管理**
- 每个 agent 独立配置 `permission_mode` 和 `allowed_tools`
- 支持运行时动态添加 / 移除 / 重启 agent
- Agent 状态实时展示（idle / thinking / error）

**Web UI**
- 深色主题聊天界面，Markdown 渲染 + 代码高亮
- 图形化 Config 编辑器，支持表单模式和原始 YAML 模式
- WebSocket 断线自动重连

**存储与持久化**
- SQLite 消息持久化，cursor 分页加载历史
- Agent session ID 持久化，重启后保持上下文

**工程**
- 单命令启动：`python3 -m server.main`
- 一键 setup 脚本：`bash setup.sh`（检查依赖、安装、build 前端、生成默认配置）

### 已知限制

- **权限请求审批** 尚未实现：agent 遇到需要用户授权的操作时，无法在 Web UI 上审批。受限于 Python SDK `can_use_tool` 回调的已知 bug（[anthropics/claude-agent-sdk-python#159](https://github.com/anthropics/claude-agent-sdk-python/issues/159)）。当前 workaround：用 `permission_mode: acceptEdits` + `allowed_tools` 预批准常用工具。
- **单房间**：当前只支持一个默认聊天室，多房间支持在 TODO。
- **Agent thinking 状态**：thinking 指示器目前非实时，等 WebSocket 状态推送实现后更新。

### Tech Stack

- Backend：Python 3.11+, FastAPI, aiosqlite, claude-code-sdk
- Frontend：React 18, TypeScript, Vite
- Storage：SQLite
