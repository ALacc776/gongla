import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/ui';
import { ask } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors, hanzi, radius, type } from '@/lib/theme';
import type { SideQuestion } from '@/lib/types';

type Props = {
  sessionId: string;
  visible: boolean;
  onClose: () => void;
  // A question typed with /btw in the main input, asked as soon as the sheet opens.
  initialQuestion: string | null;
  onConsumedInitial: () => void;
  onPlay?: (text: string) => void;
  readOnly?: boolean;
};

// F16: a tutor outside the roleplay. The character never sees these questions.
export function AskSheet({ sessionId, visible, onClose, initialQuestion, onConsumedInitial, onPlay, readOnly }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const key = ['side_questions', sessionId];

  const questions = useQuery({
    queryKey: key,
    enabled: visible,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('side_questions')
        .select('id, question, answer, created_at')
        .eq('session_id', sessionId)
        .order('created_at');
      if (error) throw error;
      return data as SideQuestion[];
    },
  });

  const send = useMutation({
    mutationFn: (q: string) => ask(sessionId, q),
    onSuccess: ({ side_question }) => {
      queryClient.setQueryData<SideQuestion[]>(key, (old = []) => [...old, side_question]);
      queryClient.invalidateQueries({ queryKey: ['gaps'] });
    },
    onError: (_e, q) => setDraft(q),
  });

  function submit(text: string) {
    const q = text.trim();
    if (!q || send.isPending) return;
    setDraft('');
    send.mutate(q);
  }

  useEffect(() => {
    if (visible && initialQuestion) {
      submit(initialQuestion);
      onConsumedInitial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialQuestion]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={styles.title}>Ask a tutor</Text>
          <Pressable style={styles.headerSide} onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>Ask anything in English. The character won't see this.</Text>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {questions.data?.length === 0 && !send.isPending && (
            <View style={styles.empty}>
              <Icon name="questionmark.bubble" size={36} color={colors.tertiary} />
              <Text style={styles.emptyText}>Try “How do I say receipt?” or “Why did she say 喎?”</Text>
            </View>
          )}
          {questions.data?.map((sq) => (
            <View key={sq.id} style={styles.qa}>
              <Text style={styles.question}>{sq.question}</Text>
              {sq.answer.say_it && (
                <Pressable
                  style={({ pressed }) => [styles.sayIt, pressed && styles.pressed]}
                  onPress={() => onPlay?.(sq.answer.say_it!.hanzi)}
                  accessibilityRole="button">
                  <Text style={styles.sayItHanzi}>{sq.answer.say_it.hanzi}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.exampleJyutping}>{sq.answer.say_it.jyutping}</Text>
                    <Text style={styles.exampleEnglish}>{sq.answer.say_it.english}</Text>
                  </View>
                  {onPlay && <Icon name="speaker.wave.2.fill" size={20} />}
                </Pressable>
              )}
              <Text style={styles.answer}>{sq.answer.text}</Text>
              {sq.answer.examples.map((ex, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.example, pressed && styles.pressed]}
                  onPress={() => onPlay?.(ex.hanzi)}
                  accessibilityRole="button">
                  <View style={styles.flex}>
                    <Text style={styles.exampleHanzi}>{ex.hanzi}</Text>
                    <Text style={styles.exampleJyutping}>{ex.jyutping}</Text>
                    <Text style={styles.exampleEnglish}>{ex.english}</Text>
                  </View>
                  {onPlay && <Icon name="speaker.wave.2.fill" size={18} />}
                </Pressable>
              ))}
              {sq.answer.say_it && (
                <View style={styles.added}>
                  <Icon name="checkmark.circle.fill" size={14} color={colors.success} />
                  <Text style={styles.addedText}>Added “{sq.answer.say_it.hanzi}” to your Word Bank</Text>
                </View>
              )}
            </View>
          ))}
          {send.isPending && <ActivityIndicator style={styles.spinner} />}
          {send.isError && <Text style={styles.error}>{send.error.message}</Text>}
        </ScrollView>

        {!readOnly && (
          <View style={styles.inputBar}>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="How do I say…?"
                placeholderTextColor={colors.placeholder}
                returnKeyType="send"
                onSubmitEditing={() => submit(draft)}
              />
              <Pressable
                style={[styles.send, (!draft.trim() || send.isPending) && styles.disabled]}
                disabled={!draft.trim() || send.isPending}
                onPress={() => submit(draft)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Ask">
                <Icon name="arrow.up.circle.fill" size={30} />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    minHeight: 44,
  },
  headerSide: { width: 64, alignItems: 'flex-end' },
  title: { ...type.headline, color: colors.text },
  done: { ...type.headline, color: colors.accent },
  hint: { ...type.footnote, color: colors.secondary, textAlign: 'center', paddingHorizontal: 20, paddingTop: 2 },
  list: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 40, paddingHorizontal: 24 },
  emptyText: { ...type.subhead, color: colors.secondary, textAlign: 'center' },
  qa: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
  },
  question: { ...type.headline, color: colors.text },
  answer: { ...type.body, color: colors.text },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.inset,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exampleHanzi: { ...hanzi, color: colors.text },
  exampleJyutping: { ...type.footnote, color: colors.secondary },
  exampleEnglish: { ...type.footnote, color: colors.secondary },
  sayIt: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sayItHanzi: { fontSize: 36, lineHeight: 44, color: colors.text },
  added: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  addedText: { ...type.footnote, color: colors.secondary },
  spinner: { marginTop: 8 },
  error: { ...type.footnote, color: colors.destructive },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 28,
    backgroundColor: colors.background,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  input: { ...type.body, flex: 1, paddingLeft: 16, paddingVertical: 10, color: colors.text },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
});
