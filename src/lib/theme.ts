import { DynamicColorIOS, Platform, PlatformColor, type ColorValue, type TextStyle } from 'react-native';

// iOS semantic colors, so light mode, dark mode and Increase Contrast all work
// without extra code. Android (planned for v1.1) gets the light values for now.
const ios = Platform.OS === 'ios';
const system = (name: string, fallback: string): ColorValue => (ios ? PlatformColor(name) : fallback);
const dynamic = (light: string, dark: string): ColorValue => (ios ? DynamicColorIOS({ light, dark }) : light);

export const colors = {
  // Grounds. Grouped screens (lists, settings) sit on the gray; chat sits on plain.
  background: system('systemGroupedBackground', '#F2F2F7'),
  plain: system('systemBackground', '#FFFFFF'),
  card: system('secondarySystemGroupedBackground', '#FFFFFF'),
  // A panel inside a card or bubble.
  inset: system('tertiarySystemGroupedBackground', '#F2F2F7'),

  text: system('label', '#000000'),
  secondary: system('secondaryLabel', 'rgba(60,60,67,0.6)'),
  tertiary: system('tertiaryLabel', 'rgba(60,60,67,0.3)'),
  placeholder: system('placeholderText', 'rgba(60,60,67,0.3)'),
  separator: system('separator', 'rgba(60,60,67,0.29)'),
  // Neutral control backgrounds: gray buttons, chips, segmented tracks.
  fill: system('tertiarySystemFill', 'rgba(118,118,128,0.12)'),
  fillStrong: system('secondarySystemFill', 'rgba(120,120,128,0.16)'),
  // A row being pressed.
  highlight: system('systemGray4', '#D1D1D6'),

  // The one tint: buttons, links, toggles, your own bubbles.
  accent: system('systemBlue', '#007AFF'),
  accentSoft: dynamic('rgba(0,122,255,0.12)', 'rgba(10,132,255,0.24)'),
  onAccent: '#FFFFFF',
  // The other side's bubble, as in Messages.
  received: dynamic('#E9E9EB', '#262629'),

  // State only, never decoration.
  success: system('systemGreen', '#34C759'),
  destructive: system('systemRed', '#FF3B30'),
};

// iOS text styles (Dynamic Type sizes at the default setting).
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

// Chinese characters never go below 22pt.
export const hanzi = { fontSize: 22, lineHeight: 30 } satisfies TextStyle;

export const radius = { card: 14, bubble: 20, control: 10 };

// Header for a top-level tab screen: an iOS large title that collapses on scroll.
// Scroll views under it need contentInsetAdjustmentBehavior="automatic".
export const largeTitleHeader = {
  headerLargeTitleEnabled: true,
  headerTransparent: Platform.OS === 'ios',
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  // No header colors: iOS supplies them, and they follow dark mode (see app/_layout.tsx).
  contentStyle: { backgroundColor: colors.background },
} as const;
