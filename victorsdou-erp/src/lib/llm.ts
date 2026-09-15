// ── LLM, over plain fetch, provider-agnostic ─────────────────────────────────
//
// Used to read supplier quotes: their layouts vary per supplier, so the regex
// extractor in comprobantes/extractor.ts (which reads invoice *headers*) can't
// pull a line-item table out of them.
//
// Two drivers:
//   • `openai`    — the /chat/completions shape. OpenAI, Groq, DeepSeek,
//                   Mistral, Together, OpenRouter and every self-hosted runner
//                   (Ollama, vLLM, llama.cpp) all speak it, so a base URL plus
//                   a model name is enough to point this anywhere, including a
//                   model running on our own hardware.
//   • `anthropic` — the /v1/messages shape.
//
// No SDK for either: node 22 has global fetch and this repo commits
// node_modules, so a dependency costs more than the ~60 lines below.
//
// Everything degrades quietly. With no provider configured the caller falls
// back to the deterministic path and the quote lands for a human to complete —
// the flow never depends on the model being reachable.

import { config } from '../config';

export type LlmProvider = 'anthropic' | 'openai' | 'off';

export interface LlmStatus {
  provider: LlmProvider;
  model: string | null;
  baseUrl: string | null;
  configured: boolean;
}

/**
 * Which driver to use. An explicit LLM_PROVIDER always wins; otherwise infer it
 * from whichever credentials are present, so adding LLM_API_KEY is enough to
 * switch providers and removing it is enough to fall back.
 */
export function resolveProvider(): LlmProvider {
  if (config.LLM_PROVIDER) return config.LLM_PROVIDER;
  if (config.LLM_API_KEY || config.LLM_BASE_URL) return 'openai';
  if (config.ANTHROPIC_API_KEY) return 'anthropic';
  return 'off';
}

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export function llmStatus(): LlmStatus {
  const provider = resolveProvider();
  if (provider === 'anthropic') {
    return {
      provider,
      model: config.LLM_MODEL || config.ANTHROPIC_MODEL,
      baseUrl: 'https://api.anthropic.com',
      configured: !!config.ANTHROPIC_API_KEY,
    };
  }
  if (provider === 'openai') {
    const baseUrl = (config.LLM_BASE_URL || DEFAULT_OPENAI_BASE).replace(/\/$/, '');
    // A local runner (Ollama, vLLM) needs no key, so "configured" only requires
    // one when we're talking to something off-box.
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(baseUrl);
    return {
      provider,
      model: config.LLM_MODEL || DEFAULT_OPENAI_MODEL,
      baseUrl,
      configured: local || !!config.LLM_API_KEY,
    };
  }
  return { provider: 'off', model: null, baseUrl: null, configured: false };
}

export function llmEnabled(): boolean {
  return llmStatus().configured;
}

export interface LlmOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/** Single-turn completion. Returns null on any failure — never throws. */
export async function llmComplete(prompt: string, opts: LlmOptions = {}): Promise<string | null> {
  const status = llmStatus();
  if (!status.configured) {
    console.warn(`[llm] sin proveedor configurado (LLM_PROVIDER=${status.provider}) — se omite la extracción con IA`);
    return null;
  }

  // Cap the prompt so an unusually long document can't run up a bill, whatever
  // the provider charges.
  const capped = prompt.length > config.LLM_MAX_INPUT_CHARS
    ? prompt.slice(0, config.LLM_MAX_INPUT_CHARS)
    : prompt;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
  try {
    return status.provider === 'anthropic'
      ? await completeAnthropic(capped, opts, status, ctrl.signal)
      : await completeOpenAI(capped, opts, status, ctrl.signal);
  } catch (err) {
    console.error('[llm]', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function completeAnthropic(
  prompt: string, opts: LlmOptions, status: LlmStatus, signal: AbortSignal,
): Promise<string | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: status.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  });
  if (!res.ok) {
    console.error('[llm][anthropic] HTTP', res.status, (await res.text()).slice(0, 500));
    return null;
  }
  const json = await res.json() as { content?: { type: string; text?: string }[] };
  return (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('').trim() || null;
}

async function completeOpenAI(
  prompt: string, opts: LlmOptions, status: LlmStatus, signal: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${status.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Local runners accept (and ignore) a missing key.
      ...(config.LLM_API_KEY ? { authorization: `Bearer ${config.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: status.model,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
    signal,
  });
  if (!res.ok) {
    console.error('[llm][openai] HTTP', res.status, (await res.text()).slice(0, 500));
    return null;
  }
  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Completion expected to return JSON. Tolerates a ```json fence or prose around
 * the object, which is the usual way a "reply with JSON only" instruction goes
 * slightly wrong — and it goes wrong more often on smaller/cheaper models, so
 * this matters more the cheaper the provider. Returns null when nothing
 * parseable comes back.
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
