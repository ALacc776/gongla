export type ReplySegment = { hanzi: string; gloss: string; jyutping: string };

export type ReplyPayload = {
  segments: ReplySegment[];
  english: string;
  goal_met: boolean;
};

export type GapChip = { id: string; english: string; hanzi: string; jyutping: string; source?: string };

export type Correction = {
  user_said: string;
  better: string;
  better_jyutping: string;
  note: string;
};

// Stored on the learner's own messages: what they got stuck on and what they used.
export type UserPayload = {
  gaps: GapChip[];
  corrections: Correction[];
  used: { id: string; english: string; hanzi: string }[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text_raw: string;
  payload: ReplyPayload | UserPayload | null;
  created_at: string;
};

export type AskExample = { hanzi: string; english: string; jyutping: string };

export type SideQuestion = {
  id: string;
  question: string;
  answer: { text: string; examples: AskExample[]; say_it: GapChip | null };
  created_at: string;
};

export type ScenarioSpec = {
  title: string;
  setting: string;
  character: { name: string; role: string; personality?: string; emoji?: string; voice?: string };
  user_role?: string;
  goal: string;
  beats?: string[];
  difficulty: number;
  key_phrases?: string[];
};

export type ScenarioSummary = {
  id: string;
  pack: string | null;
  is_custom: boolean;
  spec: ScenarioSpec;
};

export function isReply(payload: ChatMessage['payload']): payload is ReplyPayload {
  return !!payload && 'segments' in payload;
}

export type GapInfo = { id: string; english: string; hanzi: string; jyutping: string };

export type SessionSummary = {
  title: string;
  scenario_id: string;
  ratio: number | null;
  avg_7d: number | null;
  goal_met: boolean;
  user_turns: number;
  new_gaps: GapInfo[];
  used_gaps: GapInfo[];
  level: number;
  level_suggestion: 'up' | 'down' | null;
};

export type SessionRow = {
  id: string;
  scenario_id: string;
  started_at: string;
  ended_at: string | null;
  turn_count: number;
  cantonese_ratio: number | null;
  last_message_preview: string | null;
  scenarios: { spec: ScenarioSpec } | null;
};

export const SESSION_COLUMNS =
  'id, scenario_id, started_at, ended_at, turn_count, cantonese_ratio, last_message_preview, scenarios(spec)';
