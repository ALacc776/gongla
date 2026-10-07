// One forced-tool-use call to Claude. Every model call in the app goes through here.
export const MODEL = 'claude-haiku-4-5-20251001';

export type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export type CallStats = { ms: number; input_tokens: number; output_tokens: number; cache_read_tokens: number };

type CallOptions = {
  system: SystemBlock[];
  messages: ChatTurn[];
  tool: Tool;
  maxTokens?: number;
  temperature?: number;
  // Aborts the call, e.g. when the app has given up on the turn.
  signal?: AbortSignal;
};

// A call that hasn't finished by now has stalled; better to fail and let the learner retry.
const TIMEOUT_MS = 20_000;

export async function callTool<T>(opts: CallOptions): Promise<T> {
  return (await callToolWithStats<T>(opts)).input;
}

function timeoutSignal(opts: CallOptions) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
}

// A timeout becomes a message the learner can act on; a cancel passes through as is.
function failed(e: unknown, signal: AbortSignal): Error {
  if (signal.aborted && (signal.reason as Error)?.name === 'TimeoutError') {
    return new Error('The AI took too long. Try again.');
  }
  return e as Error;
}

function warnIfCut(stopReason: string | undefined) {
  if (stopReason === 'max_tokens') console.warn('Reply was cut off at max_tokens');
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
      max_tokens: opts.maxTokens ?? 600,
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
  try {
    return await streamTool<T>(opts, onJson, signal);
  } catch (e) {
    throw failed(e, signal);
  }
}

async function streamTool<T>(
  opts: CallOptions,
  onJson: (partial: string) => void,
  signal: AbortSignal,
): Promise<{ input: T; stats: CallStats }> {
  const started = performance.now();
  const res = await request(opts, true, signal);
  if (!res.ok || !res.body) {
    console.error('Anthropic error', res.status, await res.text());
    throw new Error('The AI service failed. Try again.');
  }

  const stats: CallStats = { ms: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 };
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
      const data = JSON.parse(dataLine.slice(5));
      if (data.type === 'message_start') {
        stats.input_tokens = data.message?.usage?.input_tokens ?? 0;
        stats.cache_read_tokens = data.message?.usage?.cache_read_input_tokens ?? 0;
      } else if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
        json += data.delta.partial_json;
        onJson(json);
      } else if (data.type === 'message_delta') {
        stats.output_tokens = data.usage?.output_tokens ?? stats.output_tokens;
        warnIfCut(data.delta?.stop_reason);
      } else if (data.type === 'error') {
        console.error('Anthropic stream error', data.error);
        throw new Error('The AI service failed. Try again.');
      }
    }
  }

  stats.ms = Math.round(performance.now() - started);
  try {
    return { input: JSON.parse(json) as T, stats };
  } catch {
    throw new Error('The AI returned an unexpected reply. Try again.');
  }
}

// Same as callTool, plus how long the call took and how many tokens it used.
export async function callToolWithStats<T>(opts: CallOptions): Promise<{ input: T; stats: CallStats }> {
  const signal = timeoutSignal(opts);
  const started = performance.now();
  let data;
  try {
    const res = await request(opts, false, signal);
    if (!res.ok) {
      console.error('Anthropic error', res.status, await res.text());
      throw new Error('The AI service failed. Try again.');
    }
    data = await res.json();
  } catch (e) {
    throw failed(e, signal);
  }

  warnIfCut(data.stop_reason);
  const toolUse = data.content?.find((block: { type: string }) => block.type === 'tool_use');
  if (!toolUse?.input) throw new Error('The AI returned an unexpected reply. Try again.');
  return {
    input: toolUse.input as T,
    stats: {
      ms: Math.round(performance.now() - started),
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      cache_read_tokens: data.usage?.cache_read_input_tokens ?? 0,
    },
  };
}
