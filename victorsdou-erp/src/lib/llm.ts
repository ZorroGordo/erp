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

export interface LlmAttachment {
  mimeType: string;
  dataBase64: string;
}

export interface LlmOptions {
  system?: string;
  maxTokens?: number;
  /**
   * Only sent when set. Newer models reject the parameter outright ("`temperature`
   * is deprecated for this model" → HTTP 400), which is what broke every quote
   * extraction on Sep 23 2026, so the default is to leave it out.
   */
  temperature?: number;
  timeoutMs?: number;
  /**
   * The original document (PDF or image). Sent natively to providers that read
   * it (Anthropic: PDF + images; OpenAI-compatible: images), alongside the
   * extracted text — a photo or a scanned factura reads far better this way
   * than through OCR text alone.
   */
  attachment?: LlmAttachment | null;
}

export interface LlmResult {
  text: string | null;
  error: string | null;
}

// Anthropic's request limit is 32 MB; stay well under it and skip attaching
// anything big (the extracted text still goes).
const MAX_ATTACHMENT_B64 = 8_000_000;

/** Single-turn completion. Returns null on any failure — never throws. */
export async function llmComplete(prompt: string, opts: LlmOptions = {}): Promise<string | null> {
  return (await llmCompleteResult(prompt, opts)).text;
}

/** Like llmComplete, but says why it failed so the UI can show it. */
export async function llmCompleteResult(prompt: string, opts: LlmOptions = {}): Promise<LlmResult> {
  const status = llmStatus();
  if (!status.configured) {
    console.warn(`[llm] sin proveedor configurado (LLM_PROVIDER=${status.provider}) — se omite la extracción con IA`);
    return { text: null, error: 'IA no configurada' };
  }

  // Cap the prompt so an unusually long document can't run up a bill, whatever
  // the provider charges.
  const capped = prompt.length > config.LLM_MAX_INPUT_CHARS
    ? prompt.slice(0, config.LLM_MAX_INPUT_CHARS)
    : prompt;

  const attachment = opts.attachment && opts.attachment.dataBase64.length <= MAX_ATTACHMENT_B64
    ? opts.attachment : null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
  const call = (o: LlmOptions, att: LlmAttachment | null) => status.provider === 'anthropic'
    ? completeAnthropic(capped, o, status, ctrl.signal, att)
    : completeOpenAI(capped, o, status, ctrl.signal, att);
  try {
    let r = await call(opts, attachment);
    // A model that rejects a sampling parameter: retry once without it.
    if (!r.text && r.error && /temperature/i.test(r.error) && opts.temperature !== undefined) {
      r = await call({ ...opts, temperature: undefined }, attachment);
    }
    // A provider/model that can't take the file: retry text-only.
    if (!r.text && r.error && attachment && /^HTTP 4\d\d/.test(r.error) && !/temperature/i.test(r.error)) {
      r = await call(opts, null);
    }
    return r;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[llm]', msg);
    return { text: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Short, human-readable reason from a provider error body. */
function errorDetail(status: number, body: string): string {
  let msg = body.slice(0, 300);
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    msg = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? msg;
  } catch { /* not JSON */ }
  return `HTTP ${status}: ${msg}`;
}

async function completeAnthropic(
  prompt: string, opts: LlmOptions, status: LlmStatus, signal: AbortSignal, att: LlmAttachment | null,
): Promise<LlmResult> {
  const mime = (att?.mimeType ?? '').toLowerCase();
  const fileBlock = !att ? null
    : mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.dataBase64 } }
      : /^image\/(jpeg|png|gif|webp)$/.test(mime)
        ? { type: 'image', source: { type: 'base64', media_type: mime, data: att.dataBase64 } }
        : null;
  const content = fileBlock ? [fileBlock, { type: 'text', text: prompt }] : prompt;
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
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content }],
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[llm][anthropic] HTTP', res.status, body.slice(0, 500));
    return { text: null, error: errorDetail(res.status, body) };
  }
  const json = await res.json() as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('').trim() || null;
  return { text, error: text ? null : 'respuesta vacía del modelo' };
}

async function completeOpenAI(
  prompt: string, opts: LlmOptions, status: LlmStatus, signal: AbortSignal, att: LlmAttachment | null,
): Promise<LlmResult> {
  // The chat/completions shape only takes images portably; PDFs go as text.
  const mime = (att?.mimeType ?? '').toLowerCase();
  const userContent = att && /^image\//.test(mime)
    ? [{ type: 'image_url', image_url: { url: `data:${mime};base64,${att.dataBase64}` } }, { type: 'text', text: prompt }]
    : prompt;
  const res = await fetch(`${status.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Local runners accept (and ignore) a missing key.
      ...(config.LLM_API_KEY ? { authorization: `Bearer ${config.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: status.model,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: userContent },
      ],
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[llm][openai] HTTP', res.status, body.slice(0, 500));
    return { text: null, error: errorDetail(res.status, body) };
  }
  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim() || null;
  return { text, error: text ? null : 'respuesta vacía del modelo' };
}

/**
 * Completion expected to return JSON. Tolerates a ```json fence or prose around
 * the object, which is the usual way a "reply with JSON only" instruction goes
 * slightly wrong — and it goes wrong more often on smaller/cheaper models, so
 * this matters more the cheaper the provider. Returns null when nothing
 * parseable comes back.
 */
export async function llmJson<T>(prompt: string, opts: LlmOptions = {}): Promise<T | null> {
  return (await llmJsonResult<T>(prompt, opts)).data;
}

/** llmJson plus the reason when nothing usable came back. */
export async function llmJsonResult<T>(prompt: string, opts: LlmOptions = {}): Promise<{ data: T | null; error: string | null }> {
  const r = await llmCompleteResult(prompt, opts);
  if (!r.text) return { data: null, error: r.error };
  const data = parseJsonLoose<T>(r.text);
  return { data, error: data ? null : 'la respuesta del modelo no era JSON válido' };
}

function parseJsonLoose<T>(raw: string): T | null {
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
