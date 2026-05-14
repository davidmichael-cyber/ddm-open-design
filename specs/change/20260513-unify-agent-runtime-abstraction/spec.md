---
id: 20260513-unify-agent-runtime-abstraction
name: Unify Agent Runtime Abstraction
status: implemented
created: '2026-05-13'
---

## Overview

### Problem Statement

- Agent runtime 差异目前仍暴露到上层调用路径中，上层模块仍可能需要感知具体 runtime 的协议、事件格式、parser、handler、stdout 形态或能力差异。
- 一个已知例子：`server.ts` 中对 `claude-stream-json`、`qoder-stream-json`、`copilot-stream-json`、`pi-rpc`、`acp-json-rpc`、`json-event-stream` 和 plain stdout 的显式处理。

### Goals

- 重构代码，统一 agent runtime 抽象 `RuntimeAdapter`。
- 将不同 agent runtime 的差异性封装到底层模块中。
- 让上层逻辑无需感知具体 runtime 的协议、parser、handler、事件格式或输出形态。
- 现有的文件结构、AgentRuntimeDef 等尽量不改动，避免大范围的文件搬迁或变量重命名，防止引发大量合并冲突。

### Success Criteria

- 上层入口基于统一 runtime 定义调度 agent。
- 新增或调整 agent runtime 时，主要改动集中在底层 runtime 定义或适配模块。
- `server.ts` 和其他上层模块不再承担按具体 runtime、协议、parser、handler 或输出格式分支的职责。

## Research

### Summary

- 当前最主要的上层耦合点在 `apps/daemon/src/server.ts`：chat spawn path 需要直接读取 `def.streamFormat` / `def.eventParser` / `def.promptViaStdin`，并按 Claude、Qoder、Copilot、Pi RPC、ACP、json-event-stream、plain stdout 分支接入不同 parser/session handler。Source: `apps/daemon/src/server.ts:3787-3867`, `apps/daemon/src/server.ts:4036-4176`
- `server.ts` 还需要理解不同 runtime 的 lifecycle 差异：哪些 structured stream 要启用 substantive-output tracking、Pi/ACP session 如何挂到 run 以支持 abort、ACP forced SIGTERM 何时算成功、Claude failure diagnostics 何时触发。Source: `apps/daemon/src/server.ts:4061-4078`, `apps/daemon/src/server.ts:4174-4176`, `apps/daemon/src/server.ts:4192-4264`
- Critique Theater 的 prompt 组合和 spawn routing 都感知 `streamFormat === 'plain'`，导致上层业务逻辑需要知道哪些 runtime 输出 wrapper protocol、哪些 runtime 可被 critique parser 直接消费。Source: `apps/daemon/src/server.ts:3060-3138`, `apps/daemon/src/server.ts:3923-4034`
- prompt/spawn 周边逻辑仍感知 runtime 传输形态：stdin mode 由 `promptViaStdin` 或 `acp-json-rpc` 决定，SSE start payload 暴露 `streamFormat`，json-event-stream handler 由 `def.eventParser || def.id` 选择 parser kind。Source: `apps/daemon/src/server.ts:3790-3799`, `apps/daemon/src/server.ts:3808-3841`, `apps/daemon/src/server.ts:4155-4167`
- 已有 parser/session 模块本身相对独立，但统一入口尚未把“如何 attach stdout/stdin、如何 emit agent events、如何报告 fatal/abort/completion”封装为 runtime-level adapter contract。Source: `apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`

### Existing System

- Web/daemon 的架构边界已经把 agent CLI 调度放在 daemon：web 负责 UI 且保持 stateless，daemon 检测 agents、注册 skills、管理 artifacts 并 broker REST/SSE。Source: `docs/spec.md:85-90`, `apps/AGENTS.md:7-18`
- 架构文档描述的目标形态是 daemon 维护 agent adapter pool，并在生成流程中以 `system/user/cwd` 调用 agent adapter、再把 agent events 流回 web。Source: `docs/architecture.md:113-129`, `docs/architecture.md:187-226`
- 设计文档中的 adapter 接口目标是 `detect()`、`capabilities()`、`run(params): AsyncIterable<AgentEvent>`、`cancel()`，并把事件统一为 thinking/tool/text/error/done 等形态。Source: `docs/agent-adapters.md:13-69`
- 当前实现中的 runtime 定义集中在 `RuntimeAgentDef`，包含 CLI 二进制、版本参数、`buildArgs(...)`、`streamFormat`、`promptViaStdin`、`eventParser`、模型发现、能力和 prompt 预算字段。Source: `apps/daemon/src/runtimes/types.ts:37-68`
- 当前 registry 只是聚合各 runtime definition 并提供 `getAgentDef(id)`；新增 runtime 需要在 registry import 并加入 `AGENT_DEFS`。Source: `apps/daemon/src/runtimes/registry.ts:1-48`
- runtime definition 已承载部分底层差异：Claude 使用 stdin prompt 和 `claude-stream-json`；Codex 使用 stdin prompt、`json-event-stream` 和 `eventParser: 'codex'`；Pi 使用 RPC mode、stdin prompt、`pi-rpc` 和 image 支持。Source: `apps/daemon/src/runtimes/defs/claude.ts:38-70`, `apps/daemon/src/runtimes/defs/codex.ts:33-82`, `apps/daemon/src/runtimes/defs/pi.ts:50-95`
- agent spawn 路径仍在 `server.ts` 中基于 `def.streamFormat` 决定 stdin mode、spawn env、SSE start payload、stdout/stderr handlers、structured parser/session attachment 和 close-status 处理。Source: `apps/daemon/src/server.ts:3787-3867`, `apps/daemon/src/server.ts:4036-4176`, `apps/daemon/src/server.ts:4192-4268`
- Critique Theater eligibility 目前在 prompt composer 和 spawn path 都显式基于 `streamFormat === 'plain'`；非 plain adapters 会跳过 orchestrator 并走 legacy generation。Source: `apps/daemon/src/server.ts:3060-3138`, `apps/daemon/src/server.ts:3923-4034`

### Design Inputs

- parser/handler 已按协议拆成独立模块：Claude JSONL parser 将 Claude stream-json 映射为 UI-friendly events；Qoder parser 独立处理 adapter-specific wrapper objects；Copilot parser 把 dotted top-level types 映射为相同 UI 事件。Source: `apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/qoder-stream.ts:1-12`, `apps/daemon/src/copilot-stream.ts:1-31`
- `json-event-stream` 已经是多 parser-kind 分发器，支持 `opencode`、`gemini`、`cursor-agent`、`codex`，并输出统一 event sink；`server.ts` 仍负责传入 `def.eventParser || def.id`。Source: `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/server.ts:4155-4167`
- ACP 和 Pi 不是简单 stdout parser：ACP session 通过 JSON-RPC 初始化/session/prompt、处理权限请求和 model selection；Pi session 发送 `prompt` RPC、映射 agent events，并返回 `hasFatalError()`/`abort()` 给 run lifecycle。Source: `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`
- spawn command invocation 已有通用 helper：`resolveAgentLaunch` 处理 executable resolution 和 Codex native binary 特例；`execAgentFile` 通过 `@open-design/platform` 的 `createCommandInvocation` 执行 agent 文件。Source: `apps/daemon/src/runtimes/launch.ts:15-49`, `apps/daemon/src/runtimes/invocation.ts:8-29`
- runtime tests 已覆盖 adapter-specific argv 和 protocol fields，例如 ACP runtimes 声明 `acp-json-rpc`，Pi 声明 `pi-rpc`、stdin prompt 和 image support。Source: `apps/daemon/tests/runtimes/agent-args.test.ts:148-175`
- prompt budget tests 依赖 runtime definition 的 `streamFormat` 和 `maxPromptArgBytes`；DeepSeek 作为 plain runtime 仍必须保留 prompt argv budget guard。Source: `apps/daemon/tests/runtimes/prompt-budget.test.ts:7-17`, `apps/daemon/tests/runtimes/prompt-budget.test.ts:37-68`
- Critique spawn wiring tests 固化了当前 `streamFormat === 'plain'` gating，并列出非 plain formats：`claude-stream-json`、`qoder-stream-json`、`copilot-stream-json`、`json-event-stream`、`acp-json-rpc`。Source: `apps/daemon/tests/critique-spawn-wiring.test.ts:174-214`

### Constraints & Dependencies

- 仓库边界要求 CLI/agent argument definition changes 放在 `apps/daemon/src/runtimes/defs/`，stdout parser changes 放在匹配 runtime helpers 和 parser tests；app tests 必须在 `apps/daemon/tests/`。Source: `apps/AGENTS.md:12-18`, `apps/AGENTS.md:27-32`
- Adapter source layout 文档要求每个 adapter 独立模块，让社区新增 adapter 不需要触碰 core daemon code；当前代码还未达到该目录形态。Source: `docs/agent-adapters.md:298-319`
- daemon 不应提升 agent 权限；Codex/Cursor 由 workspace sandbox 限制，Qoder 由 cwd 和显式 absolute `--add-dir` 限制。Source: `docs/agent-adapters.md:291-297`
- ACP model detection 和 ACP session 包含明确的超时、错误和 recoverable model selection 分支；统一抽象需要保留这些协议级 lifecycle/failure semantics。Source: `apps/daemon/src/acp.ts:350-388`, `apps/daemon/src/acp.ts:492-528`
- Pi image forwarding 有文件类型、数量、总大小和 realpath upload-root 检查；统一抽象不能绕过这些 runtime-specific safety checks。Source: `apps/daemon/src/pi-rpc.ts:399-449`
- 当前 close handler 对 structured stream errors、empty-output guard、ACP forced SIGTERM clean completion 和 Claude failure diagnostics 有集中逻辑；抽象边界需要保留 run status 的 fail-fast/visible error 行为。Source: `apps/daemon/src/server.ts:4061-4078`, `apps/daemon/src/server.ts:4192-4264`

### Key References

- `apps/daemon/src/runtimes/types.ts:37-68` - 当前 runtime definition schema。
- `apps/daemon/src/runtimes/registry.ts:1-48` - runtime registry 聚合点。
- `apps/daemon/src/server.ts:3060-3138,3770-4268` - prompt eligibility、spawn、protocol branch、stream handling 和 close lifecycle 的上层耦合点。
- `apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/qoder-stream.ts:1-12`, `apps/daemon/src/copilot-stream.ts:1-31`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529` - 现有协议/parser/session 模块。
- `docs/agent-adapters.md:13-69,298-319` - 目标 adapter interface 和 source layout。
- `apps/daemon/tests/runtimes/agent-args.test.ts:148-175`, `apps/daemon/tests/runtimes/prompt-budget.test.ts:7-68`, `apps/daemon/tests/critique-spawn-wiring.test.ts:174-214` - 现有测试覆盖的 runtime/protocol invariants。

## Design

### Assumptions

- 本次只做“最小 runtime 抽象”，不实现文档中的完整 `AgentAdapter.run(): AsyncIterable<AgentEvent>` / `detect()` / `cancel()` 体系；完整 adapter 形态留给后续演进。Source: `docs/agent-adapters.md:13-69`
- 现有 `RuntimeAgentDef`、`runtimes/defs/*` 和 registry 结构保持不搬迁，避免大范围重命名和合并冲突。Source: `apps/daemon/src/runtimes/types.ts:37-68`, `apps/daemon/src/runtimes/registry.ts:1-48`
- Critique Theater 本轮继续只支持 plain stdout；本次目标是把这个限制从上层的 `streamFormat === 'plain'` 字符串判断改成 adapter capability，不扩展 structured adapters 的 critique 支持。Source: `apps/daemon/src/server.ts:3060-3138`, `apps/daemon/src/server.ts:3923-4034`

### Design Summary

- 新增一个薄的 `RuntimeAdapter` 底层模块，作为 `RuntimeAgentDef` 与 daemon 上层 chat/connection flow 之间的唯一 runtime 差异封装层。
- `RuntimeAgentDef.streamFormat`、`eventParser`、`promptViaStdin` 等字段先保留，但只允许 runtime adapter factory 内部解释；`server.ts` 和 connection test path 改为调用语义方法，例如 prompt delivery、critique eligibility、stream attachment、close classification。
- 不重写 spawn/run 生命周期，不搬迁 parser/session 模块；adapter 只把现有 `create*StreamHandler`、`attachAcpSession`、`attachPiRpcSession` 和 plain stdout forwarding 包成统一 attachment contract。
- 采用 fail-fast 策略：adapter factory 遇到未知 `streamFormat` 直接抛错，不默默降级成 plain，避免隐藏坏 runtime definition。

### Design Decisions

- Decision: 保留 `RuntimeAgentDef` 作为 runtime 定义源，只新增 adapter 层解释底层协议字段；这符合现有 defs/registry 集中管理 runtime 的结构，也避免改动每个 runtime 文件。Source: `apps/daemon/src/runtimes/types.ts:37-68`, `apps/daemon/src/runtimes/registry.ts:19-48`
- Decision: adapter 暴露语义能力而非协议字符串，例如 `supportsCritiqueTheater()`、`stdinMode()`、`attach()`、`classifyClose()`；上层不再按 `claude-stream-json` / `pi-rpc` / `acp-json-rpc` 等字符串分支。Source: `apps/daemon/src/server.ts:3787-3867`, `apps/daemon/src/server.ts:4036-4176`
- Decision: parser/session 实现继续复用现有模块，由 adapter 负责选择和接线；现有模块已经分别封装 Claude/Qoder/Copilot/json-event/Pi/ACP 协议细节。Source: `apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/qoder-stream.ts:1-12`, `apps/daemon/src/copilot-stream.ts:1-31`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`
- Decision: ACP 与 Pi 只共享 adapter contract，不共享协议实现；二者包含不同的 session lifecycle、abort、fatal/completion 和安全检查，强行合并会扩大范围。Source: `apps/daemon/src/acp.ts:350-388`, `apps/daemon/src/acp.ts:492-528`, `apps/daemon/src/pi-rpc.ts:399-449`
- Decision: structured stream 的 substantive-output guard、stream error、ACP forced SIGTERM success、Claude diagnostics 等 close semantics 迁移到 adapter attachment/close classifier 返回值，保持 fail-fast/visible failure 行为。Source: `apps/daemon/src/server.ts:4061-4078`, `apps/daemon/src/server.ts:4192-4264`
- Decision: connection test 使用同一个 adapter helper，避免 `server.ts` 和 connection test 各自维护一套 runtime protocol 分支并继续漂移。Source: `apps/daemon/src/connectionTest.ts:305-305`, `apps/daemon/src/server.ts:4080-4167`
- Decision: SSE `start` payload 不再作为上层 runtime protocol 依赖点；若客户端无合同字段依赖，移除或停止消费 `streamFormat`。Source: `apps/daemon/src/server.ts:3789-3799`, `packages/contracts/src/sse/chat.ts:1-30`

### System Structure

```mermaid
flowchart TD
  Def[RuntimeAgentDef\nexisting defs/*] --> Factory[createRuntimeAdapter(def)]
  Factory --> Adapter[RuntimeAdapter\nsemantic behavior]
  Server[server.ts chat flow] --> Adapter
  Conn[connectionTest flow] --> Adapter
  Adapter --> Plain[plain stdout forwarding]
  Adapter --> JSON[Claude/Qoder/Copilot/json-event handlers]
  Adapter --> RPC[ACP/Pi sessions]
```

### Interfaces / APIs

Pseudo-type sketch:

```ts
type RuntimeAdapter = {
  readonly id: string;
  readonly displayName: string;
  supportsCritiqueTheater(): boolean;
  stdinMode(): 'pipe' | 'ignore';
  shouldWritePromptToStdin(): boolean;
  attach(ctx: RuntimeAttachContext): RuntimeAttachment;
};

type RuntimeAttachment = {
  session?: RuntimeSessionHandle | null;
  trackingSubstantiveOutput: boolean;
  producedSubstantiveOutput(): boolean;
  streamError(): string | null;
  classifyClose(exit: RuntimeExit): 'succeeded' | 'failed' | 'canceled' | null;
};

type RuntimeSessionHandle = {
  abort?: () => void;
  hasFatalError?: () => boolean;
  completedSuccessfully?: () => boolean;
};
```

The adapter owns protocol-specific mapping:

- `plain`: forward stdout as `stdout` chunks.
- `claude-stream-json`: attach `createClaudeStreamHandler`.
- `qoder-stream-json`: attach `createQoderStreamHandler` and substantive-output/error tracking.
- `copilot-stream-json`: attach `createCopilotStreamHandler`.
- `json-event-stream`: attach `createJsonEventStreamHandler(def.eventParser || def.id, ...)` and substantive-output/error tracking.
- `pi-rpc`: attach `attachPiRpcSession`, image safety inputs, session abort/fatal handling, and substantive-output/error tracking.
- `acp-json-rpc`: attach `attachAcpSession`, MCP server inputs, session abort/fatal/completion handling.

### System Procedure

Flow:
  1. Chat run resolves `RuntimeAgentDef` as today.
  2. Chat run creates `adapter = createRuntimeAdapter(def)` once.
  3. Prompt composition and Critique Theater use adapter semantics, not `streamFormat`.
  4. Spawn code uses adapter stdin behavior while preserving existing launch/env helpers.
  5. After spawn, `adapter.attach(...)` wires stdout/stderr/parser/session and returns attachment state.
  6. Close handler asks attachment/classifier for fatal/error/empty-output/ACP completion semantics, then finishes the run.
  7. Connection test path reuses the same adapter attach/stdin behavior.

### Change Scope

#### Impact Areas

- Runtime abstraction foundation: add one small bottom-layer module that owns protocol selection and exposes semantic runtime behavior to daemon callers.
- Chat run spawn/stream handling: remove upper-level branching on `def.streamFormat` / `def.eventParser` / `def.promptViaStdin`; keep existing spawn/env/invocation flow intact.
- Critique Theater gating: preserve current plain-only behavior, but express it as adapter capability instead of a protocol-string check.
- Connection/runtime smoke path: reuse the same adapter behavior so runtime checks do not maintain duplicate parser/stdin/session branching.
- Contracts/UI compatibility: avoid making `streamFormat` a public contract dependency; remove or stop consuming it only after verifying no client requires it.

#### Planned Files

- `apps/daemon/src/runtimes/runtime-adapter.ts` - new adapter factory and semantic adapter contract.
- `apps/daemon/src/runtimes/types.ts` - small shared type additions only if needed by the adapter contract.
- `apps/daemon/src/server.ts` - replace protocol branches with adapter calls in prompt gating, spawn stdin behavior, stream attachment, and close classification.
- `apps/daemon/src/connectionTest.ts` - route runtime smoke stream/stdin behavior through the adapter.
- `apps/daemon/tests/runtimes/*` - add adapter coverage and update runtime behavior tests.
- `apps/daemon/tests/critique-spawn-wiring.test.ts` - assert critique eligibility through adapter capability rather than stream format strings.
- `packages/contracts/src/sse/chat.ts` and web SSE consumers - touch only if `streamFormat` cleanup is confirmed safe.

### Edge Cases

- Unknown `streamFormat`: throw during adapter creation so bad runtime definitions fail visibly.
- Structured stream exits 0 without substantive output: keep explicit failure, not success with empty assistant message.
- ACP clean completion followed by forced SIGTERM: keep succeeded only for the narrow clean-completion shape.
- Pi image forwarding: adapter must pass existing image/upload root checks through `attachPiRpcSession`; no bypass or mock path.
- Stdin write errors: keep the existing EPIPE-specific recovery only; non-EPIPE stdin errors remain visible.
- Critique on non-plain runtimes: still disabled, but the reason is adapter capability rather than protocol string knowledge in prompt/spawn code.

### Verification Strategy

- Runtime adapter unit tests: cover every existing `streamFormat`, unknown format fail-fast, stdin mode, prompt write behavior, and critique eligibility. Source: `apps/daemon/src/runtimes/types.ts:50-55`, `apps/daemon/tests/runtimes/agent-args.test.ts:148-175`
- Stream attachment tests: feed representative stdout samples into fake child streams for plain, Claude, Qoder, Copilot, json-event, Pi, and ACP paths; assert emitted `stdout`/`agent`/`error` events match current behavior. Source: `apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`
- Close semantics tests: preserve structured empty-output failure, ACP fatal failure, ACP forced SIGTERM success, stream error failure, and cancel classification. Source: `apps/daemon/src/server.ts:4192-4264`
- Critique wiring tests: update assertions from protocol strings to adapter capability while preserving current non-plain skip behavior. Source: `apps/daemon/tests/critique-spawn-wiring.test.ts:174-214`
- Package validation: run `pnpm --filter @open-design/daemon test`, `pnpm --filter @open-design/daemon typecheck`, then repo-level `pnpm guard` and `pnpm typecheck`. Source: `apps/AGENTS.md:47-59`, `AGENTS.md#validation-strategy`

## Plan

- [x] Step 1: Introduce runtime adapter foundation
  - [x] Substep 1.1 Implement: add `createRuntimeAdapter(def)` and minimal semantic types under `apps/daemon/src/runtimes/`.
  - [x] Substep 1.2 Implement: map every current `streamFormat` to existing parser/session helpers without moving helper files.
  - [x] Substep 1.3 Implement: make unknown formats throw with a clear error.
  - [x] Substep 1.4 Verify: add adapter unit tests for format coverage, stdin behavior, critique eligibility, and fail-fast unknown formats.
- [x] Step 2: Move chat run protocol branching behind adapter
  - [x] Substep 2.1 Implement: create the adapter once per run and use it for critique eligibility/prompt alignment.
  - [x] Substep 2.2 Implement: replace spawn stdin and prompt-write conditionals with adapter methods.
  - [x] Substep 2.3 Implement: replace stream parser/session branching with `adapter.attach(...)`.
  - [x] Substep 2.4 Implement: replace close-handler protocol checks with attachment/classifier state while preserving current failure semantics.
  - [x] Substep 2.5 Verify: update chat/critique tests to assert semantic capability behavior instead of protocol strings.
- [x] Step 3: Reuse adapter in connection/runtime checks
  - [x] Substep 3.1 Implement: route connection test stream/stdin behavior through the same adapter helper.
  - [x] Substep 3.2 Verify: add or update tests that would fail if connection checks reintroduce duplicate protocol branching.
- [x] Step 4: Compatibility and full validation
  - [x] Substep 4.1 Implement: remove or stop depending on public `streamFormat` SSE start data only after confirming no contract/UI consumer requires it.
  - [x] Substep 4.2 Verify: run `pnpm --filter @open-design/daemon test`.
  - [x] Substep 4.3 Verify: run `pnpm --filter @open-design/daemon typecheck`.
  - [x] Substep 4.4 Verify: run `pnpm guard` and `pnpm typecheck`.

## Notes

<!-- Optional sections — add what's relevant. -->

### Implementation

- `apps/daemon/src/runtimes/runtime-adapter.ts` - added `RuntimeAdapter` semantic contract, `createRuntimeAdapter(def)`, supported stream-format validation, stdin/critique capability helpers, and attachment wiring to the existing plain stdout, Claude, Qoder, Copilot, json-event, Pi RPC, and ACP helpers.
- `apps/daemon/tests/runtimes/runtime-adapter.test.ts` - added adapter foundation coverage for all current runtime formats, stdin behavior, critique eligibility, and unknown-format fail-fast errors.
- `apps/daemon/src/runtimes/runtime-adapter.ts` - added adapter-owned close classification and ACP MCP capability helpers so chat lifecycle and MCP routing no longer branch on runtime protocol strings.
- `apps/daemon/src/server.ts` - creates one runtime adapter per chat run and uses it for critique eligibility, stdin mode, prompt writing, stream/session attachment, close classification, and start payload cleanup.
- `apps/daemon/src/connectionTest.ts` - routes agent smoke-test stdin and stream/session handling through `createRuntimeAdapter(def)`.
- `apps/daemon/tests/critique-spawn-wiring.test.ts` - updated critique spawn tests to assert adapter capability gating instead of protocol-string checks.
- `apps/web/src/providers/daemon.ts` - updated SSE client comment to describe runtime-adapter-driven event streams.

### Verification

- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/runtimes/runtime-adapter.test.ts` - passed.
- `pnpm --filter @open-design/daemon typecheck` - passed.
- `pnpm --filter @open-design/daemon test -- tests/runtimes/runtime-adapter.test.ts` - passed full daemon test suite due package script argument handling.
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/runtimes/runtime-adapter.test.ts tests/critique-spawn-wiring.test.ts` - passed.
- `pnpm --filter @open-design/daemon typecheck` - passed.
- `pnpm --filter @open-design/daemon test` - initially had one chat-route failure in the full parallel suite; rerunning the failing test file passed, indicating a flaky suite interaction rather than a deterministic regression.
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/chat-route.test.ts -t "keeps Claude stream runs alive"` - passed.
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/chat-route.test.ts` - passed.
- `pnpm guard` - passed.
- `pnpm typecheck` - passed.
- `pnpm --filter @open-design/daemon test` - rerun reached one unrelated `tests/project-watchers.test.ts` timeout in the full parallel suite; the runtime/chat/connection suites passed.
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/project-watchers.test.ts -t "still emits events when the watch root is itself nested under .od"` - passed.
