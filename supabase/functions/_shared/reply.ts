import { callTool, type ChatTurn, type SystemBlock } from './anthropic.ts';
import { segmentJyutping } from './jyutping.ts';
import { checkMandarin, MANDARIN_THRESHOLD } from './mandarin.ts';

export type { ChatTurn } from './anthropic.ts';

export type Segment = { hanzi: string; gloss: string };
export type ModelGap = { english: string; hanzi: string; source: 'fallback' | 'asked' };
export type Correction = {
  user_said: string;
  better: string;
  note: string;
  english?: string;
  hanzi?: string;
};

type ReplyInput = {
  segments: Segment[];
  english: string;
  gaps?: ModelGap[];
  corrections?: Correction[];
  targets_used?: string[];
  goal_met?: boolean;
  target_gap_ids?: string[];
};

// Stored on assistant messages and sent to the app.
export type ReplyPayload = {
  segments: (Segment & { jyutping: string })[];
  english: string;
  goal_met: boolean;
  mandarin_flagged?: boolean;
  mandarin_hits?: string[];
};

export type ReplyResult = {
  payload: ReplyPayload;
  gaps: ModelGap[];
  corrections: Correction[];
  targetsUsed: string[];
  chosenTargetIds: string[];
};

export type ScenarioSpec = {
  title: string;
  setting: string;
  character: {
    name: string;
    role: string;
    personality: string;
    speech_style?: string;
    emoji?: string;
    voice?: string;
  };
  user_role: string;
  goal: string;
  beats: string[];
  difficulty?: number;
  key_phrases?: string[];
  opener_hint?: string;
};

export type TargetGap = { id: string; english: string; hanzi: string };

export type ReplyContext = {
  spec: ScenarioSpec;
  level: number;
  memory: string[];
  targets: TargetGap[];
  // Opener only: due gaps the model may pick targets from (F5).
  candidates?: TargetGap[];
  // Set when the chat is wrapping up because of the turn cap.
  wrapUp?: boolean;
  // Mandarin forms found in the learner's last message by the server's detector.
  learnerMandarin?: string[];
};

const SEGMENTS_SCHEMA = {
  type: 'array',
  description:
    'Your reply split into word-sized chunks (1 to 4 characters each, punctuation as its own chunk with an empty gloss). Joined together they must equal the full reply.',
  items: {
    type: 'object',
    properties: {
      hanzi: { type: 'string', description: 'Traditional characters' },
      gloss: { type: 'string', description: 'Short English meaning of this chunk' },
    },
    required: ['hanzi', 'gloss'],
  },
};

function replyTool(opener: boolean) {
  const properties: Record<string, unknown> = {
    segments: SEGMENTS_SCHEMA,
    english: { type: 'string', description: 'Natural English translation of your whole reply.' },
    goal_met: { type: 'boolean', description: "Whether the learner has now completed the scenario goal." },
  };
  const required = ['segments', 'english', 'goal_met'];

  if (opener) {
    properties.target_gap_ids = {
      type: 'array',
      items: { type: 'string' },
      description: 'IDs of up to 5 candidate target words that fit this scene naturally. Empty if none fit.',
    };
  } else {
    properties.gaps = {
      type: 'array',
      description:
        "Words or phrases the learner said in English (or asked how to say) in their LAST message, with the natural Cantonese they could have used. Empty if they used only Cantonese or Jyutping. Do not include English loanwords Hong Kong people normally say in English (OK, check, sorry).",
      items: {
        type: 'object',
        properties: {
          english: { type: 'string', description: 'The English word or short phrase, lowercase' },
          hanzi: { type: 'string', description: 'The natural Cantonese for it, Traditional characters, as short as possible' },
          source: { type: 'string', enum: ['fallback', 'asked'] },
        },
        required: ['english', 'hanzi', 'source'],
      },
    };
    properties.corrections = {
      type: 'array',
      description:
        "At most 2 Cantonese mistakes or unnatural phrasings in the learner's LAST message. Skip tiny issues. Empty if none.",
      items: {
        type: 'object',
        properties: {
          user_said: { type: 'string' },
          better: { type: 'string', description: 'Natural Cantonese version' },
          note: { type: 'string', description: 'One short English sentence explaining the fix' },
          hanzi: { type: 'string', description: 'The key Cantonese word that fixes it, e.g. 係' },
          english: { type: 'string', description: 'English meaning of that key word' },
        },
        required: ['user_said', 'better', 'note'],
      },
    };
    properties.targets_used = {
      type: 'array',
      items: { type: 'string' },
      description: 'IDs of target words the learner correctly produced in Cantonese in their LAST message.',
    };
    required.push('gaps', 'corrections', 'targets_used');
  }

  return {
    name: 'reply',
    description: 'Send your in-character reply to the learner.',
    input_schema: { type: 'object', properties, required },
  };
}

const STATIC_PROMPT = `You are a roleplay partner helping someone practice spoken Hong Kong Cantonese.
Stay in character at all times. Never lecture. Keep replies short and natural.

Language rules:
- Write colloquial spoken Cantonese in Traditional characters (係, 唔, 嘅, 咗, 冇, 佢, 喺, 睇, 講, 咩, 嗰, 呢, 哋).
- Never use Mandarin forms (是, 不, 的 as possessive, 了, 沒有, 他/她, 在, 看, 說, 什麼, 那, 這, 們).
- Use sentence-final particles naturally (呀, 啦, 喎, 囉, 嘅, 咩, 吖).
- English loanwords common in Hong Kong speech are fine (e.g. 的士, OK, check).

The learner may write in Chinese characters, Jyutping (e.g. "nei5 hou2"), English, or a mix.
Understand all of these. Jyutping counts as Cantonese. Never switch to English yourself.

When the learner uses English for a word or phrase, continue the conversation
as if they said it, and record it in "gaps" with the natural Cantonese.
If they ask how to say something, answer briefly in character (say the word in
your reply), record it in "gaps" with source "asked", and carry on with the scene.
When the learner makes a Cantonese mistake, keep the conversation going and
record at most 2 "corrections". Never point out mistakes in your reply itself.

Output only by calling the reply tool.`;

const LEVEL_RULES: Record<number, string> = {
  1: 'Replies of 1 short sentence, under 10 characters. Very common words only. Ask yes/no or either/or questions.',
  2: 'Replies of 1 short sentence. Common everyday words. Ask simple questions.',
  3: 'Replies of 1 to 2 sentences. Everyday vocabulary. Open questions are fine.',
  4: 'Replies of 2 sentences. Broader vocabulary and natural phrasing.',
  5: 'Natural native speed and length. Slang and idioms welcome.',
};

function gapList(gaps: TargetGap[]): string {
  return gaps.map((g) => `- id ${g.id}: "${g.english}" = ${g.hanzi}`).join('\n');
}

function dynamicPrompt(ctx: ReplyContext): string {
  const { spec } = ctx;
  const c = spec.character;
  const parts = [
    `Learner level: ${ctx.level}. Rules: ${LEVEL_RULES[ctx.level] ?? LEVEL_RULES[1]}`,
  ];
  if (ctx.memory.length) {
    parts.push(`About the learner (from earlier chats, use naturally, never recite): ${ctx.memory.join('; ')}`);
  }
  parts.push(
    `Scenario: ${spec.setting}`,
    `You are: ${c.name}, ${c.role}. Personality: ${c.personality}.${c.speech_style ? ` Speech style: ${c.speech_style}.` : ''}`,
    `The learner is: ${spec.user_role}. Their goal: ${spec.goal}.`,
    `Beats to move through: ${spec.beats.join(', ')}`,
  );
  if (spec.key_phrases?.length) parts.push(`Useful phrases in this scene: ${spec.key_phrases.join(', ')}`);
  if (ctx.candidates) {
    if (spec.opener_hint) parts.push(`How to open: ${spec.opener_hint}`);
    if (ctx.candidates.length) {
      parts.push(
        `Candidate target words the learner has struggled with before. Pick up to 5 that could come up naturally in this scene and return their IDs in target_gap_ids:\n${gapList(ctx.candidates)}`,
      );
    }
  }
  if (ctx.targets.length) {
    parts.push(
      `Target words: try to create natural openings for the learner to say these.\nDo not say them yourself unless the learner is stuck twice.\n${gapList(ctx.targets)}`,
    );
  }
  if (ctx.wrapUp) parts.push('The chat is nearly over: wrap up the scene naturally in this reply.');
  if (ctx.learnerMandarin?.length) {
    parts.push(
      `The learner's last message uses Mandarin forms (${ctx.learnerMandarin.join(', ')}). Add a correction with the Cantonese form (e.g. 是 -> 係, 不 -> 唔, 的 -> 嘅, 他 -> 佢, 在 -> 喺, 看 -> 睇), but reply in character as if they had said it right.`,
    );
  }
  return parts.join('\n');
}

const SCENE_START = '(The scene begins. Speak first.)';

// Anthropic needs the conversation to start with a user turn, but the character
// speaks first, so a placeholder user turn stands in for the start of the scene.
function withLeadingUserTurn(turns: ChatTurn[]): ChatTurn[] {
  return turns.length === 0 || turns[0].role === 'assistant'
    ? [{ role: 'user', content: SCENE_START }, ...turns]
    : turns;
}

async function callReply(ctx: ReplyContext, history: ChatTurn[], extraSystem?: string) {
  const system: SystemBlock[] = [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicPrompt(ctx) },
  ];
  if (extraSystem) system.push({ type: 'text', text: extraSystem });
  const input = await callTool<ReplyInput>({
    system,
    messages: withLeadingUserTurn(history),
    tool: replyTool(Boolean(ctx.candidates)),
  });
  if (!Array.isArray(input.segments) || input.segments.length === 0) {
    throw new Error('The AI returned an unexpected reply. Try again.');
  }
  return input;
}

export async function generateReply(ctx: ReplyContext, history: ChatTurn[]): Promise<ReplyResult> {
  let input = await callReply(ctx, history);
  let check = checkMandarin(input.segments.map((s) => s.hanzi).join(''));

  // F4: regenerate once if the reply drifted into Mandarin.
  if (check.score >= MANDARIN_THRESHOLD) {
    console.warn('Mandarin leak, regenerating', check);
    try {
      const retry = await callReply(
        ctx,
        history,
        `IMPORTANT: your previous draft of this reply used Mandarin forms: ${check.hits.join(', ') || 'no Cantonese words at all'}. Write it in colloquial spoken Hong Kong Cantonese instead.`,
      );
      const retryCheck = checkMandarin(retry.segments.map((s) => s.hanzi).join(''));
      if (retryCheck.score <= check.score) {
        input = retry;
        check = retryCheck;
      }
    } catch (e) {
      console.error('Mandarin retry failed', e);
    }
  }

  const payload: ReplyPayload = {
    segments: input.segments.map((s) => ({
      hanzi: s.hanzi,
      gloss: s.gloss ?? '',
      jyutping: segmentJyutping(s.hanzi),
    })),
    english: input.english ?? '',
    goal_met: Boolean(input.goal_met),
  };
  if (check.score >= MANDARIN_THRESHOLD) {
    payload.mandarin_flagged = true;
    payload.mandarin_hits = check.hits;
  }

  return {
    payload,
    gaps: Array.isArray(input.gaps) ? input.gaps : [],
    corrections: Array.isArray(input.corrections) ? input.corrections.slice(0, 2) : [],
    targetsUsed: Array.isArray(input.targets_used) ? input.targets_used : [],
    chosenTargetIds: Array.isArray(input.target_gap_ids) ? input.target_gap_ids : [],
  };
}

export function replyText(payload: Pick<ReplyPayload, 'segments'>): string {
  return payload.segments.map((s) => s.hanzi).join('');
}
