// One forced-tool-use call to Claude. Every model call in the app goes through here.
export const MODEL = 'claude-haiku-4-5-20251001';

export type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export type CallStats = {
  ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  stop_reason: string | null;
  // Anthropic's id for the request, to look a failure up on their side.
  request_id: string | null;
};

type CallOptions = {
  system: SystemBlock[];
  messages: ChatTurn[];
  tool: Tool;
  maxTokens?: number;
  temperature?: number;
  // Aborts the call, e.g. when the app has given up on the turn.
  signal?: AbortSignal;
};

const DEFAULT_MAX_TOKENS = 600;

// A call that hasn't finished by now has stalled; better to fail and let the learner retry.
const TIMEOUT_MS = 20_000;

// Why a call failed. The message is what the learner sees; the code goes to the logs and the app.
export type AiErrorCode = 'http' | 'stream' | 'truncated' | 'bad_json' | 'no_tool' | 'bad_shape' | 'timeout';

const MESSAGES: Record<AiErrorCode, string> = {
  http: 'The AI service failed. Try again.',
  stream: 'The AI service failed. Try again.',
  truncated: 'The reply got cut off. Try again.',
  bad_json: 'The AI returned an unexpected reply. Try again.',
  no_tool: 'The AI returned an unexpected reply. Try again.',
  bad_shape: 'The AI returned an unexpected reply. Try again.',
  timeout: 'The AI took too long. Try again.',
};

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    public details: Record<string, unknown> = {},
  ) {
    super(MESSAGES[code]);
    this.name = 'AiError';
  }
}

// Logs one line with everything needed to tell what went wrong, and returns the error to throw.
export function aiFailure(code: AiErrorCode, details: Record<string, unknown>): AiError {
  console.error('ai_call_failed', { code, ...details });
  return new AiError(code, details);
}

export async function callTool<T>(opts: CallOptions): Promise<T> {
  return (await callToolWithStats<T>(opts)).input;
}

function newStats(): CallStats {
  return { ms: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, stop_reason: null, request_id: null };
}

// What every failure log line carries about the call.
function callInfo(opts: CallOptions, stats: CallStats, started: number) {
  return {
    tool: opts.tool.name,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...stats,
    ms: Math.round(performance.now() - started),
  };
}

// The end of the model's output, where a cut-off or malformed reply shows.
function tail(json: string) {
  return { json_length: json.length, json_tail: json.slice(-300) };
}

function timeoutSignal(opts: CallOptions) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
}

// A timeout becomes a message the learner can act on; a cancel passes through as is.
function failed(e: unknown, signal: AbortSignal, info: Record<string, unknown>): Error {
  if (e instanceof AiError) return e;
  if (signal.aborted) {
    if ((signal.reason as Error)?.name === 'TimeoutError') return aiFailure('timeout', info);
    return e as Error;
  }
  return aiFailure('http', { ...info, cause: String(e) });
}

function request(opts: CallOptions, stream: boolean, signal: AbortSignal) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: opts.messages,
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
      stream,
    }),
  });
}

// Like callToolWithStats, but streams: onJson gets the tool input JSON so far
// every time more of it arrives, so callers can act on early fields.
export async function streamToolWithStats<T>(
  opts: CallOptions,
  onJson: (partial: string) => void,
): Promise<{ input: T; stats: CallStats }> {
  const signal = timeoutSignal(opts);
  const started = performance.now();
  const stats = newStats();
  try {
    return await streamTool<T>(opts, onJson, signal, stats, started);
  } catch (e) {
    throw failed(e, signal, callInfo(opts, stats, started));
  }
}

async function streamTool<T>(
  opts: CallOptions,
  onJson: (partial: string) => void,
  signal: AbortSignal,
  stats: CallStats,
  started: number,
): Promise<{ input: T; stats: CallStats }> {
  const res = await request(opts, true, signal);
  stats.request_id = res.headers.get('request-id');
  if (!res.ok || !res.body) {
    throw aiFailure('http', { ...callInfo(opts, stats, started), status: res.status, body: await res.text() });
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  let json = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    // Server-sent events are separated by a blank line; each has a `data:` JSON line.
    let split;
    while ((split = pending.indexOf('\n\n')) >= 0) {
      const event = pending.slice(0, split);
      pending = pending.slice(split + 2);
      const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) continue;
      let data;
      try {
        data = JSON.parse(dataLine.slice(5));
      } catch {
        throw aiFailure('stream', { ...callInfo(opts, stats, started), event: dataLine.slice(0, 300) });
      }
      if (data.type === 'message_start') {
        stats.input_tokens = data.message?.usage?.input_tokens ?? 0;
        stats.cache_read_tokens = data.message?.usage?.cache_read_input_tokens ?? 0;
      } else if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
        json += data.delta.partial_json;
        onJson(json);
      } else if (data.type === 'message_delta') {
        stats.output_tokens = data.usage?.output_tokens ?? stats.output_tokens;
        stats.stop_reason = data.delta?.stop_reason ?? stats.stop_reason;
      } else if (data.type === 'error') {
        throw aiFailure('stream', { ...callInfo(opts, stats, started), error: data.error });
      }
    }
  }

  stats.ms = Math.round(performance.now() - started);
  // A reply cut off at the token limit is unfinished even if its JSON happens to close.
  if (stats.stop_reason === 'max_tokens') {
    throw aiFailure('truncated', { ...callInfo(opts, stats, started), ...tail(json) });
  }
  try {
    return { input: JSON.parse(json) as T, stats };
  } catch {
    throw aiFailure('bad_json', { ...callInfo(opts, stats, started), ...tail(json) });
  }
}

// Same as callTool, plus how long the call took and how many tokens it used.
export async function callToolWithStats<T>(opts: CallOptions): Promise<{ input: T; stats: CallStats }> {
  const signal = timeoutSignal(opts);
  const started = performance.now();
  const stats = newStats();
  let data;
  try {
    const res = await request(opts, false, signal);
    stats.request_id = res.headers.get('request-id');
    if (!res.ok) {
      throw aiFailure('http', { ...callInfo(opts, stats, started), status: res.status, body: await res.text() });
    }
    data = await res.json();
  } catch (e) {
    throw failed(e, signal, callInfo(opts, stats, started));
  }

  stats.ms = Math.round(performance.now() - started);
  stats.input_tokens = data.usage?.input_tokens ?? 0;
  stats.output_tokens = data.usage?.output_tokens ?? 0;
  stats.cache_read_tokens = data.usage?.cache_read_input_tokens ?? 0;
  stats.stop_reason = data.stop_reason ?? null;
  const toolUse = data.content?.find((block: { type: string }) => block.type === 'tool_use');
  const output = () => tail(JSON.stringify(toolUse?.input ?? data.content ?? null));
  if (stats.stop_reason === 'max_tokens') {
    throw aiFailure('truncated', { ...callInfo(opts, stats, started), ...output() });
  }
  if (!toolUse?.input) throw aiFailure('no_tool', { ...callInfo(opts, stats, started), ...output() });
  return { input: toolUse.input as T, stats };
}
