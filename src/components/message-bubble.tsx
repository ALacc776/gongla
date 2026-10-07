import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { useDisplayStore } from '@/lib/display-store';
import { colors, hanzi as hanziStyle, radius, type } from '@/lib/theme';
import { isReply, type ChatMessage, type UserPayload } from '@/lib/types';

type Props = {
  message: Pick<ChatMessage, 'id' | 'role' | 'text_raw' | 'payload'>;
  // Tap-to-gloss: called when a word is tapped (records a recognition gap).
  onTapSegment?: (messageId: string, index: number, hanzi: string) => void;
  onPlay?: (text: string) => void;
  // Development builds only: e.g. "⏱ reply 3.8s · voice 1.7s".
  timing?: string;
};

export function MessageBubble({ message, onTapSegment, onPlay, timing }: Props) {
  const bubble =
    message.role === 'user' || !isReply(message.payload) ? (
      <UserBubble text={message.text_raw} payload={message.payload as UserPayload | null} onPlay={onPlay} />
    ) : (
      <AssistantBubble message={message} onTapSegment={onTapSegment} onPlay={onPlay} />
    );
  if (!timing) return bubble;
  return (
    <View>
      {bubble}
      <Text style={[styles.timing, message.role === 'user' && styles.timingRight]}>{timing}</Text>
    </View>
  );
}

// A speaker button sized for inside a bubble, with a full-size touch area.
function Speaker({ onPress, label = 'Play' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => pressed && styles.pressed}>
      <Icon name="speaker.wave.2.fill" size={18} />
    </Pressable>
  );
}

function AssistantBubble({ message, onTapSegment, onPlay }: Props) {
  const { hanzi, jyutping, english } = useDisplayStore();
  const [selected, setSelected] = useState<number | null>(null);
  const [revealEnglish, setRevealEnglish] = useState(false);
  if (!isReply(message.payload)) return null;
  const { segments, english: translation } = message.payload;
  const picked = selected === null ? null : segments[selected];

  return (
    <View style={[styles.bubble, styles.aiBubble]}>
      <View style={styles.segments}>
        {segments.map((segment, i) => {
          const tappable = !!segment.gloss;
          return (
            <Pressable
              key={i}
              disabled={!tappable}
              onPress={() => {
                setSelected(selected === i ? null : i);
                if (selected !== i) onTapSegment?.(message.id, i, segment.hanzi);
              }}
              style={[styles.segment, selected === i && styles.segmentSelected]}>
              {hanzi && <Text style={styles.hanzi}>{segment.hanzi}</Text>}
              {jyutping && <Text style={styles.jyutping}>{segment.jyutping}</Text>}
            </Pressable>
          );
        })}
      </View>

      {picked && (
        <Pressable style={styles.gloss} onPress={() => onPlay?.(picked.hanzi)} accessibilityRole="button">
          <Text style={styles.glossHanzi}>{picked.hanzi}</Text>
          <View style={styles.flex}>
            <Text style={styles.glossJyutping}>{picked.jyutping}</Text>
            <Text style={styles.glossEnglish}>{picked.gloss}</Text>
          </View>
          {onPlay && <Icon name="speaker.wave.2.fill" size={18} />}
        </Pressable>
      )}

      <View style={styles.footer}>
        {english ? (
          <Text style={[styles.english, styles.shrink]}>{translation}</Text>
        ) : (
          <Pressable style={styles.shrink} onPress={() => setRevealEnglish(!revealEnglish)} hitSlop={8}>
            <Text style={revealEnglish ? styles.english : styles.reveal}>
              {revealEnglish ? translation : 'Tap for English'}
            </Text>
          </Pressable>
        )}
        {onPlay && <Speaker label="Play this line" onPress={() => onPlay(segments.map((s) => s.hanzi).join(''))} />}
      </View>
    </View>
  );
}

// A note under your own message: how to say it, a more natural way, or praise.
function Note({
  icon,
  iconColor = colors.accent,
  label,
  children,
  onPress,
}: {
  icon: IconName;
  iconColor?: typeof colors.accent;
  label?: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.note, pressed && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}>
      {label ? (
        <>
          <View style={styles.noteLabel}>
            <Icon name={icon} size={14} color={iconColor} weight="semibold" />
            <Text style={[styles.noteLabelText, { color: iconColor }]}>{label}</Text>
          </View>
          {children}
        </>
      ) : (
        <View style={styles.noteLabel}>
          <Icon name={icon} size={16} color={iconColor} weight="semibold" />
          <View style={styles.shrink}>{children}</View>
        </View>
      )}
    </Pressable>
  );
}

function UserBubble({
  text,
  payload,
  onPlay,
}: {
  text: string;
  payload: UserPayload | null;
  onPlay?: (text: string) => void;
}) {
  return (
    <View style={styles.userWrap}>
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{text}</Text>
      </View>
      {payload?.gaps?.map((gap) => (
        <Note key={gap.id} icon="lightbulb.fill" label="Say it like this" onPress={() => onPlay?.(gap.hanzi)}>
          <View style={styles.noteRow}>
            <View style={styles.shrink}>
              <Text style={styles.noteHanzi}>{gap.hanzi}</Text>
              <Text style={styles.noteJyutping}>{gap.jyutping}</Text>
              <Text style={styles.noteText}>{gap.english}</Text>
            </View>
            {onPlay && <Icon name="speaker.wave.2.fill" size={18} />}
          </View>
        </Note>
      ))}
      {payload?.corrections?.map((c, i) => (
        <Note key={i} icon="text.bubble.fill" label="More natural" onPress={() => onPlay?.(c.better)}>
          <View style={styles.noteRow}>
            <View style={styles.shrink}>
              <Text style={styles.noteHanzi}>{c.better}</Text>
              <Text style={styles.noteJyutping}>{c.better_jyutping}</Text>
              <Text style={styles.noteText}>{c.note}</Text>
            </View>
            {onPlay && <Icon name="speaker.wave.2.fill" size={18} />}
          </View>
        </Note>
      ))}
      {payload?.used?.map((u) => (
        <Note key={u.id} icon="checkmark.circle.fill" iconColor={colors.success}>
          <Text style={styles.noteText}>
            You said <Text style={styles.usedHanzi}>{u.hanzi}</Text> on your own
          </Text>
        </Note>
      ))}
    </View>
  );
}

// Three dots that pulse in turn while the character is "typing".
export function TypingBubble() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <View style={[styles.bubble, styles.aiBubble, styles.typing]} accessibilityLabel="Typing">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            {
              opacity: t.interpolate({
                inputRange: [0, i * 0.2, i * 0.2 + 0.2, i * 0.2 + 0.4, 1],
                outputRange: [0.3, 0.3, 1, 0.3, 0.3],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.bubble,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: colors.received, gap: 8 },
  userWrap: { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: '85%', gap: 6 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '100%', backgroundColor: colors.accent },
  userText: { ...hanziStyle, color: colors.onAccent },
  segments: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, rowGap: 4 },
  segment: { alignItems: 'center', borderRadius: 6, paddingHorizontal: 1 },
  segmentSelected: { backgroundColor: colors.accentSoft },
  hanzi: { fontSize: 24, lineHeight: 32, color: colors.text },
  jyutping: { ...type.caption, color: colors.secondary },
  gloss: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  glossHanzi: { fontSize: 28, lineHeight: 34, color: colors.text },
  glossJyutping: { ...type.footnote, color: colors.secondary },
  glossEnglish: { ...type.subhead, color: colors.text },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  english: { ...type.subhead, color: colors.secondary },
  reveal: { ...type.subhead, color: colors.accent },
  timing: { ...type.caption, color: colors.tertiary, marginTop: 3, marginHorizontal: 4 },
  timingRight: { textAlign: 'right' },

  note: {
    alignSelf: 'stretch',
    backgroundColor: colors.inset,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  noteLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  noteLabelText: { ...type.footnote, fontWeight: '600' },
  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  noteHanzi: { ...hanziStyle, color: colors.text },
  noteJyutping: { ...type.footnote, color: colors.secondary },
  noteText: { ...type.footnote, color: colors.secondary },
  usedHanzi: { ...hanziStyle, color: colors.text },

  typing: { flexDirection: 'row', gap: 5, paddingVertical: 15, paddingHorizontal: 16 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },
});
