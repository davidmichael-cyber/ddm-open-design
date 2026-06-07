// DDM RAG preflight — Phase 3.
//
// Fetches design-context chunks from the DDM ChromaDB KB on Z2 before every
// generation run, grounding OD's output in ingested design language and domain
// constraints. Never passes raw brief text to ChromaDB; always decomposes into
// 3-5 focused sub-queries first (KB Query Decomposer discipline from TOOLS.md).
//
// Toggle: KB_PREFLIGHT=disabled skips retrieval (ablation test path).

import { DDM_LITERAL_IP_ALLOWLIST } from '../connectionTest.js';

const KB_PROXY_URL = 'http://100.96.148.86:8822';
const SCORE_THRESHOLD = 0.65;
const MAX_CHUNKS = 5;
// Rough token bound (~4 chars/token): 2000 tokens ≈ 8000 chars
const MAX_CONTEXT_CHARS = 8000;
const FETCH_TIMEOUT_MS = 4000;

export interface RetrievedChunk {
  text: string;
  score: number;
  collection: string;
  sourceFile: string;
  chunkId: string;    // "<source_hash>:<chunk_index>"
}

export interface RetrievedContext {
  chunks: RetrievedChunk[];
  subQueries: string[];
  retrievedAt: number;
}

type Domain = 'design' | 'pharma' | 'facility-planning';

interface KbSearchResult {
  document: string;
  similarity: number;
  collection: string;
  metadata: {
    source_file?: string;
    source_hash?: string;
    chunk_index?: number;
    [key: string]: unknown;
  };
}

interface KbSearchResponse {
  results: KbSearchResult[];
}

function buildSubQueries(brief: string, skillId: string, domain: Domain): string[] {
  const queries: string[] = [
    `${brief} UI component design system pattern`,
    `${brief} visual language brand identity color typography`,
    `${brief} spacing layout token CSS variable`,
    `${brief} interaction UX flow user experience`,
  ];
  if (domain === 'pharma' || domain === 'facility-planning') {
    queries.push(`${brief} pharmaceutical facility cleanroom GMP design`);
  }
  if (skillId && skillId.length > 0) {
    queries[0] = `${skillId} ${queries[0]}`;
  }
  return queries;
}

function collectionsForDomain(brief: string, domain: Domain): string[] {
  const base = ['ux-design', 'web-dev'];
  const lower = brief.toLowerCase();
  const isDdm =
    lower.includes('ddm') ||
    lower.includes('bright path') ||
    lower.includes('falcon field') ||
    skillId_signals(lower);
  if (isDdm) base.push('ddm-core');
  if (domain === 'pharma' || lower.includes('pharma') || lower.includes('cleanroom') || lower.includes('gmp')) {
    base.push('pharma-regulatory', 'pharma-facilities');
  }
  if (domain === 'facility-planning' || lower.includes('facility') || lower.includes('manufacturing')) {
    if (!base.includes('pharma-facilities')) base.push('pharma-facilities');
    base.push('facility-planning');
  }
  return [...new Set(base)];
}

function skillId_signals(lower: string): boolean {
  return lower.includes('lifescience') || lower.includes('life science') || lower.includes('proposal');
}

async function searchCollection(
  query: string,
  collection: string,
  nResults: number,
  signal: AbortSignal,
): Promise<RetrievedChunk[]> {
  let resp: Response;
  try {
    resp = await fetch(`${KB_PROXY_URL}/search/${encodeURIComponent(collection)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n_results: nResults }),
      signal,
    });
  } catch {
    return [];
  }
  if (!resp.ok) return [];
  let body: KbSearchResponse;
  try {
    body = (await resp.json()) as KbSearchResponse;
  } catch {
    return [];
  }
  return (body.results ?? [])
    .filter((r) => r.similarity >= SCORE_THRESHOLD)
    .map((r) => ({
      text: r.document,
      score: r.similarity,
      collection: r.collection ?? collection,
      sourceFile: r.metadata?.source_file ?? '(unknown)',
      chunkId: `${r.metadata?.source_hash ?? 'x'}:${r.metadata?.chunk_index ?? 0}`,
    }));
}

function dedupeByChunkId(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (seen.has(c.chunkId)) return false;
    seen.add(c.chunkId);
    return true;
  });
}

function trimToTokenBudget(chunks: RetrievedChunk[]): RetrievedChunk[] {
  let total = 0;
  const result: RetrievedChunk[] = [];
  for (const c of chunks) {
    if (total + c.text.length > MAX_CONTEXT_CHARS) break;
    total += c.text.length;
    result.push(c);
  }
  return result;
}

export async function retrieveDesignContext(
  brief: string,
  skillId: string,
  domain: Domain = 'design',
): Promise<RetrievedContext> {
  const retrievedAt = Date.now();

  if (process.env.KB_PREFLIGHT === 'disabled') {
    return { chunks: [], subQueries: [], retrievedAt };
  }

  // Confirm at least one Tailscale IP is in the allowlist — guard against
  // misconfiguration where Z2 is listed but the allowlist wasn't loaded.
  const z2Listed = DDM_LITERAL_IP_ALLOWLIST.some((e) => e.host === '100.96.148.86');
  if (!z2Listed) {
    console.warn('[kb-preflight] Z2 not in DDM_LITERAL_IP_ALLOWLIST — skipping retrieval');
    return { chunks: [], subQueries: [], retrievedAt };
  }

  const subQueries = buildSubQueries(brief, skillId, domain);
  const collections = collectionsForDomain(brief, domain);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let allChunks: RetrievedChunk[] = [];
  try {
    const requests = subQueries.flatMap((q) =>
      collections.map((col) => searchCollection(q, col, 3, controller.signal)),
    );
    const results = await Promise.all(requests);
    allChunks = results.flat();
  } finally {
    clearTimeout(timer);
  }

  const deduped = dedupeByChunkId(allChunks);
  const sorted = deduped.sort((a, b) => b.score - a.score);
  const trimmed = trimToTokenBudget(sorted.slice(0, MAX_CHUNKS));

  console.log(
    `[kb-preflight] retrieved ${trimmed.length} chunks (${allChunks.length} raw) from [${collections.join(', ')}] for skill="${skillId}"`,
  );
  for (const c of trimmed) {
    console.log(`[kb-preflight]   id=${c.chunkId} score=${c.score.toFixed(3)} src=${c.sourceFile}`);
  }

  return { chunks: trimmed, subQueries, retrievedAt };
}

export function formatRetrievedContextBlock(ctx: RetrievedContext): string {
  if (ctx.chunks.length === 0) return '';
  const chunkLines = ctx.chunks
    .map(
      (c) =>
        `[Source: ${c.sourceFile} | Score: ${c.score.toFixed(3)} | ID: ${c.chunkId}]\n${c.text}`,
    )
    .join('\n---\n');
  return (
    `\n\n=== RETRIEVED DESIGN CONTEXT (DDM KB) ===\n` +
    chunkLines +
    `\n=== END RETRIEVED CONTEXT — cite source IDs for any design decision they informed ===`
  );
}
