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
};

export async function callTool<T>(opts: CallOptions): Promise<T> {
  return (await callToolWithStats<T>(opts)).input;
}

// Same as callTool, plus how long the call took and how many tokens it used.
export async function callToolWithStats<T>(opts: CallOptions): Promise<{ input: T; stats: CallStats }> {
  const started = performance.now();
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
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
    }),
  });

  if (!res.ok) {
    console.error('Anthropic error', res.status, await res.text());
    throw new Error('The AI service failed. Try again.');
  }

  const data = await res.json();
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
