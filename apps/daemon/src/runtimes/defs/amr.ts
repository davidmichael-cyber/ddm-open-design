import { detectAcpModels } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

// AMR is the vela CLI's ACP stdio mode. `vela agent run --runtime opencode`
// starts a private OpenCode server and forwards stream-json over ACP JSON-RPC.
// Required env (set on the daemon process or via Settings → CLI env):
//   VELA_RUNTIME_KEY  — OpenRouter (or compatible) API key
//   VELA_LINK_URL     — OpenAI-compatible endpoint, e.g. https://openrouter.ai/api/v1
//   VELA_OPENCODE_BIN — optional; absolute path to opencode when not on PATH
// See docs/new-agent-runtime-acp.md and the vela
// `specs/current/runtime/manual-agent-run-openrouter.md`.
//
// Model wiring notes (verified against a live `vela agent run --runtime
// opencode` against OpenRouter):
//
//   1. vela rejects `session/prompt` until `session/set_model` has been
//      called, so AMR cannot accept the synthetic `default` model id —
//      attachAcpSession skips set_model whenever model === 'default'. We
//      pin a concrete vela-compatible model as the default option so the
//      chat run always sets one explicitly.
//
//   2. vela auto-prepends `openai/` to whatever modelId we send (it shells
//      out to opencode's openai provider). So fallback ids must be the
//      bare model name (`gpt-5.4-mini`), NOT the OpenRouter-style
//      `openai/gpt-5.4-mini` — that becomes the double-prefixed
//      `openai/openai/gpt-5.4-mini` and opencode reports
//      `ProviderModelNotFoundError`.
//
//   3. The fallback list mirrors opencode's known openai-provider model
//      registry (which is what `vela --runtime opencode` ultimately routes
//      through). Anthropic / Google / etc. ids from OpenRouter do not work
//      here until vela ships additional `--runtime` adapters.
const AMR_DEFAULT_MODEL: RuntimeModelOption = {
  id: 'gpt-5.4-mini',
  label: 'gpt-5.4-mini (openrouter · default)',
};

export const amrAgentDef = {
  id: 'amr',
  name: 'AMR',
  bin: 'vela',
  versionArgs: ['--version'],
  fetchModels: async (resolvedBin, env) =>
    detectAcpModels({
      bin: resolvedBin,
      args: ['agent', 'run', '--runtime', 'opencode'],
      env,
      timeoutMs: 20_000,
      defaultModelOption: AMR_DEFAULT_MODEL,
    }),
  fallbackModels: [
    AMR_DEFAULT_MODEL,
    { id: 'gpt-5.4', label: 'gpt-5.4 (openrouter)' },
    { id: 'gpt-5.4-fast', label: 'gpt-5.4-fast (openrouter)' },
    { id: 'gpt-5.4-mini-fast', label: 'gpt-5.4-mini-fast (openrouter)' },
    { id: 'gpt-5.2', label: 'gpt-5.2 (openrouter)' },
  ],
  buildArgs: () => ['agent', 'run', '--runtime', 'opencode'],
  streamFormat: 'acp-json-rpc',
  // Daemon-process env override for the default model id (see
  // resolveModelForAgent in runtimes/models.ts). Lets operators swap the
  // hardcoded fallback (`gpt-5.4-mini`) without a code change when
  // opencode's openai-provider registry drops it upstream — just
  // `export VELA_DEFAULT_MODEL=gpt-5.5` before launching tools-dev / od.
  defaultModelEnvVar: 'VELA_DEFAULT_MODEL',
} satisfies RuntimeAgentDef;
