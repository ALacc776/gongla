# Gong: Cantonese conversation practice app

## What it is
A mobile app for practicing spoken Hong Kong Cantonese by chatting with AI
characters in roleplay scenarios. When the user gets stuck (uses English,
makes a mistake, asks for help, or taps a word they don't know), the app
records a "gap" and brings it back in future conversations until they can
say it unprompted. Full design: docs/design.md.

## Stack
- Expo (managed workflow) + Expo Router, TypeScript in strict mode
- Supabase: Postgres, Auth, Edge Functions (Deno), Storage
- Anthropic API, model claude-haiku-4-5-20251001, called ONLY from Edge Functions
- @tanstack/react-query for server data, zustand for small UI state
- to-jyutping for romanization, on the server only

## Rules
- Never put API keys in the app. All AI and speech calls go through Edge Functions.
- Every database table has Row Level Security.
- Cantonese is colloquial Hong Kong Cantonese in Traditional characters.
- Keep the UI minimal: light background, one accent color, Chinese text at 22pt or larger.
- Only build what the current milestone asks for. No extra features.
- Ask before adding any dependency not listed above.
- After each task, tell me exactly how to test it on my iPhone.
