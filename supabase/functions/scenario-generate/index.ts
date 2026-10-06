import { withSupabase } from 'npm:@supabase/server@1';

import { callTool } from '../_shared/anthropic.ts';
import { SPEC_SCHEMA, validSpec, type GeneratedSpec } from '../_shared/spec.ts';

const MAX_LENGTH = 600;

// A light check before paying for a model call (F8 guardrails).
const BLOCKED = /\b(kill|murder|rape|suicide|bomb|terroris|porn|nude|naked|sex(ual)?|cocaine|heroin|meth)\b/i;

const SYSTEM = `You design roleplay scenarios for someone practicing spoken Hong Kong Cantonese.
The learner describes something coming up in their real life. Turn it into a scenario:
infer the setting, the other person (the character the AI will play), a realistic goal,
3 to 5 beats, and key phrases suited to the learner's level.
Rules:
- Never roleplay real, named public figures (celebrities, politicians). If asked, use a fictional person in the same role.
- Keep everything appropriate for all ages. Turn anything unsafe into a harmless everyday version.
- Key phrases are colloquial Hong Kong Cantonese in Traditional characters, never Mandarin forms.
Answer only by calling the scenario tool.`;

// F8 Rehearse My Real Life: description -> scenario spec preview. Nothing is saved
// until the learner taps Start (session-start with custom_spec).
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const edit = typeof body.edit === 'string' ? body.edit.trim() : '';
    const harder = body.harder === true;
    const base = validSpec(body.base_spec) ? body.base_spec : null;

    if (!description || description.length > MAX_LENGTH || edit.length > MAX_LENGTH) {
      return Response.json({ error: 'Describe the situation in a sentence or two' }, { status: 400 });
    }
    if (BLOCKED.test(description) || BLOCKED.test(edit)) {
      return Response.json({ error: "Let's keep rehearsals to everyday situations." }, { status: 400 });
    }

    const { data: profile } = await ctx.supabase.from('profiles').select('level, memory').eq('id', userId).maybeSingle();
    const level = profile?.level ?? 1;
    const facts: string[] = profile?.memory?.facts ?? [];

    let request = `Learner level (1 to 5): ${level}.\n`;
    if (facts.length) request += `About the learner: ${facts.join('; ')}\n`;
    request += `What's coming up: ${description}\n`;
    if (base) {
      request += `\nCurrent scenario:\n${JSON.stringify(base)}\n`;
      if (edit) request += `Change it like this: ${edit}\n`;
      if (harder) {
        request += `Make it one level harder: difficulty ${Math.min((base.difficulty ?? level) + 1, 5)}, a less patient or more talkative character, and a more demanding goal.\n`;
      }
    } else {
      request += `Set difficulty to ${level}.\n`;
    }

    let spec: GeneratedSpec;
    try {
      spec = await callTool<GeneratedSpec>({
        system: [{ type: 'text', text: SYSTEM }],
        messages: [{ role: 'user', content: request }],
        tool: { name: 'scenario', description: 'The roleplay scenario.', input_schema: SPEC_SCHEMA },
        maxTokens: 900,
        temperature: 0.7,
      });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
    if (!validSpec(spec)) return Response.json({ error: 'Could not plan that one. Try rewording it.' }, { status: 502 });

    return Response.json({ spec });
  }),
};
