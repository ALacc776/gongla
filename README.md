# Gong (講)

A mobile app for practicing spoken Hong Kong Cantonese by chatting with AI characters in roleplay scenarios. When the user gets stuck (English fallback, a mistake, a question, a tapped word), the app records a "gap" and brings it back in later chats until they can say it unprompted.

- **Product and architecture reference:** [docs/design.md](docs/design.md). Read sections 3 (architecture), 4 (data model), 5 (feature specs) and 10 (build plan) before changing anything.
- **Working rules for AI agents:** [CLAUDE.md](CLAUDE.md). They are binding: never put API keys in the app, RLS on every table, build only the current milestone, ask before adding dependencies, and finish each task by telling the user exactly how to test it on their iPhone.

## Status

| Milestone | Scope | State |
|-----------|-------|-------|
| M0 | Expo app, three tabs, Supabase schema + RLS, anonymous auth | Done |
| M1 | Chat loop, layered display, server-side Jyutping | Done, tested live and in the iOS Simulator |
| M2 | Gap detection, corrections, Ask panel (`?` and `/btw`), tap-to-gloss, Mandarin detector | Done, tested live and in the Simulator |
| M3 | Gap reuse + scheduling, Word Bank, session summary, learner memory, past chats, Continue card | Done, tested live and in the Simulator |
| M4 | TTS with caching, 10 built-in scenarios, Rehearse My Real Life | Done, TTS verified on iPhone |
| F14 | Voice input (hold-to-talk, pulled forward from v1.1) | Done, verified on iPhone |
| M5 (basic) | Level picker, settings, daily limits (429), account deletion | Done, tested live |
| M5 (rest) | Sign in with Apple, RevenueCat | Not started (needs the Apple developer account) |
| M6 / M7 | TestFlight, native-speaker review, App Store | Not started |

## Stack

- Expo SDK 57 (managed workflow), Expo Router, TypeScript strict
- `@supabase/supabase-js`, `expo-secure-store` (auth session, chunked), `@tanstack/react-query`, `zustand`, `expo-audio` (playback and recording), `expo-file-system` (voice clip cache)
- Supabase hosted project `gukiiwozjyrxzzvrdzkn` (Postgres, Auth, Edge Functions, Storage). There is no local Supabase or Docker setup.
- Anthropic `claude-haiku-4-5-20251001`, called only from Edge Functions, with forced tool use
- Azure AI Speech `zh-HK` (TTS and short-audio STT) over REST, only from Edge Functions
- `to-jyutping` (pinned 3.1.1) on the server for romanization

## Layout

```
src/app/_layout.tsx          Root stack, QueryClient, AuthProvider, PrefsSync
src/app/(tabs)/              Practice (home), Word Bank, Settings
src/app/chat.tsx             Chat (read-only when the session has ended)
src/app/summary.tsx          Session summary; calling it ends the session (idempotent)
src/app/welcome.tsx          First-launch level picker
src/app/rehearse.tsx         Rehearse preview: Start / Edit / Make it harder
src/app/past-chats.tsx       Ended chats
src/app/memory.tsx           "What the app remembers about you"
src/components/              message-bubble, ask-sheet, mic-button, limit-notice
src/lib/api.ts               Edge Function wrappers (ApiError carries status + reason)
src/lib/audio.ts             useSpeaker(): tts function -> signed URL -> expo-audio
src/lib/btw.ts               /btw routing (unit tested)
src/lib/prefs-sync.tsx       Loads/saves display prefs to profiles, sends new users to /welcome
scenarios/*.json             The 10 built-in scenarios (edit these, then regenerate the seed)
scripts/build-scenario-seed.mjs  scenarios/*.json -> migration SQL
supabase/functions/          Edge Functions (see below) and _shared/
tests/                       node --test unit tests for the pure modules
```

## Run it

Prerequisites: Node, an iPhone with Expo Go.

```
npm install
cp .env.example .env     # then fill in the two values below
npx expo start           # scan the QR code with the iPhone Camera, open in Expo Go
```

`.env` needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` (the `sb_publishable_...` key). The publishable key is safe in the app. **Never put a `service_role` or `sb_secret_` key in the app or in git.**

- Type check: `npm run typecheck`
- Unit tests: `npm test` (Node's built-in runner; covers the Mandarin detector, Jyutping input detection, Cantonese ratio, gap scheduling and `/btw` routing)
- After adding a route, run `npx expo start` once so the typed routes regenerate.

## Backend

### Deploying
The Supabase CLI is installed and linked. Docker is not installed; deploys still work (harmless warning).

```
supabase db push
supabase functions deploy <name>     # session-start chat session-end gap-tap ask tts stt scenario-generate delete-account
```

### Secrets
Set with `supabase secrets set NAME=value`. Never write them to a file or paste them into chat.

- `ANTHROPIC_API_KEY` (set)
- `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` (set; Free F0 resource in `eastus`)

Auth: **anonymous sign-ins must be enabled** (Dashboard → Authentication → Sign In / Providers).

### Migrations
1. `initial_schema`: all 9 tables, RLS on all of them, profile trigger, grants
2. `seed_first_scenario`, `lock_down_trigger_function`
3. `flagged_replies_view`: replies still Mandarin after one retry (F4), for review in the dashboard
4. `usage_limits_and_tts_bucket`: `bump_usage()` (service role only, atomic daily counters) and the private `tts` Storage bucket
5. `seed_launch_scenarios`: generated from `scenarios/*.json` (upserts, safe to regenerate as a new migration)

### Access model
- The app only **reads** its own rows (plus built-in scenarios). Edge Functions write with the service role (`ctx.supabaseAdmin`).
- Users can update `level`, `display_prefs`, `voice`, `speech_rate`, `memory` on their own profile. Not `plan`.
- `tts_cache` has RLS and no policies (server only). `flagged_replies` is revoked from API roles.

### Edge Functions
All use `withSupabase({ auth: 'user' })`. Reads go through the caller's RLS (`ctx.supabase`).

- **`session-start { scenario_id } | { custom_spec }`**: picks up to 5 target gaps from 15 due candidates (the opener call chooses), generates the opening line. `custom_spec` saves a Rehearse scenario first.
- **`chat { session_id, text, speak?, voice?, rate? }`**: streams NDJSON (`say`, `audio`/`audio_end`, `done`, `error`). Counts usage via `take_usage()` (429 `daily_limit`), streams Claude, Mandarin check on `say` (one regeneration if needed), Jyutping per segment, saves both messages, then records gaps (fallback / asked / corrected, plus a deterministic Mandarin correction), used targets (model or string match, not parroted) and recognition gaps in the background.
- **`session-end { session_id }`**: Cantonese ratio, new/used gaps, goal met, 7-day average, level suggestion, then updates learner memory in the background (`EdgeRuntime.waitUntil`) when the chat had 4+ user messages. Idempotent.
- **`gap-tap { message_id, segment_index }`**: recognition gap, once per word per message.
- **`ask { session_id, question }`**: tutor answer outside the roleplay, examples with Jyutping, `say_it` creates a gap.
- **`tts`**: `GET ?text=&voice=&rate=` returns the MP3 (cached phrases redirect to Storage). `POST` returns a signed URL (used by the bench for WAV). Cache shared with `chat` via `_shared/tts-cache.ts`.
- **`stt`** (raw WAV body): Azure short-audio recognition, `zh-HK`.
- **`scenario-generate { description, base_spec?, edit?, harder? }`**: Rehearse spec preview (nothing saved).
- **`delete-account`**: deletes the auth user; cascades remove everything.

Daily limits (F12): free 25 messages and 10 tutor questions; pro 300 and 100. To make yourself pro for testing, run in the SQL editor: `update profiles set plan = 'pro' where id = '<your user id from Settings>';`

## Performance

`node scripts/bench.mjs` (or `--turns 8`) replays a spoken cha chaan teng conversation against the deployed backend: speech to text, reply, reply to speech, audio download. It prints the median time per step, compares with the previous run, and saves the result in `perf/`. Uses a throwaway anonymous user (deleted afterwards), about $0.03 a run.

In Expo Go (development builds only), each message shows a small ⏱ line: how long the reply took, how long until its voice started playing, and how long your recording took to turn into text.

Every Edge Function on the voice path (`session-start`, `chat`, `tts`, `stt`) returns a `timings` object with per-step milliseconds.

How a spoken turn stays fast (6.5 s → 2.8 s median, see `perf/`):
- **Region:** functions that touch the database run next to it (`x-region: us-west-2`, `FunctionRegion.UsWest2`). `stt` runs nearest to the phone.
- **Streaming reply:** `chat` streams NDJSON. The reply tool's first field is `say`, so the text is sent (`say` event) the moment it exists, before glosses and gaps. With `speak: true`, the reply's voice follows inline as base64 MP3 chunks (`audio`, `audio_end`). The app writes them to a file (`expo-file-system`) and plays it locally, because the iPhone player is slow to start remote streams.
- **Writes after the response:** gap upserts, events and schedules run in `EdgeRuntime.waitUntil`. Only the two messages and the turn count are saved before `done`.
- **Hands-free:** a spoken turn sends itself (Settings → "Send automatically after speaking") and its reply always plays.
- **Opener:** `session-start` makes the opener's voice while the rest of the reply is written and returns it in the response.
- **Phone cache:** every clip is kept in the phone's cache folder, so replays are instant.
- The Azure Speech resource is in `eastus` while everything else runs in Oregon. Moving it to `westus2` would save roughly another 0.1–0.2 s per reply.

## Known gaps and risks
- Azure speech recognition writes numbers as digits (一杯 -> 1杯), so a spoken number won't string-match a target gap written in characters.
- Level-1 replies are very short by design ("under 10 characters"); they can feel abrupt.
- The model sometimes misses corrections; the server adds one for clear Mandarin words (是, 不, 他, 在, 看, 說, 們, 沒有, 什麼, 這, 那).
- Rehearse has a keyword guardrail but no weekly limit for free users yet.
- No native-speaker review has happened. Check `flagged_replies` and sample replies before launch.
- Prompt caching probably doesn't kick in (static prompt is below Haiku's minimum). Cost only.
- **Git:** `main` on https://github.com/ALacc776/gongla.
- **Supabase account:** also holds two unrelated projects (ForgeSoftwareTeam4, coop-application-tracker). Only Gongla is linked. Do not touch the others.
