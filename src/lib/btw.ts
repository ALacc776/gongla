// Routes the chat input: text starting with /btw goes to the Ask panel (F16)
// instead of the roleplay.
export type InputRoute = { kind: 'ask'; question: string } | { kind: 'chat'; text: string };

export function routeInput(raw: string): InputRoute {
  const text = raw.trim();
  const match = /^\/btw(?:\s+|$)/i.exec(text);
  if (match) return { kind: 'ask', question: text.slice(match[0].length).trim() };
  return { kind: 'chat', text };
}
