/**
 * Integration coverage for the AMR (vela) ACP runtime def.
 *
 * Spawns the fake vela stub at tests/fixtures/fake-vela.mjs (which speaks
 * just enough ACP JSON-RPC to drive one turn) and verifies the daemon's
 * `attachAcpSession` + `detectAcpModels` can walk through initialize →
 * session/new → session/set_model → session/prompt without hand-stubbing
 * the child stream.
 *
 * The runtime def itself (apps/daemon/src/runtimes/defs/amr.ts) is a pure
 * data record, so this test also pins the contract the def declares:
 *   - id, bin, streamFormat are stable for downstream consumers
 *   - buildArgs() emits the vela invocation shape the docs describe
 *   - AMR picker models come from `vela models`, not stale static ids.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { attachAcpSession, detectAcpModels } from '../src/acp.js';
import {
  amrAgentDef,
  normalizeVelaModelId,
  parseVelaModels,
} from '../src/runtimes/defs/amr.js';
import { getAgentDef } from '../src/runtimes/registry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_VELA = path.join(HERE, 'fixtures', 'fake-vela.mjs');

function spawnFakeVela(env: NodeJS.ProcessEnv = {}): ChildProcess {
  return spawn(process.execPath, [FAKE_VELA], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

function spawnFixtureScript(source: string): ChildProcess {
  return spawn(process.execPath, ['-e', source], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('close', () => resolve());
    child.once('exit', () => resolve());
  });
}

describe('AMR runtime def', () => {
  it('is registered with the expected ACP wiring', () => {
    const def = getAgentDef('amr');
    expect(def).toBeTruthy();
    expect(def?.id).toBe('amr');
    expect(def?.bin).toBe('vela');
    expect(def?.streamFormat).toBe('acp-json-rpc');
  });

  it('builds the documented `vela agent run --runtime opencode` argv', () => {
    expect(amrAgentDef.buildArgs()).toEqual([
      'agent',
      'run',
      '--runtime',
      'opencode',
    ]);
  });

  it('fails closed instead of exposing static stale fallback models', () => {
    // Real vela rejects session/prompt without a prior session/set_model,
    // and attachAcpSession skips set_model whenever model === 'default'.
    // AMR must rely on the live `vela models` catalog so stale defaults like
    // gpt-5.4-mini cannot be offered after link stops accepting them.
    const ids = amrAgentDef.fallbackModels.map((m) => m.id);
    expect(ids).not.toContain('default');
    expect(ids).not.toContain('gpt-5.4-mini');
    expect(ids).toEqual([]);
  });

  it('normalizes Vela public model ids to ACP model ids', () => {
    expect(normalizeVelaModelId('public_model_glm_5')).toBe('glm-5');
    expect(normalizeVelaModelId('public_model_glm_5_1')).toBe('glm-5.1');
    expect(normalizeVelaModelId('public_model_qwen3_235b_a22b')).toBe('qwen3-235b-a22b');
    expect(normalizeVelaModelId('glm-5')).toBe('glm-5');
  });

  it('parses `vela models` output without adding stale gpt fallbacks', () => {
    const models = parseVelaModels([
      'public_model_glm_5    vela',
      'public_model_glm_5_1  vela',
      'public_model_glm_5    vela',
      '',
    ].join('\n'));
    expect(models).toEqual([
      { id: 'glm-5', label: 'glm-5 (vela)' },
      { id: 'glm-5.1', label: 'glm-5.1 (vela)' },
    ]);
  });

  it('fetches AMR picker models from `vela models`', async () => {
    const models = await amrAgentDef.fetchModels?.(FAKE_VELA, process.env);
    const ids = (models || []).map((m) => m.id);
    expect(ids).toContain('glm-5');
    expect(ids).toContain('glm-5.1');
    expect(ids).not.toContain('gpt-5.4-mini');
  });
});

describe('AMR ACP transport — end-to-end against fake vela stub', () => {
  it('drives a complete turn: initialize → session/new → session/set_model → session/prompt', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_TEXT: 'Hello from AMR.',
      FAKE_VELA_THOUGHT: 'thinking-chunk',
    });
    const events: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        // Pass a real model id so attachAcpSession sends session/set_model
        // before session/prompt, matching the real vela contract the AMR
        // runtime def encodes.
        model: 'glm-5',
        mcpServers: [],
        send: (event, payload) => {
          events.push({ event, payload });
        },
      });

      // attachAcpSession owns the stdin lifecycle: it sends initialize on
      // construction and ends stdin after session/prompt completes. We just
      // wait for the child to exit on its own.
      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const textDeltas = events
      .filter((e) => {
        const payload = e.payload as { type?: unknown };
        return e.event === 'agent' && payload.type === 'text_delta';
      })
      .map((e) => (e.payload as { delta?: unknown }).delta);

    expect(textDeltas.join('')).toBe('Hello from AMR.');

    const thinkingDeltas = events
      .filter((e) => {
        const payload = e.payload as { type?: unknown };
        return e.event === 'agent' && payload.type === 'thinking_delta';
      })
      .map((e) => (e.payload as { delta?: unknown }).delta);
    expect(thinkingDeltas.join('')).toBe('thinking-chunk');
  });

  it('regression: stub mirrors real vela by rejecting session/prompt before session/set_model', async () => {
    const child = spawnFakeVela({ FAKE_VELA_TEXT: 'unused' });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        // model === 'default' triggers the daemon to skip session/set_model.
        // Against a vela-faithful stub that should surface as a fatal error,
        // not a silent success — otherwise this same call path would also
        // silently fail against a real vela in production.
        model: 'default',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    expect(errors.length).toBeGreaterThan(0);
    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message.toLowerCase()).toContain('session/set_model');
  });

  it('detectAcpModels surfaces availableModels from the vela ACP session/new response', async () => {
    const result = await detectAcpModels({
      bin: process.execPath,
      args: [FAKE_VELA],
      env: process.env,
      timeoutMs: 10_000,
      defaultModelOption: { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini (default)' },
    });
    const ids = (result || []).map((m) => m.id);
    expect(ids).toContain('gpt-5.4-mini');
    expect(ids).toContain('openai/gpt-5.4-mini');
    expect(ids).toContain('anthropic/claude-3.7-sonnet');
  });

  it('surfaces session/new JSON-RPC errors as fatal daemon events', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_SESSION_NEW_ERROR: 'forced session/new failure',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('forced session/new failure');
  });

  it('surfaces unrecoverable session/set_model failures as fatal daemon events', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_SET_MODEL_ERROR: 'forced session/set_model failure',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('forced session/set_model failure');
  });

  it('surfaces session/prompt JSON-RPC errors as fatal daemon events', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_PROMPT_ERROR: 'forced session/prompt failure',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('forced session/prompt failure');
  });

  it('maps ACP model-not-found prompt errors to AMR_MODEL_UNAVAILABLE', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_PROMPT_ERROR: 'Model not found: vela/gpt-5.4-mini.',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'gpt-5.4-mini',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown };
    };
    expect(String(payload?.message ?? '')).toContain('Model not found');
    expect(payload?.error?.code).toBe('AMR_MODEL_UNAVAILABLE');
  });

  it('fails clean ACP completions that produce no assistant text', async () => {
    const child = spawnFakeVela({ FAKE_VELA_TEXT: '' });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('without producing any assistant text');
  });

  it('surfaces an actionable error when the ACP child exits before initialize completes', async () => {
    const child = spawnFixtureScript(
      "process.stdout.write('not-json\\n'); setTimeout(() => process.exit(0), 20);",
    );
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('ACP session exited before completion');
  });

  it('times out silent ACP children instead of hanging forever', async () => {
    const child = spawnFixtureScript(
      'setTimeout(() => process.exit(0), 200);',
    );
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        stageTimeoutMs: 25,
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('timed out');
  });
});
