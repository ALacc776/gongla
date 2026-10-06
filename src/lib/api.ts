import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { ChatMessage, GapChip, ScenarioSpec, SessionSummary, SideQuestion } from '@/lib/types';

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
  const { data, error } = await supabase.functions.invoke(name, { body });
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

export function startSession(scenarioId: string) {
  return invoke<{ session_id: string; message: ChatMessage }>('session-start', {
    scenario_id: scenarioId,
  });
}

export function sendChat(sessionId: string, text: string) {
  return invoke<{ user_message: ChatMessage; message: ChatMessage; turn_count: number; turn_cap: number }>(
    'chat',
    { session_id: sessionId, text },
  );
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

export function invokeTts(text: string, voice: string, rate: number) {
  return invoke<{ url: string }>('tts', { text, voice, rate });
}

export async function transcribe(fileUri: string) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const audio = await fetch(fileUri).then((r) => r.blob());
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stt`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
      'content-type': 'audio/wav',
    },
    body: audio,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error ?? 'Could not understand the audio', res.status, json?.reason ?? null);
  return json as { text: string };
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

export function startCustomSession(spec: ScenarioSpec & { preview?: string }) {
  return invoke<{ session_id: string; scenario_id: string; message: ChatMessage }>('session-start', {
    custom_spec: spec,
  });
}
