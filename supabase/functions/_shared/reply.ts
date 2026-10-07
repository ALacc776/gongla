import {
  aiFailure,
  callToolWithStats,
  streamToolWithStats,
  type CallStats,
  type ChatTurn,
  type SystemBlock,
} from './anthropic.ts';
import { segmentJyutping } from './jyutping.ts';
import { checkMandarin, MANDARIN_THRESHOLD } from './mandarin.ts';
import { extractClosedString } from './stream-json.ts';
import { hasQuestion } from './text.ts';
import { asArray } from './tool-input.ts';

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

// How the reply keeps the conversation going (question types from Huang et al. 2017).
const MOVES = ['follow_up', 'partial_switch', 'full_switch', 'mirror', 'closing'] as const;

type ReplyInput = {
  move?: (typeof MOVES)[number];
  say?: string;
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
  // One entry per model call (2 if the Mandarin check forced a retry).
  calls: CallStats[];
  // The whole reply as one string (what gets spoken), and whether onSay already got it.
  say: string;
  sayEmitted: boolean;
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
  // Words the learner is fine saying in English: never recorded as gaps.
  englishOk?: string[];
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
    'The same reply as `say`, split into word-sized chunks (1 to 4 characters each, punctuation as its own chunk with an empty gloss). Joined together they must equal `say` exactly.',
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
  // `say` streams early so the app speaks it before the rest arrives. Only the
  // short `move` comes before it, so the model plans its closing question first.
  const properties: Record<string, unknown> = {
    move: {
      type: 'string',
      enum: [...MOVES],
      description: 'Which kind of question you will end your reply with. Decide this first.',
    },
    say: { type: 'string', description: 'Your whole reply, in Traditional characters, ending with your one question.' },
    segments: SEGMENTS_SCHEMA,
    english: { type: 'string', description: 'Natural English translation of your whole reply.' },
    goal_met: { type: 'boolean', description: "Whether the learner has now completed the scenario goal." },
  };
  const required = ['move', 'say', 'segments', 'english', 'goal_met'];

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
        "Every English word or phrase the learner said (or asked how to say) in their LAST message, with the natural Cantonese they could have used, even if Hong Kong people often say it in English. Skip words on the learner's OK-in-English list unless they asked how to say them. Empty if they used only Cantonese or Jyutping.",
      items: {
        type: 'object',
        properties: {
          english: { type: 'string', description: 'The English word or short phrase, lowercase' },
          hanzi: {
            type: 'string',
            description: 'The natural Cantonese for it in Traditional characters, as short as possible. Never the English word itself.',
          },
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

Keep the conversation going like two people chatting, not an interview:
- You are a person with your own life that fits your character: your day so far,
  your work, likes and dislikes, small complaints and stories. Make these up freely
  to fit the setting and personality, and never contradict what you said earlier.
- Have opinions. Give your own view on what the learner says: agree, gently
  disagree, or compare with your own experience (我就覺得…, 我都係呀！, 唔係啩…).
- Take turns sharing. Most replies include something about you (an opinion, a bit
  of your day, a short story). Sometimes that is most of the reply and the question
  is just a short tag (…你呢？). Match how much the learner shares, and open up a
  little more as the chat goes on.
- Shape: react to what they said, share your view or experience, then ask. The
  question often grows out of what you shared (我最鍾意食菠蘿包，你呢？).
- End every reply with exactly one question for the learner, never two. Pick its kind
  in "move" before writing:
  - follow_up (default, most common): ask more about what they just said: why,
    how, what it was like, a specific detail.
  - partial_switch: after 2 to 3 exchanges on one thing, or when the learner gives
    very short answers, pick one detail they mentioned and open a related topic.
  - full_switch (rare): only when the topic is used up. Bridge into it with 係呢,
    講開又講 or 對喇, and tie it to the scene.
  - mirror: if the learner asked you something, answer it first, then ask it back (咁你呢？).
- Use switches to move the scene to its next beat.
- Never ask about something the learner already answered in this chat.
- Use natural Cantonese question forms: A-not-A (去唔去, 有冇, 係咪), 呢, 咩, 未呀,
  點解, 點樣, 幾時. End the question with ？.

Output only by calling the reply tool.`;

const LEVEL_RULES: Record<number, string> = {
  1: 'Replies of 1 short sentence, under 10 characters. Very common words only. Share a tiny fact or opinion, then ask a yes/no, either/or, or 你呢？ question.',
  2: 'Replies of 1 to 2 short sentences: a simple share or opinion plus a simple question. Common everyday words.',
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
  if (ctx.englishOk?.length) {
    parts.push(`The learner's OK-in-English list (don't add these to gaps unless they ask how to say one): ${ctx.englishOk.join(', ')}`);
  }
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
  if (ctx.wrapUp) {
    parts.push('The chat is nearly over: wrap up the scene naturally in this reply. Use move "closing": say goodbye, no question needed.');
  }
  if (ctx.learnerMandarin?.length) {
    parts.push(
      `The learner's last message uses Mandarin forms (${ctx.learnerMandarin.join(', ')}). Add a correction with the Cantonese form (e.g. 是 -> 係, 不 -> 唔, 的 -> 嘅, 他 -> 佢, 在 -> 喺, 看 -> 睇), but reply in character as if they had said it right.`,
    );
  }
  return parts.join('\n');
}

const SCENE_START = '(The scene begins. Speak first.)';

// Room for a long reply plus its per-word glosses, gaps and corrections. A cut-off
// reply fails the whole turn, and unused tokens cost nothing.
const REPLY_MAX_TOKENS = 1500;

// Anthropic needs the conversation to start with a user turn, but the character
// speaks first, so a placeholder user turn stands in for the start of the scene.
function withLeadingUserTurn(turns: ChatTurn[]): ChatTurn[] {
  return turns.length === 0 || turns[0].role === 'assistant'
    ? [{ role: 'user', content: SCENE_START }, ...turns]
    : turns;
}

async function callReply(
  ctx: ReplyContext,
  history: ChatTurn[],
  calls: CallStats[],
  extraSystem?: string,
  onPartial?: (json: string) => void,
  signal?: AbortSignal,
) {
  const system: SystemBlock[] = [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicPrompt(ctx) },
  ];
  if (extraSystem) system.push({ type: 'text', text: extraSystem });
  const options = {
    system,
    messages: withLeadingUserTurn(history),
    tool: replyTool(Boolean(ctx.candidates)),
    maxTokens: REPLY_MAX_TOKENS,
    signal,
  };
  const { input, stats } = onPartial
    ? await streamToolWithStats<ReplyInput>(options, onPartial)
    : await callToolWithStats<ReplyInput>(options);
  calls.push(stats);
  return cleanInput(input, stats);
}

// Lists can arrive as JSON strings; a reply without usable segments falls back to
// `say` as one chunk (no per-word glosses) rather than failing the turn.
function cleanInput(input: ReplyInput, stats: CallStats): ReplyInput {
  const raw = input as unknown as Record<string, unknown>;
  const say = typeof raw.say === 'string' ? raw.say.trim() : '';
  let segments = (asArray<Segment>(raw.segments) ?? []).filter((s) => typeof s?.hanzi === 'string' && s.hanzi);
  if (!segments.length) {
    const info = { tool: 'reply', keys: Object.keys(raw), segments: String(raw.segments).slice(0, 300), ...stats };
    if (!say) throw aiFailure('bad_shape', info);
    console.warn('reply had no usable segments, using say as one', info);
    segments = [{ hanzi: say, gloss: '' }];
  }
  return {
    ...input,
    segments,
    gaps: asArray<ModelGap>(raw.gaps) ?? [],
    corrections: asArray<Correction>(raw.corrections) ?? [],
    targets_used: asArray<string>(raw.targets_used) ?? [],
    target_gap_ids: asArray<string>(raw.target_gap_ids) ?? [],
  };
}

function sayOf(input: ReplyInput): string {
  return (input.say ?? '').trim() || input.segments.map((s) => s.hanzi).join('');
}

// With onSay, the model call streams and onSay gets the spoken reply as soon as it
// has fully arrived and passed the Mandarin check, before the glosses and gaps.
// A reply that fails the check is not emitted; the caller sends `say` from the result.
// A retry streams too, so a good retried reply still reaches onSay early.
// `signal` cancels the model calls, e.g. when the app has given up on the turn.
export async function generateReply(
  ctx: ReplyContext,
  history: ChatTurn[],
  onSay?: (say: string) => void,
  signal?: AbortSignal,
): Promise<ReplyResult> {
  const calls: CallStats[] = [];
  // Every reply ends with a question so the learner has a turn, except the goodbye.
  const asksEnough = (say: string) => Boolean(ctx.wrapUp) || hasQuestion(say);
  let sayChecked = false;
  let sayEmitted = false;
  const onPartial = onSay
    ? (json: string) => {
        if (sayChecked) return;
        const say = extractClosedString(json, 'say');
        if (say === null) return;
        sayChecked = true;
        if (say.trim() && checkMandarin(say).score < MANDARIN_THRESHOLD && asksEnough(say)) {
          sayEmitted = true;
          onSay(say.trim());
        }
      }
    : undefined;

  let input = await callReply(ctx, history, calls, undefined, onPartial, signal);
  let check = checkMandarin(sayOf(input));
  let asks = asksEnough(sayOf(input));

  // F4: regenerate once if the reply drifted into Mandarin or left the learner nothing to answer.
  if (check.score >= MANDARIN_THRESHOLD || !asks) {
    console.warn('Reply needs a retry', { mandarin: check, asks });
    const problems: string[] = [];
    if (check.score >= MANDARIN_THRESHOLD) {
      problems.push(
        `it used Mandarin forms: ${check.hits.join(', ') || 'no Cantonese words at all'}. Write it in colloquial spoken Hong Kong Cantonese instead.`,
      );
    }
    if (!asks) problems.push('it did not end with a question for the learner. End it with exactly one natural question.');
    // Mandarin is the worse problem; ties go to the lower Mandarin score.
    const badness = (c: typeof check, a: boolean) => (c.score >= MANDARIN_THRESHOLD ? 2 : 0) + (a ? 0 : 1);
    // The first draft's say was never emitted (it failed the check), so the retry's can be.
    // One that is emitted passes both checks, so it always wins the comparison below.
    sayChecked = false;
    try {
      const retry = await callReply(
        ctx,
        history,
        calls,
        `IMPORTANT: your previous draft of this reply had a problem: ${problems.join(' Also, ')}`,
        onPartial,
        signal,
      );
      const retryCheck = checkMandarin(sayOf(retry));
      const retryAsks = asksEnough(sayOf(retry));
      const before = badness(check, asks);
      const after = badness(retryCheck, retryAsks);
      if (after < before || (after === before && retryCheck.score <= check.score)) {
        input = retry;
        check = retryCheck;
        asks = retryAsks;
      }
    } catch (e) {
      // Its say may already be on the learner's screen; the first draft can't replace it.
      if (sayEmitted) throw e;
      console.error('Reply retry failed', e);
    }
  }
  console.log('reply move', input.move ?? 'none', asks ? '' : '(no question)');

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
    calls,
    say: sayOf(input),
    sayEmitted,
    payload,
    gaps: input.gaps ?? [],
    corrections: (input.corrections ?? []).slice(0, 2),
    targetsUsed: input.targets_used ?? [],
    chosenTargetIds: input.target_gap_ids ?? [],
  };
}

export function replyText(payload: Pick<ReplyPayload, 'segments'>): string {
  return payload.segments.map((s) => s.hanzi).join('');
}
