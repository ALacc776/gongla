import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDisplayStore } from '@/lib/display-store';
import { colors } from '@/lib/theme';
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
        <Pressable style={styles.gloss} onPress={() => onPlay?.(picked.hanzi)}>
          <Text style={styles.glossHanzi}>{picked.hanzi}</Text>
          <View style={styles.flex}>
            <Text style={styles.glossJyutping}>{picked.jyutping}</Text>
            <Text style={styles.glossEnglish}>{picked.gloss}</Text>
          </View>
          {onPlay && <Text style={styles.speaker}>🔊</Text>}
        </Pressable>
      )}

      <View style={styles.footer}>
        {english ? (
          <Text style={[styles.english, styles.shrink]}>{translation}</Text>
        ) : (
          <Pressable style={styles.shrink} onPress={() => setRevealEnglish(!revealEnglish)} hitSlop={6}>
            <Text style={styles.english}>{revealEnglish ? translation : 'Tap for English'}</Text>
          </Pressable>
        )}
        {onPlay && (
          <Pressable onPress={() => onPlay(segments.map((s) => s.hanzi).join(''))} hitSlop={10}>
            <Text style={styles.speaker}>🔊</Text>
          </Pressable>
        )}
      </View>
    </View>
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
        <Pressable key={gap.id} style={styles.chip} onPress={() => onPlay?.(gap.hanzi)}>
          <Text style={styles.chipLabel}>Say it like this</Text>
          <Text style={styles.chipHanzi}>
            {gap.hanzi} <Text style={styles.chipJyutping}>{gap.jyutping}</Text>
          </Text>
          <Text style={styles.chipNote}>{gap.english}</Text>
        </Pressable>
      ))}
      {payload?.corrections?.map((c, i) => (
        <Pressable key={i} style={styles.chip} onPress={() => onPlay?.(c.better)}>
          <Text style={styles.chipLabel}>More natural</Text>
          <Text style={styles.chipHanzi}>{c.better}</Text>
          <Text style={styles.chipJyutping}>{c.better_jyutping}</Text>
          <Text style={styles.chipNote}>{c.note}</Text>
        </Pressable>
      ))}
      {payload?.used?.map((u) => (
        <View key={u.id} style={[styles.chip, styles.usedChip]}>
          <Text style={styles.usedText}>
            ✓ You said <Text style={styles.usedHanzi}>{u.hanzi}</Text> on your own
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TypingBubble() {
  return (
    <View style={[styles.bubble, styles.aiBubble]}>
      <Text style={styles.typing}>…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  userWrap: { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: '85%', gap: 6 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '100%', backgroundColor: colors.accent },
  userText: { fontSize: 22, color: '#FFFFFF' },
  segments: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, rowGap: 4 },
  segment: { alignItems: 'center', borderRadius: 6, paddingHorizontal: 1 },
  segmentSelected: { backgroundColor: colors.accentSoft },
  hanzi: { fontSize: 24, color: colors.text },
  jyutping: { fontSize: 12, color: colors.muted },
  gloss: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
  },
  glossHanzi: { fontSize: 26, color: colors.text },
  glossJyutping: { fontSize: 14, color: colors.accent },
  glossEnglish: { fontSize: 15, color: colors.text },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  english: { fontSize: 15, color: colors.muted },
  speaker: { fontSize: 18 },
  typing: { fontSize: 22, color: colors.muted },
  timing: { fontSize: 11, color: colors.muted, marginTop: 3, marginHorizontal: 4 },
  timingRight: { textAlign: 'right' },
  chip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  chipLabel: { fontSize: 12, fontWeight: '600', color: colors.accent, textTransform: 'uppercase' },
  chipHanzi: { fontSize: 22, color: colors.text },
  chipJyutping: { fontSize: 14, color: colors.muted },
  chipNote: { fontSize: 14, color: colors.muted },
  usedChip: { borderColor: colors.border },
  usedText: { fontSize: 14, color: colors.muted },
  usedHanzi: { fontSize: 22, color: colors.text },
});
