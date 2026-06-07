# DDM Open Design — Fork Info

Upstream: github.com/nexu-io/open-design
Pinned-SHA: b3b5bbeced467e105c5332b300797dfa075cafa4
Forked: 2026-06-07
Rebase policy: deliberate only — never auto-track upstream main

## DDM Interventions (planned)

1. **Tailnet egress fix** — extend `ParsedBaseUrl` with `effectivePort`, add `DDM_LITERAL_IP_ALLOWLIST`
   in central validators for Tailscale `100.x.x.x` addresses (Z2, Omen)
2. **Gateway transport adapter** — `DdmRuntime` at `runtimes/` layer, `gateway-launch.ts` routing
   to OpenClaw / `claude_bridge` when `env.gatewayUrl` is set
3. **RAG-grounded prompt layer** — `rag/kb-preflight.ts`, inject after SKILL.md before metadata
4. **VLM verdict-honesty critique** — extend `packages/contracts/src/critique.ts` + Ollama qwen2.5-vl
5. **Provenance graph** — Neo4j `ddm_run_metadata` SQLite table, KindSpec routing via `ddmArtifactKind`

## Implementation plan

`~/.openclaw/workspace/directives/ddm-open-design-impl-plan.md` (status: approved-converged, 8 Codex review rounds)

## Phase 0 findings

`~/.openclaw/workspace/directives/ddm-od-phase0-findings.yaml` (26 entries, all confirmed)

## Streaming delta

Claude's `stream-json` prompt format keeps stdin open for `tool_result` injection. If
`claude_bridge` is single-shot, the gateway adapter must NOT fake token streaming — emit one
chunk on completion and close. See impl plan Phase 2 for handling guidance.
