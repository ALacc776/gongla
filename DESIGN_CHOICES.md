<!--
HOW TO UPDATE THIS FILE (instructions for whoever edits it next, human or AI):
- This is the "why is it built like this" page. Write it like texting a friend: short lines, plain words, no jargon you don't explain.
- When a big choice changes, don't delete the old one. Move it under "Old method" (newest old method first) and write the new one under "Current method".
- Every method line looks like: step -> step -> step = time. Use real numbers from `node scripts/bench.mjs` (saved in perf/), not guesses.
- Keep "What we use" up to date when a service, model or library changes.
- Add one line to "History" for each change, with the date (YYYY-MM-DD).
- Keep the whole page short. If a section gets long, cut words, not facts.
-->

# Design choices

The short version of why Gong works the way it does.

## What we use

- **App:** Expo (React Native), TypeScript
- **Server and database:** Supabase (Postgres plus Edge Functions), in Oregon (us-west-2)
- **AI (the characters and the tutor):** Claude Haiku 4.5
- **Voice, both speaking and listening:** Azure Speech, Cantonese (zh-HK), region East US
- **Voices:** HiuMaan and HiuGaai (female), WanLung (male)
- **Romanization:** to-jyutping, on the server (the AI guesses tones wrong)
- **Language taught:** spoken Hong Kong Cantonese, Traditional characters
- **You can reply in:** Chinese characters, Jyutping, English, or a mix

## A spoken turn (you talk -> you hear her reply)

**Current method: 2.8 seconds**

hold mic -> Azure turns it into text (0.9s) -> Claude starts replying -> reply text shows up the moment it exists (1.3s) -> Azure makes her voice while Claude finishes the rest -> voice arrives with the reply -> plays from your phone (0.7s) -> save to database afterwards

**Old method 2: 3.7 seconds**

hold mic -> text (1.3s) -> streamed reply text (1.3s) -> phone fetches the voice separately -> Azure streams it -> iPhone player starts slowly (1.2s)

**Old method 1: 6.5 seconds**

hold mic -> text (0.8s) -> Claude writes the whole reply -> save everything to the database first, about 12 trips one after another (3.8s) -> ask for the voice -> Azure makes it -> upload to storage -> make a link (1.7s) -> phone downloads it (0.5s) -> plays. You also had to tap Send and tap 🔊.

**What made the difference**

- Functions moved next to the database. Database time went from 1.6s to 0.1s.
- Show the reply text first and do the Word Bank bookkeeping after you've heard it.
- The voice rides along with the reply, so there's no second request.
- Play from a file on the phone. The iPhone takes about 3s to start audio from the internet.
- Spoken turns send themselves and always speak back. No taps.

## Opening line (tap Start -> hear her)

- **Now: 3.6s.** Her voice is made while the rest of the opener is written, and comes back with it.
- **Before: 4.1s.** Write the opener, then ask for the voice, then download it.

## The mic

- **Now:** the mic is ready before you press it, and you can hold to talk or tap to start and tap to stop.
- **Bug 1:** the audio library switched the phone's audio off right after her voice finished, which killed your recording.
- **Bug 2:** the mic took 1.4s to start, so short phrases got lost.
- **Bug 3:** getting the mic ready for the next turn wiped the recording before it was uploaded.
- If it can't hear you, the error box shows the numbers, like how loud it was and how long it recorded.

## Her voice

- **Speed:** normal (1.0×) by default. It used to be 0.85× and sounded too slow. Slow and Learner are in Settings, and 🐢 slows down a single chat.
- **Why Azure:** it has real Hong Kong Cantonese voices and also does the listening, so it's one service and one key.
- **Maybe later:** MiniMax may sound more natural in Cantonese. It isn't tried yet and would need its own key.

## Saving stuff

- **Must happen before you see the reply:** your message, her message, and the turn count.
- **Happens after:** new words, "you said it on your own", and when each word comes back.
- **Voice clips:** saved on the server (shared by everyone) and on your phone, so replays are instant.

## History

- **2026-10-06:** first working version (chat, gaps, Word Bank, tutor, voice). Spoken turn 6.5s.
- **2026-10-06:** added timing everywhere plus `scripts/bench.mjs` to measure it.
- **2026-10-07:** streaming replies, voice sent with the reply, saving after. 6.5s -> 2.8s.
- **2026-10-07:** voice speed set to 1.0× by default.
- **2026-10-07:** fixed the mic (3 bugs above) and a duplicate-message error.
