import { VOICES } from './azure.ts';
import type { ScenarioSpec } from './reply.ts';

// JSON schema for a scenario spec (design doc F7), used by the Rehearse generator.
export const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short English title, under 40 characters' },
    setting: { type: 'string', description: 'One English sentence describing the place and moment' },
    character: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'How the learner would address them, e.g. "Mr. Chan" or "Auntie Mei"' },
        role: { type: 'string', description: "Who they are to the learner, e.g. \"your girlfriend's dad\"" },
        personality: { type: 'string', description: 'A few adjectives' },
        speech_style: { type: 'string', description: 'How they talk' },
        emoji: { type: 'string', description: 'One emoji for the character' },
        voice: { type: 'string', enum: [...VOICES], description: 'WanLung is male; HiuMaan and HiuGaai are female' },
      },
      required: ['name', 'role', 'personality', 'emoji', 'voice'],
    },
    user_role: { type: 'string' },
    goal: { type: 'string', description: 'A realistic goal for the learner, one sentence' },
    beats: { type: 'array', items: { type: 'string' }, description: '3 to 5 short steps the conversation moves through' },
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    key_phrases: {
      type: 'array',
      items: { type: 'string' },
      description: '4 to 6 useful colloquial Hong Kong Cantonese phrases for this situation, Traditional characters',
    },
    opener_hint: { type: 'string', description: 'How the character opens the conversation' },
    preview: {
      type: 'string',
      description:
        "Two sentences for the learner in English: who they'll talk with, what that person is like, and the goal.",
    },
  },
  required: ['title', 'setting', 'character', 'user_role', 'goal', 'beats', 'difficulty', 'key_phrases', 'opener_hint', 'preview'],
};

export type GeneratedSpec = ScenarioSpec & { preview?: string };

// Checks a spec sent back by the app before it's saved as a custom scenario.
export function validSpec(value: unknown): value is GeneratedSpec {
  const s = value as GeneratedSpec;
  return (
    !!s &&
    typeof s.title === 'string' &&
    typeof s.setting === 'string' &&
    typeof s.goal === 'string' &&
    typeof s.user_role === 'string' &&
    Array.isArray(s.beats) &&
    !!s.character &&
    typeof s.character.name === 'string' &&
    typeof s.character.role === 'string' &&
    JSON.stringify(s).length < 6000
  );
}
