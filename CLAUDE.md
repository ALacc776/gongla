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
- expo-symbols for SF Symbols (the only icon source)

## Rules
- Never put API keys in the app. All AI and speech calls go through Edge Functions.
- Every database table has Row Level Security.
- Cantonese is colloquial Hong Kong Cantonese in Traditional characters.
- Keep the UI minimal: follows the system light/dark setting, one accent color, Chinese text at 22pt or larger.
- Only build what the current milestone asks for. No extra features.
- Ask before adding any dependency not listed above.
- After each task, tell me exactly how to test it on my iPhone.

## UI style
The app must look like a first-party Apple app (think Messages, Settings, App Store).
Full system: DESIGN.md. Read it before building or changing any screen.
- Colors only from `colors` in src/lib/theme.ts (iOS system colors). System Blue is
  the only tint; green and red are for status only. Never hard-code a hex in a screen.
- Native header and tab colors come only from the light/dark navigation themes in
  src/app/_layout.tsx. Never pass `PlatformColor` to header options: it freezes at the
  light value and breaks dark mode.
- Build screens from src/components/ui.tsx: `Group`/`Row` for lists (inset grouped,
  no borders), `Button` capsules (filled = the one main action, tinted, plain),
  `Segmented`, `Toggle`, `IconButton`, `Avatar`. Add to ui.tsx rather than restyling
  per screen.
- Every icon is an SF Symbol via `Icon`. No emoji or text glyphs (🔊, ›, ●, ✓) as icons;
  scene emoji appear only inside `Avatar`.
- Text uses the iOS sizes in `type` (theme.ts); Chinese uses `hanzi` (22pt) or larger.
- Use native navigation: tab screens get large titles (`largeTitleHeader`), scroll
  views set `contentInsetAdjustmentBehavior="automatic"`, sheets use `pageSheet`.
- Touch targets are at least 44pt. Check every new screen in both light and dark mode.
