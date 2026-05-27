import { execAgentFile } from './shared.js';
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
// Model wiring notes:
//
//   1. vela rejects `session/prompt` until `session/set_model` has been
//      called, so AMR cannot accept the synthetic `default` model id —
//      attachAcpSession skips set_model whenever model === 'default'.
//
//   2. Vela 0.0.1 exposes the current link-supported catalog through
//      `vela models`, but that command prints public ids such as
//      `public_model_glm_5`. The ACP `session/set_model` call accepts the
//      link-facing slug (`glm-5` / `glm-5.1`), so Open Design normalizes
//      those public ids at the daemon boundary until Vela exposes canonical
//      ACP ids directly.
export function normalizeVelaModelId(rawId: string): string | null {
  const trimmed = rawId.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.startsWith('public_model_')
    ? trimmed.slice('public_model_'.length)
    : trimmed;
  if (!withoutPrefix) return null;
  if (/^glm_5_1$/i.test(withoutPrefix)) return 'glm-5.1';
  if (/^glm_5$/i.test(withoutPrefix)) return 'glm-5';
  return withoutPrefix.replace(/_/g, '-');
}

export function parseVelaModels(stdout: string): RuntimeModelOption[] {
  const seen = new Set<string>();
  const models: RuntimeModelOption[] = [];
  for (const line of String(stdout || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [rawId, provider] = trimmed.split(/\s+/);
    if (!rawId) continue;
    const id = normalizeVelaModelId(rawId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const providerLabel = provider ? ` (${provider})` : '';
    models.push({ id, label: `${id}${providerLabel}` });
  }
  return models;
}

export const amrAgentDef = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'vela',
  versionArgs: ['--version'],
  fetchModels: async (resolvedBin, env) => {
    const { stdout } = await execAgentFile(resolvedBin, ['models'], {
      env,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return parseVelaModels(String(stdout));
  },
  // Fail closed when Vela's live catalog is unavailable. Stale static
  // fallbacks let users select models that link/opencode no longer accepts.
  fallbackModels: [] as RuntimeModelOption[],
  buildArgs: () => ['agent', 'run', '--runtime', 'opencode'],
  streamFormat: 'acp-json-rpc',
  // Daemon-process env override for emergency operator pinning. Normal UI
  // selection comes from the live `vela models` catalog and is preflighted
  // before spawn.
  defaultModelEnvVar: 'VELA_DEFAULT_MODEL',
} satisfies RuntimeAgentDef;
