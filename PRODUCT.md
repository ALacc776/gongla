# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

iOS first, iPhone only (`supportsTablet: false`). Android is planned for after launch (v1.1); revisit this field when Android work starts.

## Users

- **Primary (about 90%):** adult learners of Hong Kong Cantonese at beginner to intermediate level. Partners of Cantonese speakers, people moving to or visiting Hong Kong, Guangzhou or Macau, and fans of Cantonese media.
- **Secondary (about 10%):** heritage speakers who understand some Cantonese but freeze when speaking. Served through the Family scenarios and Rehearse, not a separate track.

The job: get comfortable *saying* things out loud in real situations (ordering, taxis, meeting a partner's parents, calling a grandparent), not studying written Chinese.

## Product Purpose

Gong lets you chat, by voice or text, with an AI character in a roleplay scenario, in colloquial Hong Kong Cantonese. You reply however you can: Cantonese characters, Jyutping, English, or a mix.

Success is the user getting stuck less over time. The headline number is the Cantonese ratio per session ("You spoke 64% Cantonese"), alongside words moving from Stuck on → Practicing → Got it in the Word Bank.

## Positioning

The app learns what you don't know by listening to you get stuck. Every English fallback, mistake, "how do I say…" question, or tapped word becomes a **gap**, and later chats steer you into saying it again until you can do it unprompted. There is no fixed syllabus; the curriculum is the user's own gaps.

## Operating Context

- **Short sessions on the go** (confirmed): commute or queue, a few minutes at a time, often speaking rather than typing. A spoken turn is about 2.8 s from releasing the mic to hearing the reply, and a spoken turn can send itself and always plays the reply (hands-free).
- The chat is the product. Everything else (Word Bank, summary, past chats, settings) is secondary.
- Inside a chat: each AI message shows characters, Jyutping and English as toggleable layers (字 / jyut / EN); tap a word for its gloss and audio; tap **?** or type `/btw` to ask a tutor without interrupting the roleplay.
- Rehearse My Real Life: describe an upcoming real event in English and practice it as a custom scenario, possibly several times before it happens.
- Navigation: three tabs (Practice, Word Bank, Settings) plus Chat, Summary, Rehearse, Past chats, Memory, and a first-launch level picker.

## Capabilities and Constraints

- Language is colloquial spoken Hong Kong Cantonese in Traditional characters. No formal written Chinese read aloud, no Mandarin forms (a server-side detector enforces this).
- Jyutping is generated on the server by a dictionary library, never by the model.
- Free tier has daily limits (25 messages, 10 tutor questions); hitting one shows a friendly in-character limit notice. Pro (RevenueCat) and Sign in with Apple are not built yet.
- Learner memory: up to 12 short facts about the user, viewable and deletable in Settings.
- Past chats are read-only; only the current chat can be continued.
- Cost per message is a design constraint; features are chosen with per-message cost in mind.
- All AI and speech calls go through Supabase Edge Functions. No keys in the app.
- **Terminology:** gap, Word Bank (Stuck on / Practicing / Got it), Cantonese ratio, scenario, pack, Rehearse, Ask panel / tutor, `/btw`, level 1–5.
- **Undecided:**
  - Simplified characters toggle vs Traditional only.
  - Whether Jyutping input should be promoted or left as a hidden capability.
  - Free-tier generosity (25/day vs an unlimited first week).

## Brand Commitments

- **Name:** "Gong (講, 'to speak')" is a **working title** and may change. Nothing should depend on the name or the character 講 as a mark.
- Voice and personality are not decided. Existing copy is plain and friendly (for example "Auntie Wai needs a break, come back tomorrow"), with characters carrying the personality inside scenarios.
- Binding UI constraint from CLAUDE.md: keep the UI minimal, Chinese text at 22 pt or larger.
- **Look (decided 2026-10-07):** a first-party Apple app played straight. iOS system colors with System Blue as the only tint, SF Symbols for every icon, native tab bar and headers. Follows the system light/dark setting. The earlier red accent was rejected as "vibe coded".

## Evidence on Hand

- 10 built-in scenarios with named characters, in `scenarios/*.json` (food, travel, everyday, social, family packs).
- Measured performance in `perf/` and `DESIGN_CHOICES.md` (spoken turn 6.5 s → 2.8 s).
- App icon and splash placeholders in `assets/images/`.
- **Absent, do not fabricate:** user testimonials, learner outcomes or retention numbers, native-speaker review results (none has happened yet), App Store ratings, pricing (Pro is planned at roughly $6–10/month, not set).

## Product Principles

1. **Getting stuck is data, not failure.** English fallback is welcome and answered with a clear "say it like this" moment, never a penalty.
2. **The chat does most of the work.** The roleplay screen is the product; other screens support it and stay out of the way.
3. **Talk first, read second.** Sessions are short and on the go, so speaking, hearing, and glancing beat reading and tapping through menus.
4. **Spoken Hong Kong Cantonese as people actually talk.** Colloquial, Traditional characters, particles included, no Mandarin.
5. **Cheap to run.** Every feature is weighed against per-message cost.

## Accessibility & Inclusion

- Chinese characters at 22 pt minimum so tones and strokes are readable.
- Learners read three scripts at once (characters, Jyutping, English); each layer can be toggled off.
- Optional tone colors on Jyutping must not be the only way tone is conveyed (the tone number stays in the text).
- Microphone use is optional; every spoken path also works by typing.
