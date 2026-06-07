// DDM runtime adapter — Phase 2 scaffold.
//
// Two execution paths:
//   local   — delegates to OD's existing launch.ts / server.ts spawn pipeline unchanged
//   gateway — routes to OpenClaw / claude_bridge when env.gatewayUrl is set
//
// Phase 2 ships the type contract and the local path.
// Gateway path implementation follows in Phase 2 continuation once
// claude_bridge streaming vs single-shot delta is confirmed.
//
// NOTE on streaming delta: claude_bridge is currently single-shot.
// Do NOT fake token-by-token streaming — emit one DdmRuntimeChunk on
// completion and call onDone() immediately. Never replay synthetic tokens
// (breaks watchdog and cancelability semantics). See FORK_INFO.md.

import type { RuntimeBuildOptions, RuntimeContext } from './types.js';

// ── Agent selection ─────────────────────────────────────────────────────────

// Claude's OD adapter ignores options.reasoning (confirmed claude.ts:48–95).
// Reasoning is not passed to Claude — field is intentionally absent.
export interface DdmAgentSelectionClaude {
  binary: 'claude';
  modelId: string;
}

// 7-level ladder from codex.ts:86; clamped per model in shared.ts:9.
export type CodexReasoningLevel =
  | 'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface DdmAgentSelectionCodex {
  binary: 'codex';
  modelId: string;
  reasoning?: CodexReasoningLevel;
}

export type DdmAgentSelection = DdmAgentSelectionClaude | DdmAgentSelectionCodex;

// ── Prompt input ─────────────────────────────────────────────────────────────

// Claude uses stream-json stdin format (promptInputFormat: 'stream-json' in claude.ts).
// stdinText is the fully assembled prompt (post RAG injection in Phase 3).
export interface DdmPromptInput {
  stdinText: string;
  imagePaths?: string[];
}

// ── MCP injection ─────────────────────────────────────────────────────────────

// MCP delivery is restricted to managed-project CWDs and suppressed in
// sandbox mode (confirmed Phase 0: run-tool-bundle.ts:108, :185).
// Codex has no externalMcpInjection path — out of scope for DDM v1.
// Fields deferred until Phase 3 wires the gateway MCP strategy.
export interface DdmMcpInjection {
  // Reserved — Phase 3 will add McpServerConfig[] here once delivery
  // eligibility and sandbox suppression constraints are handled.
}

// ── Session + env ─────────────────────────────────────────────────────────────

export interface DdmSessionConfig {
  sessionId: string;
  isResume: boolean;    // true = resume existing CLI-owned session
  cwd: string;
  extraDirs?: string[];
}

export interface DdmEnvConfig {
  appConfigLayer: Record<string, string>;  // OD app-config env vars (server.ts:12335)
  gatewayUrl?: string;                      // set to activate gateway routing
}

// ── Stream callbacks ──────────────────────────────────────────────────────────

export interface DdmRuntimeChunk {
  type: 'text' | 'tool_call' | 'stderr';
  content: string;
  index?: number;
}

export interface DdmArtifactRunHandle {
  runId: string;
  artifactPath?: string;
}

export interface DdmRuntimeError {
  code: string;
  message: string;
  cause?: unknown;
}

// ── Launch options ────────────────────────────────────────────────────────────

export interface DdmRuntimeLaunchOpts {
  agent: DdmAgentSelection;
  prompt: DdmPromptInput;
  mcp: DdmMcpInjection;
  session: DdmSessionConfig;
  env: DdmEnvConfig;
  onChunk: (chunk: DdmRuntimeChunk) => void;
  onDone: (handle: DdmArtifactRunHandle) => void;
  onError: (err: DdmRuntimeError) => void;
  watchdogMs: number;
  stderrForward: (line: string) => void;
}

// ── Runtime interface ─────────────────────────────────────────────────────────

export interface DdmRuntime {
  launch(opts: DdmRuntimeLaunchOpts): Promise<void>;
  kill(): void;
}

// ── Route helper ──────────────────────────────────────────────────────────────

// Returns 'gateway' when env.gatewayUrl is set, 'local' otherwise.
export function resolveDdmRuntimeRoute(env: DdmEnvConfig): 'local' | 'gateway' {
  return env.gatewayUrl ? 'gateway' : 'local';
}
