// DDM Phase 4 — VLM verdict-honesty critique loop.
//
// Sends a rendered artifact PNG to qwen2.5-vl on Z2 Ollama for pixel-level
// design critique. Returns typed, Zod-validated findings. Results route by
// severity: info/minor are surface suggestions, major queues a tweak pass,
// critical blocks convergence and files a Codex mailbox gate request.
//
// Toggle: VLM_CRITIQUE=disabled skips the VLM pass entirely (ablation path).

import { type VlmCritiqueResult, VlmCritiqueResultSchema } from '@open-design/contracts/critique';

const OLLAMA_URL = process.env.DDM_VLM_OLLAMA_URL ?? 'http://100.96.148.86:11434';
// Ollama registry uses no hyphen: qwen2.5vl not qwen2.5-vl
const DEFAULT_MODEL = process.env.DDM_VLM_MODEL ?? 'qwen2.5vl:7b';
const TIMEOUT_MS = parseInt(process.env.DDM_VLM_TIMEOUT_MS ?? '60000', 10);

// Path where Codex gate requests land; daemon resolves ~ at runtime.
const CODEX_MAILBOX =
  process.env.DDM_CODEX_MAILBOX ?? `${process.env.HOME ?? '/tmp'}/.claude/codex-mailbox`;

const SYSTEM_PROMPT = `You are a pixel-level design QA reviewer for DDM Life Science artifacts.
Your task: examine the rendered screenshot and return a structured JSON critique.

Evaluate these dimensions:
- hierarchy: visual weight, reading order, heading vs body contrast
- contrast_a11y: foreground/background contrast ratios, WCAG compliance
- spacing: consistent gutters, padding, alignment grid
- brand_token: correct use of DDM brand colors, typography, and spacing tokens
- ai_slop: generic filler text ("Lorem ipsum", placeholder icons), unfinished sections
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

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system: string;
  images: string[];
  format: 'json';
  stream: false;
  options?: { temperature?: number; num_predict?: number };
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

export async function critiqueRender(
  pngBase64: string,
  designContext: { briefId: string; skillId: string; designSystemId?: string },
  model: string = DEFAULT_MODEL,
): Promise<VlmCritiqueResult> {
  if (process.env.VLM_CRITIQUE === 'disabled') {
    return { findings: [], overallScore: 1, converged: true };
  }

  const briefPart = `Brief ID: ${designContext.briefId}\nSkill: ${designContext.skillId}${
    designContext.designSystemId ? `\nDesign system: ${designContext.designSystemId}` : ''
  }`;

  const body: OllamaGenerateRequest = {
    model,
    prompt: `${briefPart}\n\nReview the attached rendered artifact screenshot. Return the JSON critique only.`,
    system: SYSTEM_PROMPT,
    images: [pngBase64],
    format: 'json',
    stream: false,
    options: { temperature: 0.1, num_predict: 2048 },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawResponse: string;
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '(no body)');
      throw new Error(`Ollama responded ${resp.status}: ${err}`);
    }
    const data = (await resp.json()) as OllamaGenerateResponse;
    rawResponse = data.response;
  } finally {
    clearTimeout(timer);
  }

  // Zod parse — throws ZodError on schema mismatch so caller can handle/log.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    throw new Error(`VLM returned non-JSON: ${rawResponse.slice(0, 200)}`);
  }

  const result = VlmCritiqueResultSchema.parse(parsed);

  // Enforce invariant: converged must be false if any critical/major finding present.
  const hasSevere = result.findings.some(
    (f) => f.severity === 'critical' || f.severity === 'major',
  );
  const coerced: VlmCritiqueResult = hasSevere
    ? { ...result, converged: false }
    : result;

  logCritiqueResult(coerced, designContext.briefId, model);

  // File Codex gate request for any critical findings.
  const criticals = coerced.findings.filter((f) => f.severity === 'critical');
  if (criticals.length > 0) {
    await fileCodexGateRequest(coerced, designContext, criticals).catch((e) => {
      console.error('[vlm-critic] codex gate write failed:', e);
    });
  }

  return coerced;
}

function logCritiqueResult(
  result: VlmCritiqueResult,
  briefId: string,
  model: string,
): void {
  const counts = { critical: 0, major: 0, minor: 0, info: 0 };
  for (const f of result.findings) counts[f.severity]++;
  console.log(
    `[vlm-critic] brief=${briefId} model=${model} score=${result.overallScore.toFixed(2)} ` +
      `converged=${result.converged} findings=${result.findings.length} ` +
      `(crit=${counts.critical} maj=${counts.major} min=${counts.minor} info=${counts.info})`,
  );
  for (const f of result.findings.filter((f) => f.severity === 'critical' || f.severity === 'major')) {
    console.warn(`[vlm-critic]   [${f.severity}/${f.dimension}] ${f.description}`);
    console.warn(`[vlm-critic]     evidence: ${f.pixelEvidence}`);
    console.warn(`[vlm-critic]     fix:      ${f.actionableFix}`);
  }
}

async function fileCodexGateRequest(
  result: VlmCritiqueResult,
  designContext: { briefId: string; skillId: string; designSystemId?: string },
  criticals: VlmCritiqueResult['findings'],
): Promise<void> {
  const { promises: fs } = await import('node:fs');
  const { join } = await import('node:path');

  const slug = `od-vlm-gate-${designContext.briefId.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
  const dir = join(CODEX_MAILBOX, slug);
  await fs.mkdir(dir, { recursive: true });

  const criticalBlock = criticals
    .map(
      (f) =>
        `### [${f.dimension}]\n**Description:** ${f.description}\n\n` +
        `**Pixel evidence:** ${f.pixelEvidence}\n\n**Actionable fix:** ${f.actionableFix}`,
    )
    .join('\n\n---\n\n');

  const body = `# Codex Review — OD Artifact Critique Gate
**Artifact ID:** ${designContext.briefId} | **Skill:** ${designContext.skillId}${
    designContext.designSystemId ? ` | **Design system:** ${designContext.designSystemId}` : ''
  }
**Convergence criterion:** Critical findings = 0
**Overall score:** ${result.overallScore.toFixed(2)}

## VLM Critical Findings (${criticals.length})

${criticalBlock}

## Review targets
For each critical finding: is pixel evidence correctly interpreted? Is the fix sufficient?
What did the VLM miss? Verdict: converged (no real criticals) or not-converged (criticals stand).
`;

  const requestPath = join(dir, 'request.md');
  const metaPath = join(dir, 'request.meta');

  await fs.writeFile(requestPath, body, 'utf8');
  await fs.writeFile(
    metaPath,
    JSON.stringify({
      slug,
      source: 'vlm-critic',
      briefId: designContext.briefId,
      criticalCount: criticals.length,
      timestamp: new Date().toISOString(),
    }),
    'utf8',
  );

  console.log(`[vlm-critic] codex gate filed: ${requestPath}`);
}
