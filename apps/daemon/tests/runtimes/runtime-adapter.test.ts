import { describe, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  createRuntimeAdapter,
  RUNTIME_STREAM_FORMATS,
} from '../../src/runtimes/runtime-adapter.js';
import { AGENT_DEFS, assert, minimalAgentDef } from './helpers/test-helpers.js';

describe('runtime adapter foundation', () => {
  test('covers every stream format used by current runtime definitions', () => {
    const definedFormats = new Set(AGENT_DEFS.map((def) => def.streamFormat));

    assert.deepEqual(
      [...definedFormats].sort(),
      [...RUNTIME_STREAM_FORMATS].sort(),
    );

    for (const def of AGENT_DEFS) {
      const adapter = createRuntimeAdapter(def);
      assert.equal(adapter.id, def.id);
      assert.equal(adapter.displayName, def.name);
      assert.equal(adapter.streamFormat, def.streamFormat);
      assert.equal(adapter.eventParser, def.eventParser || def.id);
    }
  });

  test('exposes stdin behavior without leaking protocol checks to callers', () => {
    for (const def of AGENT_DEFS) {
      const adapter = createRuntimeAdapter(def);
      assert.equal(
        adapter.stdinMode(),
        def.promptViaStdin || def.streamFormat === 'acp-json-rpc'
          ? 'pipe'
          : 'ignore',
      );
      assert.equal(
        adapter.shouldWritePromptToStdin(),
        Boolean(def.promptViaStdin && def.streamFormat !== 'pi-rpc'),
      );
    }
  });

  test('keeps critique theater eligibility as an adapter capability', () => {
    for (const def of AGENT_DEFS) {
      assert.equal(
        createRuntimeAdapter(def).supportsCritiqueTheater(),
        def.streamFormat === 'plain',
      );
    }
  });

  test('exposes ACP MCP support as an adapter capability', () => {
    for (const def of AGENT_DEFS) {
      assert.equal(
        createRuntimeAdapter(def).acceptsExternalMcpServers(),
        def.streamFormat === 'acp-json-rpc',
      );
    }
  });

  test('classifies close status through attachment state', () => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough };
    child.stdout = new PassThrough();
    const plain = createRuntimeAdapter(minimalAgentDef({
      bin: 'plain-agent',
      streamFormat: 'plain',
    })).attach({
      child: child as never,
      prompt: 'hello',
      send: () => {},
    });

    assert.equal(plain.classifyClose({ code: 0, signal: null }), 'succeeded');
    assert.equal(plain.classifyClose({ code: 1, signal: null }), 'failed');
    assert.equal(
      plain.classifyClose({ code: null, signal: 'SIGTERM', canceled: true }),
      'canceled',
    );
  });

  test('keeps structured empty-output failures in adapter close classification', () => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough };
    child.stdout = new PassThrough();
    const structured = createRuntimeAdapter(minimalAgentDef({
      bin: 'opencode',
      id: 'opencode',
      streamFormat: 'json-event-stream',
    })).attach({
      child: child as never,
      prompt: 'hello',
      send: () => {},
    });

    assert.equal(structured.trackingSubstantiveOutput, true);
    assert.equal(structured.producedSubstantiveOutput(), false);
    assert.equal(structured.classifyClose({ code: 0, signal: null }), 'failed');
  });

  test('fails fast for unknown stream formats', () => {
    const def = minimalAgentDef({
      bin: 'ghost-agent',
      id: 'ghost-agent',
      streamFormat: 'ghost-stream',
    });

    assert.throws(
      () => createRuntimeAdapter(def),
      /Unsupported streamFormat "ghost-stream" for runtime "ghost-agent"/,
    );
  });
});
