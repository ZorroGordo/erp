// ── Claude, over plain fetch ─────────────────────────────────────────────────
//
// Used to read supplier quotes: their layouts vary per supplier, so the regex
// extractor in comprobantes/extractor.ts (which reads invoice *headers*) can't
// pull a line-item table out of them.
//
// No SDK — Node 22 has global fetch and the repo commits node_modules, so
// adding a dependency is more expensive than the 40 lines below. Everything
// degrades quietly: with no API key configured the caller falls back to the
// deterministic path and the quote lands as ERROR for a human to complete.

import { config } from '../config';

const API_URL = 'https://api.anthropic.com/v1/messages';

export function llmEnabled(): boolean {
  return !!config.ANTHROPIC_API_KEY;
}

export interface LlmOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/** Single-turn completion. Returns null on any failure — never throws. */
export async function llmComplete(prompt: string, opts: LlmOptions = {}): Promise<string | null> {
  if (!config.ANTHROPIC_API_KEY) {
    console.warn('[llm] ANTHROPIC_API_KEY no configurada — se omite la extracción con IA');
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error('[llm] HTTP', res.status, (await res.text()).slice(0, 500));
      return null;
    }
    const json = await res.json() as { content?: { type: string; text?: string }[] };
    return (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('').trim() || null;
  } catch (err) {
    console.error('[llm]', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Completion expected to return JSON. Tolerates a ```json fence or prose around
 * the object, which is the usual way a "reply with JSON only" instruction goes
 * slightly wrong. Returns null when nothing parseable comes back.
 */
export async function llmJson<T>(prompt: string, opts: LlmOptions = {}): Promise<T | null> {
  const raw = await llmComplete(prompt, opts);
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const candidate = body.slice(start);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Trailing prose after the JSON value: walk back to the last closing brace.
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (end > 0) {
      try { return JSON.parse(candidate.slice(0, end + 1)) as T; } catch { /* fall through */ }
    }
    console.error('[llm] respuesta no parseable:', raw.slice(0, 300));
    return null;
  }
}
