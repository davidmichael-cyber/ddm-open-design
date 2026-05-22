#!/usr/bin/env -S node --experimental-strip-types
/**
 * agent-pr-explore-extract.ts — render the agent's STEP markers into
 * the PR comment markdown that matches the spec's "Comment output
 * format" contract.
 *
 * Wire format (per spec § Wire format and parser):
 *
 *   STEP_START|step-NN|<single-line UTF-8 title>
 *   STEP_DONE|step-NN|<status>|<single-line UTF-8 verdict text>
 *
 * Where `<status>` ∈ {pass, warning, fail, inconclusive}. The status
 * is declared by the agent explicitly — the renderer does not infer
 * it from free-form prose phrasing.
 *
 * Validation failure (malformed marker, missing pair, length overflow,
 * duplicate id, non-monotonic id, unknown status) surfaces in the
 * report as `status: unknown` with the raw text exposed, never silent
 * drop. Per spec § Wire format.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

type Status = "pass" | "warning" | "fail" | "inconclusive" | "unknown";

interface CliArgs {
  input: string;
  pr: string;
  head: string;
  approver: string;
  output: string;
  mixedPr: boolean;
}

interface Step {
  id: string;
  title: string;
  verdict: string;
  status: Status;
  rawError: string;
}

interface Sediment {
  target: string;
  rationale: string;
  scenario: string;
}

interface ParsedRun {
  steps: Step[];
  sediments: Sediment[];
  overall: "pass" | "fail" | "inconclusive" | "unknown";
  overallRationale: string;
  assistantTurns: number;
  outputTokens: number;
  toolCounts: Map<string, number>;
}

// Greedy `(.+)` in the third group lets `|` appear inside verdict text;
// the parser stops splitting after the third pipe by construction.
const STEP_START_LINE = /^STEP_START\|(step-\d{2,})\|(.+)$/;
const STEP_DONE_LINE = /^STEP_DONE\|(step-\d{2,})\|(pass|warning|fail|inconclusive)\|(.+)$/;
const SEDIMENT_LINE = /^SEDIMENT\|([^|]+)\|([^|]+)\|(.+)$/;
const RUN_DONE_LINE = /^RUN_DONE\|(pass|fail|inconclusive)\|(.+)$/;
const MAX_FIELD_LEN = 500;

function cliParse(): CliArgs {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      pr: { type: "string" },
      head: { type: "string" },
      approver: { type: "string" },
      output: { type: "string" },
      "mixed-pr": { type: "boolean" },
    },
  });
  const input = values.input;
  const pr = values.pr;
  const head = values.head;
  const approver = values.approver;
  const output = values.output;
  if (!input) throw new Error("missing --input");
  if (!pr) throw new Error("missing --pr");
  if (!head) throw new Error("missing --head");
  if (!approver) throw new Error("missing --approver");
  if (!output) throw new Error("missing --output");
  return { input, pr, head, approver, output, mixedPr: Boolean(values["mixed-pr"]) };
}

function iterateTextBlocks(rawInput: string): string[] {
  const blocks: string[] = [];
  const trimmed = rawInput.trim();
  if (!trimmed) return blocks;

  const extract = (ev: unknown): string | null => {
    if (ev && typeof ev === "object") {
      const obj = ev as Record<string, unknown>;
      if (typeof obj.text === "string") return obj.text;
      const message = obj.message;
      if (message && typeof message === "object") {
        const content = (message as Record<string, unknown>).content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c && typeof c === "object") {
              const cc = c as Record<string, unknown>;
              if (cc.type === "text" && typeof cc.text === "string") return cc.text;
            }
          }
        }
      }
    }
    return null;
  };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const events: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { events?: unknown[] }).events)
        ? ((parsed as { events: unknown[] }).events)
        : [];
      for (const ev of events) {
        const text = extract(ev);
        if (text !== null) blocks.push(text);
      }
      return blocks;
    } catch {
      /* fall through to NDJSON */
    }
  }

  for (const line of trimmed.split("\n")) {
    if (!line) continue;
    try {
      const ev: unknown = JSON.parse(line);
      const text = extract(ev);
      if (text !== null) blocks.push(text);
    } catch {
      /* ignore unparseable lines */
    }
  }
  return blocks;
}

function appendError(step: Step, reason: string): void {
  step.status = "unknown";
  step.rawError = step.rawError ? `${step.rawError} · ${reason}` : reason;
}

function makeStep(id: string): Step {
  return { id, title: "", verdict: "", status: "unknown", rawError: "" };
}

function parseRun(rawInput: string): ParsedRun {
  const steps = new Map<string, Step>();
  const stepOrder: string[] = [];
  const sediments: Sediment[] = [];
  let overall: ParsedRun["overall"] = "unknown";
  let overallRationale = "";
  const seenStart = new Set<string>();
  const seenDone = new Set<string>();
  let lastNumericId = 0;

  const ensureStep = (id: string): Step => {
    let s = steps.get(id);
    if (!s) {
      s = makeStep(id);
      steps.set(id, s);
      stepOrder.push(id);
      // Monotonic / no-skip / starts-at-step-01 enforced on first sighting.
      const numericId = Number.parseInt(id.replace("step-", ""), 10);
      const expected = lastNumericId + 1;
      if (Number.isNaN(numericId) || numericId !== expected) {
        const reason =
          lastNumericId === 0 && numericId !== 1
            ? `first step-id was ${id}, expected step-01`
            : `step-id ${id} not monotonic (expected step-${String(expected).padStart(2, "0")})`;
        appendError(s, reason);
      }
      if (!Number.isNaN(numericId)) lastNumericId = numericId;
    }
    return s;
  };

  for (const text of iterateTextBlocks(rawInput)) {
    for (const rawLine of text.split("\n")) {
      const ln = rawLine.trim();
      if (!ln) continue;

      const sMatch = STEP_START_LINE.exec(ln);
      if (sMatch && sMatch[1] && sMatch[2]) {
        const id = sMatch[1];
        const payload = sMatch[2];
        const step = ensureStep(id);
        if (seenStart.has(id)) {
          appendError(step, `duplicate STEP_START for ${id}`);
          continue;
        }
        seenStart.add(id);
        if (payload.length > MAX_FIELD_LEN) {
          appendError(step, `title exceeded ${MAX_FIELD_LEN} chars`);
          continue;
        }
        step.title = payload;
        continue;
      }

      const dMatch = STEP_DONE_LINE.exec(ln);
      if (dMatch && dMatch[1] && dMatch[2] && dMatch[3]) {
        const id = dMatch[1];
        const status = dMatch[2] as "pass" | "warning" | "fail" | "inconclusive";
        const payload = dMatch[3];
        const step = ensureStep(id);
        if (seenDone.has(id)) {
          appendError(step, `duplicate STEP_DONE for ${id}`);
          continue;
        }
        seenDone.add(id);
        if (payload.length > MAX_FIELD_LEN) {
          appendError(step, `verdict exceeded ${MAX_FIELD_LEN} chars`);
          continue;
        }
        step.verdict = payload;
        // Status assignment is **monotonic toward unknown**: once a
        // structural validation failure has set step.rawError, no
        // later agent-declared status can move the step out of
        // "unknown". This preserves the parser's earlier integrity
        // check (duplicate id / non-monotonic / overflow) even when
        // the agent goes on to declare its own pass/warning/fail.
        if (step.rawError === "") {
          step.status = status;
        }
        continue;
      }

      const sedMatch = SEDIMENT_LINE.exec(ln);
      if (sedMatch && sedMatch[1] && sedMatch[2] && sedMatch[3]) {
        sediments.push({
          target: sedMatch[1].trim(),
          rationale: sedMatch[2].trim(),
          scenario: sedMatch[3].trim(),
        });
        continue;
      }

      const runMatch = RUN_DONE_LINE.exec(ln);
      if (runMatch && runMatch[1] && runMatch[2]) {
        overall = runMatch[1] as ParsedRun["overall"];
        overallRationale = runMatch[2].trim();
      }
    }
  }

  // Step missing one of START/DONE → unknown with explicit reason.
  for (const step of steps.values()) {
    if (!step.title) appendError(step, "missing STEP_START");
    if (!step.verdict) appendError(step, "missing STEP_DONE");
  }

  return {
    steps: stepOrder.map((id) => {
      const s = steps.get(id);
      if (!s) throw new Error(`internal: step ${id} dropped`);
      return s;
    }),
    sediments,
    overall,
    overallRationale,
    assistantTurns: 0,
    outputTokens: 0,
    toolCounts: new Map<string, number>(),
  };
}

function renderMarkdown(parsed: ParsedRun, args: CliArgs): string {
  const passed = parsed.steps.filter((s) => s.status === "pass");
  const warnings = parsed.steps.filter((s) => s.status === "warning");
  const failures = parsed.steps.filter((s) => s.status === "fail");
  const unknowns = parsed.steps.filter((s) => s.status === "unknown");
  const findings = [...failures, ...warnings, ...unknowns];

  const overallEmoji =
    parsed.overall === "fail"
      ? "❌"
      : parsed.overall === "pass"
      ? "✅"
      : parsed.overall === "inconclusive"
      ? "⚠️"
      : "⚠️";

  const overallText = parsed.overall === "unknown" ? "inconclusive (no RUN_DONE marker)" : parsed.overall;

  const lines: string[] = [];
  const add = (s: string): void => {
    lines.push(s);
  };

  add("## 🤖 Agent Explore Report");
  add("");
  add(
    `**Verdict**: ${overallEmoji} ${overallText} · **Coverage**: ${parsed.steps.length} scenarios · **Approved by**: @${args.approver}`,
  );
  add(
    `**Findings**: ${failures.length} fail · ${warnings.length} warning · ${unknowns.length} unknown · ${passed.length} pass`,
  );
  add("");

  if (args.mixedPr) {
    add(
      "> ⚠️ **Mixed-surface PR**: this PR touches both `apps/web` and `apps/landing-page`. v1 ran only the `apps/web` pass; landing-page changes were not verified by this run. Please review landing-page manually or push a landing-page-only follow-up commit. See spec § Launch model.",
    );
    add("");
  }

  if (findings.length > 0) {
    add("### Findings worth attention");
    add("");
    for (const step of findings) {
      const icon = step.status === "fail" ? "❌" : step.status === "unknown" ? "❓" : "⚠️";
      const title = step.title || "(missing title)";
      add(`#### ${icon} ${step.id} — ${title}`);
      add("");
      if (step.status === "unknown") {
        add(
          `verdict parsing failed for ${step.id} — see raw transcript in artifact (${step.rawError || "unknown reason"}).`,
        );
        if (step.verdict) {
          add("");
          add(`> ${step.verdict}`);
        }
      } else {
        add(step.verdict || "(no verdict text)");
      }
      add("");
    }
  }

  if (passed.length > 0) {
    add(`<details>`);
    add(`<summary>✅ ${passed.length} scenarios passed — click to expand</summary>`);
    add("");
    for (const step of passed) {
      add(`### ✅ ${step.id} — ${step.title}`);
      add("");
      add(step.verdict);
      add("");
    }
    add("</details>");
    add("");
  }

  add("<details>");
  add("<summary>📊 Run footprint</summary>");
  add("");
  add(`- Steps emitted: ${parsed.steps.length}`);
  if (parsed.overallRationale) add(`- Overall rationale: ${parsed.overallRationale}`);
  add("</details>");
  add("");

  if (parsed.sediments.length > 0) {
    add(`<details>`);
    add(`<summary>💡 ${parsed.sediments.length} sediment candidates — scenarios worth promoting to permanent test suite</summary>`);
    add("");
    parsed.sediments.forEach((sed, i) => {
      add(`${i + 1}. **${sed.target}**`);
      add(`   - Scenario: ${sed.scenario}`);
      add(`   - Rationale: ${sed.rationale}`);
      add("");
    });
    add(
      "These are **suggestions, not commits**. The follow-on Sedimentation Bot batches these and proposes PRs; manual review before any `e2e/` change.",
    );
    add("</details>");
    add("");
  }

  add("---");
  add(
    `_Advisory only · never blocks merge · PR #${args.pr} @ \`${args.head.slice(0, 8)}\` · wrapper v2.0 · session jsonl in artifact_`,
  );

  return lines.join("\n") + "\n";
}

function main(): void {
  const args = cliParse();
  let rawInput = "";
  try {
    rawInput = readFileSync(args.input, "utf-8");
  } catch {
    rawInput = "";
    console.error(`extract: input not found at ${args.input}, rendering empty report`);
  }
  const parsed = parseRun(rawInput);
  const md = renderMarkdown(parsed, args);
  writeFileSync(args.output, md, "utf-8");
  console.error(
    `extract: wrote ${md.length} bytes to ${args.output} (${parsed.steps.length} steps, ${parsed.sediments.length} sediments, overall=${parsed.overall})`,
  );
}

main();
