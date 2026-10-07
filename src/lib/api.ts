import { FunctionRegion, FunctionsHttpError } from '@supabase/supabase-js';
import { fetch as streamingFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { saveClip } from '@/lib/clip-cache';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, GapChip, ScenarioSpec, SessionSummary, SideQuestion } from '@/lib/types';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;
// Functions that use the database run next to it (Oregon). Speech recognition is
// the exception: it is faster run nearest to the phone.
const DB_REGION = 'us-west-2';

async function authHeaders(region?: string): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return {
    authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
    ...(region ? { 'x-region': region } : {}),
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public reason: string | null,
  ) {
    super(message);
  }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body, region: FunctionRegion.UsWest2 });
  if (error) {
    let message = error.message;
    let status: number | null = null;
    let reason: string | null = null;
    if (error instanceof FunctionsHttpError) {
      status = error.context.status;
      const json = await error.context.json().catch(() => null);
      if (json?.error) message = json.error;
      if (json?.reason) reason = json.reason;
    }
    throw new ApiError(message, status, reason);
  }
  return data as T;
}

type StartResult = {
  session_id: string;
  scenario_id: string;
  message: ChatMessage;
  // The opener's voice, made alongside it.
  audio: { text: string; voice: string; rate: number; b64: string } | null;
};

// Starts a chat. The opener's voice comes back with it and is saved on the phone,
// so it plays instantly when the chat opens.
async function start(body: Record<string, unknown>) {
  const result = await invoke<StartResult>('session-start', body);
  if (result.audio) {
    const { text, voice, rate, b64 } = result.audio;
    saveClip([text, result.message.text_raw], voice, rate, b64);
  }
  return result;
}

export function startSession(scenarioId: string, rate: number) {
  return start({ scenario_id: scenarioId, rate });
}

export type ChatResult = {
  user_message: ChatMessage;
  message: ChatMessage;
  turn_count: number;
  turn_cap: number;
};

export type ChatHandlers = {
  // The reply text, as soon as it exists.
  onSay: (say: { message_id: string; hanzi: string }) => void;
  // The reply's voice, when `speech` was passed: base64 MP3 chunks, then the end.
  onAudio?: (b64: string) => void;
  onAudioEnd?: () => void;
  onAudioError?: () => void;
};

// One roleplay turn, streamed. With `speech`, the server also sends the reply's
// voice straight after its text. Resolves with the saved messages. Aborting `signal`
// cancels the turn: the server stops and saves nothing.
export async function sendChat(
  sessionId: string,
  text: string,
  handlers: ChatHandlers,
  speech?: { voice: string; rate: number },
  signal?: AbortSignal,
): Promise<ChatResult> {
  const res = await streamingFetch(`${FUNCTIONS_URL}/chat`, {
    method: 'POST',
    headers: { ...(await authHeaders(DB_REGION)), 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, text, speak: !!speech, ...speech }),
    signal,
  });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    throw new ApiError(json?.error ?? 'The chat failed. Try again.', res.status, json?.reason ?? null);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ChatResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === 'say') handlers.onSay(event);
      else if (event.type === 'audio') handlers.onAudio?.(event.b64);
      else if (event.type === 'audio_end') handlers.onAudioEnd?.();
      else if (event.type === 'audio_error') handlers.onAudioError?.();
      else if (event.type === 'done') result = event;
      else if (event.type === 'error') throw new ApiError(event.error, null, event.code ?? null);
    }
  }
  if (!result) throw new ApiError('The chat stopped early. Try again.', null, null);
  return result;
}

export function tapGap(messageId: string, segmentIndex: number) {
  return invoke<{ gap: GapChip | null }>('gap-tap', {
    message_id: messageId,
    segment_index: segmentIndex,
  });
}

export function ask(sessionId: string, question: string) {
  return invoke<{ side_question: SideQuestion }>('ask', { session_id: sessionId, question });
}

export function endSession(sessionId: string) {
  return invoke<{ summary: SessionSummary }>('session-end', { session_id: sessionId });
}

// Where to fetch a phrase's MP3 (cached phrases redirect to Storage).
export async function ttsSource(text: string, voice: string, rate: number) {
  const query = new URLSearchParams({ text, voice, rate: String(rate) });
  return { uri: `${FUNCTIONS_URL}/tts?${query}`, headers: await authHeaders(DB_REGION) };
}

// Recognition takes about a second; past this something has stalled.
const TRANSCRIBE_TIMEOUT_MS = 20_000;

export async function transcribe(fileUri: string) {
  const audio = await new File(fileUri).bytes();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const res = await streamingFetch(`${FUNCTIONS_URL}/stt`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'content-type': 'audio/wav' },
      body: audio,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('aborted');
    if (!res.ok) throw new ApiError(json?.error ?? 'Could not understand the audio', res.status, json?.reason ?? null);
    return json as { text: string; status: string; seconds: number; peak: number };
  } catch (e) {
    if (controller.signal.aborted) throw new ApiError('That took too long. Try again, or type it.', null, null);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export function deleteAccount() {
  return invoke<{ ok: true }>('delete-account', {});
}

export function generateScenario(body: {
  description: string;
  base_spec?: ScenarioSpec & { preview?: string };
  edit?: string;
  harder?: boolean;
}) {
  return invoke<{ spec: ScenarioSpec & { preview?: string } }>('scenario-generate', body);
}

export function startCustomSession(spec: ScenarioSpec & { preview?: string }, rate: number) {
  return start({ custom_spec: spec, rate });
}
