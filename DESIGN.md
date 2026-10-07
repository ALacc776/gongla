---
name: Gong
description: Spoken Hong Kong Cantonese practice, built as a first-party iOS app played straight.
colors:
  system-blue: "#007AFF"
  system-blue-soft: "rgba(0,122,255,0.12)"
  on-accent: "#FFFFFF"
  grouped-background: "#F2F2F7"
  plain-background: "#FFFFFF"
  grouped-card: "#FFFFFF"
  grouped-inset: "#F2F2F7"
  label: "#000000"
  secondary-label: "rgba(60,60,67,0.6)"
  tertiary-label: "rgba(60,60,67,0.3)"
  placeholder-text: "rgba(60,60,67,0.3)"
  separator: "rgba(60,60,67,0.29)"
  tertiary-fill: "rgba(118,118,128,0.12)"
  secondary-fill: "rgba(120,120,128,0.16)"
  pressed-highlight: "#D1D1D6"
  received-bubble: "#E9E9EB"
  system-green: "#34C759"
  system-red: "#FF3B30"
typography:
  large-title:
    fontFamily: "SF Pro (system)"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: "41px"
  title1:
    fontFamily: "SF Pro (system)"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "34px"
  title2:
    fontFamily: "SF Pro (system)"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "28px"
  title3:
    fontFamily: "SF Pro (system)"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "25px"
  headline:
    fontFamily: "SF Pro (system)"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
  body:
    fontFamily: "SF Pro (system)"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "22px"
  callout:
    fontFamily: "SF Pro (system)"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "21px"
  subhead:
    fontFamily: "SF Pro (system)"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
  footnote:
    fontFamily: "SF Pro (system)"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  caption:
    fontFamily: "SF Pro (system)"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  hanzi:
    fontFamily: "PingFang HK (system)"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: "30px"
rounded:
  card: "14px"
  bubble: "20px"
  capsule: "999px"
spacing:
  hairline: "0.5px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  section: "28px"
  touch: "44px"
components:
  button-filled:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.on-accent}"
    typography: "{typography.headline}"
    rounded: "{rounded.capsule}"
    padding: "0 20px"
    height: "50px"
  button-tinted:
    backgroundColor: "{colors.tertiary-fill}"
    textColor: "{colors.system-blue}"
    typography: "{typography.headline}"
    rounded: "{rounded.capsule}"
    padding: "0 20px"
    height: "50px"
  button-plain:
    textColor: "{colors.system-blue}"
    typography: "{typography.headline}"
    rounded: "{rounded.capsule}"
    padding: "0 20px"
    height: "50px"
  button-small:
    rounded: "{rounded.capsule}"
    padding: "0 14px"
    height: "34px"
  group-card:
    backgroundColor: "{colors.grouped-card}"
    rounded: "{rounded.card}"
  list-row:
    backgroundColor: "{colors.grouped-card}"
    textColor: "{colors.label}"
    typography: "{typography.body}"
    padding: "11px 16px"
    height: "44px"
  list-row-pressed:
    backgroundColor: "{colors.pressed-highlight}"
  bubble-sent:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.on-accent}"
    typography: "{typography.hanzi}"
    rounded: "{rounded.bubble}"
    padding: "9px 14px"
  bubble-received:
    backgroundColor: "{colors.received-bubble}"
    textColor: "{colors.label}"
    rounded: "{rounded.bubble}"
    padding: "9px 14px"
  toggle-on:
    backgroundColor: "{colors.system-blue-soft}"
    textColor: "{colors.system-blue}"
    rounded: "{rounded.capsule}"
    padding: "0 12px"
    height: "32px"
  toggle-off:
    backgroundColor: "{colors.tertiary-fill}"
    textColor: "{colors.secondary-label}"
    rounded: "{rounded.capsule}"
    padding: "0 12px"
    height: "32px"
  segmented-track:
    backgroundColor: "{colors.tertiary-fill}"
    padding: "2px"
    height: "32px"
  mic-button:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.capsule}"
    size: "44px"
  mic-button-recording:
    backgroundColor: "{colors.system-red}"
---

# Design System: Gong

## Overview

**Creative North Star: "The First-Party App"**

Gong looks like something Apple shipped in iOS: Settings-style inset grouped lists, Messages-style bubbles, Voice Memos' round record button, a native Liquid Glass tab bar and native large-title headers. Nothing is styled to be noticed. The system's job is to stay out of the way of the chat, which is the product, and to make Chinese text large and calm.

Every color is an iOS semantic color resolved at runtime through `PlatformColor` (with the hex values below as non-iOS fallbacks), so light mode, dark mode and Increase Contrast work without extra code. System Blue is the only tint. Depth comes from the system's grouped-background layering rather than shadows or borders. Icons are SF Symbols through `expo-symbols`, at a weight that matches the adjacent text.

The confirmed rejection is the look this replaced: one saturated red on every control, bordered cards everywhere, emoji standing in for icons.

**Key Characteristics:**
- iOS semantic colors only; System Blue as the single tint; green and red for state only.
- Inset grouped lists with continuous-curve corners and hairline inset separators, no borders.
- Capsule buttons in three variants: filled, tinted, plain.
- iMessage bubbles: blue sent, gray received.
- SF Symbols for every icon; character emoji appear only inside avatars.
- Chinese characters never below 22pt.

## Colors

The palette is Apple's semantic system palette, unmodified, with one blue tint over grays that layer by elevation.

Frontmatter values are the light-appearance fallbacks; on iOS each token resolves to the named system color and adapts automatically. Dark values live in the sidecar.

### Primary
- **System Blue** (`systemBlue`): the one tint. Filled buttons, links and action rows, toggles and segmented selection, SF Symbol icons by default, your own (sent) bubbles, the mic button at rest, the tab bar's selected item, the Summary meter fill.
- **System Blue Soft** (dynamic, 12% light / 24% dark): the "on" background of capsule toggles and the highlight behind a tapped word in a bubble.
- **On Accent** (white): text and symbols on filled blue or red.

### Neutral
- **Grouped Background** (`systemGroupedBackground`): the ground of every list-style screen (Practice, Word Bank, Settings, Past Chats, Memory, Rehearse).
- **Plain Background** (`systemBackground`): the ground of the chat and its composer, as in Messages.
- **Grouped Card** (`secondarySystemGroupedBackground`): grouped-list cards, scene shelf cards, sheet panels.
- **Grouped Inset** (`tertiarySystemGroupedBackground`): a panel inside a card or bubble area: feedback notes under your message, chat banners, Ask examples.
- **Label / Secondary / Tertiary Label / Placeholder** (`label`, `secondaryLabel`, `tertiaryLabel`, `placeholderText`): primary text; supporting text, Jyutping, translations, group headers; chevrons and dev timing; field placeholders.
- **Separator** (`separator`): hairline row dividers and the hairline borders of the chat composer field.
- **Tertiary Fill / Secondary Fill** (`tertiarySystemFill`, `secondarySystemFill`): neutral control grounds (tinted buttons, toggles off, segmented track, avatar disc, the Ask circle); meter track.
- **Pressed Highlight** (`systemGray4`): a list row while pressed.
- **Received Bubble** (dynamic, #E9E9EB light / #262629 dark): the character's bubble, as in Messages.

### State
- **System Green** (`systemGreen`): success only: goal met, "added to Word Bank", praise notes.
- **System Red** (`systemRed`): destructive rows and buttons, errors, and the mic while recording.

### Named Rules
**The One Tint Rule.** System Blue is the only accent. No second brand color, no per-scene colors.

**The State-Only Rule.** Green and red mean something happened (success, destruction, recording, error). They never decorate.

**The Semantic Source Rule.** Colors come from `colors` in `src/lib/theme.ts`, which resolves iOS semantic colors. Never hard-code a hex in a screen; the fallback hex exists only for non-iOS.

**The Frozen Header Rule.** Native headers and other native chrome take their colors from the React Navigation theme in `src/app/_layout.tsx` (light: #007AFF / #F2F2F7 / #FFFFFF / #000000; dark: #0A84FF / #000000 / #000000 / #FFFFFF), switched on `useColorScheme()`. `PlatformColor` values passed to native header options freeze at their light values, so header option objects carry no colors.

## Typography

**Display Font:** SF Pro (the system font; no custom family is loaded)
**Body Font:** SF Pro
**Chinese:** the system CJK face (PingFang HK)

**Character:** Apple's text styles at their default Dynamic Type sizes, used as-is. Hierarchy comes from size and weight, never from color or decoration. Chinese is set larger than Latin text so characters stay legible at a glance.

### Hierarchy
- **Large Title** (700, 34/41): top-level tab screen titles, as native large titles that collapse on scroll.
- **Title 1 / Title 2** (700, 28/34 and 22/28): occasional screen-level headings.
- **Title 3** (600, 20/25): prominent group headers on content screens ("Continue", shelf titles like "Food").
- **Headline** (600, 17/22): card titles, banner titles, button labels (17/600 large, 15/600 small).
- **Body** (400, 17/22): row titles, row values, text inputs, answers.
- **Subhead** (400, 15/20): translations in bubbles, secondary lines, toggle labels (15/500).
- **Footnote** (400, 13/18): row subtitles, Jyutping under notes, group headers (uppercase, Settings-style) and footers, errors.
- **Caption** (400, 12/16): Jyutping under each word in a bubble.
- **Hanzi** (400, 22/30): the floor for any Chinese characters: your sent bubbles, notes, examples, composer input. Larger steps are used where Chinese is the subject: 24/32 in received bubbles, 26-28 in Word Bank and Summary lists and the gloss panel, 36 in the Ask "say it" card, 64 in the Word Bank detail sheet.
- **Summary figure** (700, 80/92, tabular numerals, -1 tracking): the Cantonese ratio on the Summary screen only.

### Named Rules
**The 22pt Floor Rule.** Chinese characters never render below 22pt, anywhere. Spread `hanzi` from the theme or go larger.

**The Text Style Rule.** Use the `type` scale from the theme; do not invent intermediate sizes for Latin text.

## Layout

Screens follow iOS grouped-list geometry. Groups are inset 16pt from the screen edges; rows are at least 44pt tall with 16pt horizontal and 11pt vertical padding and a 12pt gap between icon and text. Group headers sit 7pt above the card (16pt indent), footers 7pt below. Content screens stack sections with a 28pt gap. Practice adds App Store-style horizontal shelves: 164pt-wide cards, 12pt apart, 16pt side padding, with the shelf title at 20pt indent.

The chat is a single column on the plain background: 16pt side padding, 10pt between bubbles, bubbles capped at 85% width. The composer is a bottom bar: a 44pt Ask button, a 44pt-tall capsule field, and the 44pt mic.

Tab screens use native large-title headers that are transparent over the grouped background (`largeTitleHeader` in the theme); their scroll views set `contentInsetAdjustmentBehavior="automatic"`. Pushed grouped screens use transparent headers that iOS blurs on scroll. iPhone only, portrait.

Every tappable target is at least 44pt; smaller visuals (speakers in bubbles, toggles) extend their touch area with hit slop.

## Elevation & Depth

Flat. Depth comes from the system's tonal layering: grouped background, then grouped card, then grouped inset, each a step lighter (or, in dark mode, lighter on black). Native chrome (tab bar, headers, sheets) provides its own blur and Liquid Glass. The only hand-made shadow is the Segmented control's thumb, which copies UIKit's.

### Shadow Vocabulary
- **Segmented thumb** (`shadowColor #000, opacity 0.12, radius 4, offset 0 2`): the sliding selection in the Segmented control only.

### Named Rules
**The Layer-Not-Shadow Rule.** Separate surfaces by background level, never by drop shadows or borders.

## Shapes

Continuous (squircle) corners everywhere (`borderCurve: 'continuous'`). Grouped cards, banners and sheet panels use the card radius (14pt); bubbles use 20pt; buttons, toggles, the composer field and the mic are full capsules or circles. Avatars are circles. Separators are hairlines, inset 16pt from the leading edge (more when rows carry an icon or avatar). The only stroke in the system is the composer field's thin separator-colored outline, matching Messages.

## Components

### Buttons
Quiet, native capsules.
- **Shape:** full capsule (999 radius).
- **Filled:** System Blue ground, white 17/600 label, 50pt min height, 20pt side padding. The one main action on a screen.
- **Tinted:** neutral fill ground with a blue label. Secondary actions.
- **Plain:** blue label only.
- **Small:** 34pt min height, 14pt padding, 15/600 label, hugs its content.
- **Icon:** optional leading SF Symbol at semibold (18pt large, 15pt small) in the label color.
- **Destructive:** any variant swaps blue for System Red.
- **Pressed / Disabled / Loading:** 0.6 opacity pressed; 0.35 disabled; a native activity indicator replaces the label while loading.

### Grouped Lists (Group, Row)
- **Group:** 16pt screen inset, grouped-card ground, 14pt continuous corners, clipped. Header is footnote uppercase secondary (Settings) or a Title 3 sentence-case header when `prominent` (content screens). Optional footnote footer.
- **Row:** 44pt min, body title with optional footnote subtitle, optional trailing value in secondary, checkmark (blue) or chevron (13pt semibold, tertiary). Action rows have blue titles; destructive rows red. Pressed rows fill with the pressed highlight.
- **Separators:** hairline, inset 16pt by default.

### Cards / Containers
- **Corner Style:** 14pt for grouped cards and panels; 18pt for Practice shelf cards and the loading HUD; 16pt for notes; 12pt for Ask examples.
- **Background:** grouped card on the grouped background; grouped inset for a panel inside a card or under a bubble.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none.
- **Internal Padding:** 14-16pt.

### Inputs / Fields
- **Chat composer:** 44pt-min capsule on the plain background with a thin separator outline; text at the 22pt hanzi size; grows to 132pt.
- **Ask sheet field:** 44pt capsule, grouped card on grouped background, no outline, body text, trailing `arrow.up.circle.fill` send.
- **Rehearse field:** body text inside a grouped card, with a small filled "Plan it" button aligned trailing.
- **Placeholder:** placeholder-text color. Disabled controls drop to 0.35 opacity.

### Navigation
- **Tabs:** native tabs (`NativeTabs`) tinted System Blue, minimizing on scroll down. Three tabs with SF Symbol pairs: `bubble.left.and.bubble.right` (Practice), `character.book.closed.zh` (Word Bank), `gearshape` (Settings), each switching to its `.fill` form when selected.
- **Headers:** native stack headers, minimal back button. Tab roots use large titles; pushed screens use transparent headers; the chat uses a standard header on the plain ground with "End" as a plain blue action.

### Chips: Toggle
- **Style:** 32pt capsule, 12pt padding, optional 15pt medium SF Symbol, 15/500 label.
- **State:** on is System Blue Soft with a blue label; off is the neutral fill with a secondary label. Used for the chat's display layers (字 / jyut / EN) and Slow.

### Segmented Control
A hand-built UIKit-style segmented control (no extra dependency). 32pt track on the neutral fill, 2pt padding, 9pt continuous corners; a white (dark: #636366) thumb at 7pt corners with the segmented shadow slides between options on a spring (speed 20, no bounce). Labels are 13/500, 13/600 when selected.

### Message Bubbles
- **Received:** gray received-bubble ground, 20pt continuous corners, 9/14 padding, at most 85% width, leading. Each word is a tappable segment: hanzi at 24/32 with caption Jyutping under it; a tapped word gets the soft-blue highlight and opens a gloss panel inside the bubble (28pt hanzi, footnote Jyutping, subhead English, hairline top rule). Footer: subhead English (or blue "Tap for English") and an 18pt blue speaker symbol.
- **Sent:** System Blue ground, white hanzi-size text, trailing.
- **Notes under a sent message:** grouped-inset panel, 16pt corners, a 14pt semibold symbol and footnote label in the note's color ("Say it like this" in blue, praise in green), then the 22pt suggestion.
- **Typing:** three 8pt secondary-label dots.

### Avatar
A circular neutral-fill disc (44pt default; 40-56 in lists and Rehearse) holding the scenario character's emoji, like a contact photo. Without an emoji it shows `person.fill` in secondary label.

### Mic Button (signature)
Voice Memos-style: a 44pt System Blue circle with a white mic symbol. While recording it turns System Red, and a red halo behind it scales from 1x to 1.5x with the live input level (120ms timing). This is the one place motion responds to the user's voice.

## Do's and Don'ts

### Do:
- **Do** take every color from `colors` in `src/lib/theme.ts` so it follows light, dark and Increase Contrast.
- **Do** set native header and navigation colors only through the light/dark navigation themes in `src/app/_layout.tsx`.
- **Do** use System Blue for every interactive tint, and System Green / System Red only for success, destruction, errors and recording.
- **Do** set Chinese characters at 22pt or larger, using `hanzi` from the theme or a larger size.
- **Do** build list screens from `Group` and `Row`: inset grouped cards, 14pt continuous corners, hairline inset separators.
- **Do** use `Button` capsules: filled for the one main action, tinted for secondary, plain for text actions.
- **Do** use SF Symbols through `Icon` / `expo-symbols` for every icon, at a weight matching the adjacent text.
- **Do** keep touch targets at 44pt or more.

### Don't:
- **Don't** add a second accent color or per-scene colors.
- **Don't** pass `PlatformColor` values to native header options; they freeze at light values.
- **Don't** put borders around cards or drop shadows under surfaces; separate them by background level.
- **Don't** use emoji or text glyphs as UI icons. Character emoji appear only inside `Avatar`, as scene content.
- **Don't** add a UI dependency for controls the system or `ui.tsx` already covers (the Segmented control is hand-built for this reason).
- **Don't** set Chinese text below 22pt. The one exception is a control label that is a symbol, not reading text: the 字 layer toggle in the chat toolbar.
