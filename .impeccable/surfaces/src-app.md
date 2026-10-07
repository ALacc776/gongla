---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: ["src/components"]
---

# App shell (all screens)

Scope: every screen in src/app plus src/components. Mode: Operate. iPhone only.

Audience and job: adult Cantonese learners on a commute, a few minutes at a time, mostly speaking. The chat is the product; everything else stays out of its way.

Constraints: Chinese text 22pt or larger; System Blue as the only tint; SF Symbols for every icon; follows system light/dark; no new dependencies beyond expo-symbols (added with the user's OK).

## Direction contract

THESIS: A first-party Apple app, played straight. Refuses the vibe-coded look it replaces: one saturated red on every control, bordered cards everywhere, emoji standing in for icons.

OWN-WORLD: iOS semantic colors (systemGroupedBackground, secondarySystemGroupedBackground, label, secondaryLabel, separator) with systemBlue as the single tint; systemGreen/systemRed only for state. Inset grouped lists with continuous 12-16pt corners and hairline inset separators, no borders. Capsule buttons: filled blue, tinted gray, plain. SF Symbols at matching weight. iMessage bubbles: blue sent, gray received.

STORY: The learner sees Practice, taps a scene, talks. Getting stuck produces a calm "Say it like this" card, not an alarm.

FIRST VIEWPORT: Practice: large title, Continue as a grouped card with avatar and 22pt preview, Rehearse field, App Store-style horizontal scene shelves. Native Liquid Glass tab bar with SF Symbols.

FORM: User-pinned direction (Apple HIG canon), not rolled; seed key: none (pinned brief). Signature move: the composer's round mic, Voice Memos-style, whose halo breathes with your voice level and turns red while recording.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
