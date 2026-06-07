#!/usr/bin/env node
// DDM VLM bake-off runner — Phase 4 prerequisite.
// Usage: pnpm tsx scripts/ddm-vlm-bakeoff.ts [--png <path>]
//
// Tests each candidate VLM model on Z2 Ollama with a real design screenshot
// and prints timing + finding quality summary. Results should be pasted into
// directives/ddm-od-vlm-bakeoff.md before committing Phase 4.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';

import { VlmCritiqueResultSchema } from '../packages/contracts/src/critique.js';

const OLLAMA_URL = 'http://100.96.148.86:11434';

const SYSTEM_PROMPT = `You are a pixel-level design QA reviewer for DDM Life Science artifacts.
Examine the rendered screenshot and return a structured JSON critique.

Dimensions to evaluate:
- hierarchy: visual weight, reading order, heading vs body contrast
- contrast_a11y: foreground/background contrast ratios, WCAG compliance
- spacing: consistent gutters, padding, alignment grid
- brand_token: correct use of DDM brand colors, typography, spacing tokens
- ai_slop: generic filler text, placeholder icons, unfinished sections
- layout: responsive breakpoints, overflow, clipping, z-index stacking errors

Return ONLY valid JSON matching this schema exactly (no markdown, no prose):
{
  "findings": [
    {
      "severity": "critical" | "major" | "minor" | "info",
      "dimension": "hierarchy" | "contrast_a11y" | "spacing" | "brand_token" | "ai_slop" | "layout",
      "description": "<what is wrong>",
      "pixelEvidence": "<specific element or region in the screenshot>",
      "actionableFix": "<precise change to resolve this finding>"
    }
  ],
  "overallScore": <0.0 to 1.0>,
  "converged": <true if no critical or major findings, else false>
}`;

interface BakeoffResult {
  model: string;
  latencyFirstTokenMs: number | null;
  latencyTotalMs: number;
  findingCount: number;
  criticalCount: number;
  majorCount: number;
  schemaValid: boolean;
  overallScore: number | null;
  error: string | null;
}

async function runModel(model: string, pngBase64: string): Promise<BakeoffResult> {
  const start = Date.now();
  let firstTokenMs: number | null = null;
  let rawResponse = '';
  let error: string | null = null;

  try {
    const body = {
      model,
      prompt: 'Review the attached design screenshot. Return the JSON critique only.',
      system: SYSTEM_PROMPT,
      images: [pngBase64],
      format: 'json',
      stream: true,
      options: { temperature: 0.1, num_predict: 2048 },
    };

    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '(no body)');
      throw new Error(`HTTP ${resp.status}: ${err}`);
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line) as { response?: string; done?: boolean };
          if (parsed.response && firstTokenMs === null) {
            firstTokenMs = Date.now() - start;
          }
          if (parsed.response) rawResponse += parsed.response;
        } catch { /* partial line */ }
      }
    }
  } catch (e) {
    error = String(e);
  }

  const totalMs = Date.now() - start;
  let schemaValid = false;
  let findingCount = 0;
  let criticalCount = 0;
  let majorCount = 0;
  let overallScore: number | null = null;

  if (!error && rawResponse) {
    try {
      const parsed = JSON.parse(rawResponse);
      const validated = VlmCritiqueResultSchema.parse(parsed);
      schemaValid = true;
      findingCount = validated.findings.length;
      criticalCount = validated.findings.filter((f) => f.severity === 'critical').length;
      majorCount = validated.findings.filter((f) => f.severity === 'major').length;
      overallScore = validated.overallScore;
    } catch (e) {
      error = `Schema validation failed: ${e}. Raw: ${rawResponse.slice(0, 300)}`;
    }
  }

  return {
    model,
    latencyFirstTokenMs: firstTokenMs,
    latencyTotalMs: totalMs,
    findingCount,
    criticalCount,
    majorCount,
    schemaValid,
    overallScore,
    error,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const pngFlagIdx = args.indexOf('--png');
  const pngPath = pngFlagIdx !== -1 ? args[pngFlagIdx + 1] : null;

  let pngBase64: string;
  if (pngPath) {
    const buf = await fs.readFile(pngPath);
    pngBase64 = buf.toString('base64');
    console.log(`Using screenshot: ${pngPath} (${buf.length} bytes)`);
  } else {
    // Fall back to a bundled screenshot from docs/screenshots
    const fallback = path.resolve(
      import.meta.dirname ?? __dirname,
      '../docs/screenshots/07-magazine-deck.png',
    );
    const buf = await fs.readFile(fallback);
    pngBase64 = buf.toString('base64');
    console.log(`Using fallback screenshot: ${fallback} (${buf.length} bytes)`);
  }

  // Fetch model list from Z2 to discover what's available
  const tagsResp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
  const tags = (await tagsResp.json()) as { models: Array<{ name: string }> };
  const available = tags.models.map((m) => m.name);
  console.log(`\nAvailable models on Z2: ${available.join(', ')}`);

  const candidates = [
    'qwen2.5vl:7b',
    'minicpm-v:8b',
  ].filter((m) => available.includes(m));

  if (candidates.length === 0) {
    console.error('\nNo VLM candidates available yet. Confirm model pull is in progress:');
    console.error('  curl -X POST http://100.96.148.86:11434/api/pull -d \'{"name":"qwen2.5vl:7b"}\'');
    process.exit(1);
  }

  console.log(`\nTesting ${candidates.length} model(s): ${candidates.join(', ')}\n`);

  const results: BakeoffResult[] = [];
  for (const model of candidates) {
    process.stdout.write(`Testing ${model}... `);
    const result = await runModel(model, pngBase64);
    results.push(result);
    if (result.error) {
      console.log(`ERROR: ${result.error}`);
    } else {
      console.log(
        `${result.latencyTotalMs}ms total (first token: ${result.latencyFirstTokenMs}ms) ` +
          `| score: ${result.overallScore?.toFixed(2)} ` +
          `| findings: ${result.findingCount} (crit: ${result.criticalCount} maj: ${result.majorCount}) ` +
          `| schema: ${result.schemaValid ? 'OK' : 'FAIL'}`,
      );
    }
  }

  console.log('\n--- BAKE-OFF SUMMARY ---');
  for (const r of results) {
    const status = r.error ? 'FAIL' : r.schemaValid ? 'PASS' : 'SCHEMA_ERR';
    console.log(
      `${r.model.padEnd(25)} ${status.padEnd(12)} ` +
        `${r.latencyTotalMs}ms  score=${r.overallScore?.toFixed(2) ?? 'N/A'}  ` +
        `findings=${r.findingCount}`,
    );
  }

  const winner = results.find((r) => r.schemaValid && !r.error);
  if (winner) {
    console.log(`\nRecommended: ${winner.model}`);
    console.log('Update directives/ddm-od-vlm-bakeoff.md with these results.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
