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

import { ask } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
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
          <Text style={styles.title}>Ask a tutor</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>Ask anything in English. The character won't see this.</Text>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {questions.data?.length === 0 && !send.isPending && (
            <Text style={styles.empty}>
              Try “How do I say receipt?” or “Why did she say 喎?”
            </Text>
          )}
          {questions.data?.map((sq) => (
            <View key={sq.id} style={styles.qa}>
              <Text style={styles.question}>{sq.question}</Text>
              {sq.answer.say_it && (
                <Pressable style={styles.sayIt} onPress={() => onPlay?.(sq.answer.say_it!.hanzi)}>
                  <Text style={styles.sayItHanzi}>{sq.answer.say_it.hanzi}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.exampleJyutping}>{sq.answer.say_it.jyutping}</Text>
                    <Text style={styles.exampleEnglish}>{sq.answer.say_it.english}</Text>
                  </View>
                  {onPlay && <Text style={styles.speaker}>🔊</Text>}
                </Pressable>
              )}
              <Text style={styles.answer}>{sq.answer.text}</Text>
              {sq.answer.examples.map((ex, i) => (
                <Pressable key={i} style={styles.example} onPress={() => onPlay?.(ex.hanzi)}>
                  <View style={styles.flex}>
                    <Text style={styles.exampleHanzi}>{ex.hanzi}</Text>
                    <Text style={styles.exampleJyutping}>{ex.jyutping}</Text>
                    <Text style={styles.exampleEnglish}>{ex.english}</Text>
                  </View>
                  {onPlay && <Text style={styles.speaker}>🔊</Text>}
                </Pressable>
              ))}
              {sq.answer.say_it && (
                <Text style={styles.added}>Added “{sq.answer.say_it.hanzi}” to your Word Bank</Text>
              )}
            </View>
          ))}
          {send.isPending && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
          {send.isError && <Text style={styles.error}>{send.error.message}</Text>}
        </ScrollView>

        {!readOnly && (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="How do I say…?"
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              onSubmitEditing={() => submit(draft)}
            />
            <Pressable
              style={[styles.send, (!draft.trim() || send.isPending) && styles.disabled]}
              disabled={!draft.trim() || send.isPending}
              onPress={() => submit(draft)}>
              <Text style={styles.sendText}>Ask</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  done: { fontSize: 17, color: colors.accent, fontWeight: '600' },
  hint: { fontSize: 14, color: colors.muted, paddingHorizontal: 20, paddingTop: 4 },
  list: { padding: 20, gap: 16 },
  empty: { fontSize: 15, color: colors.muted },
  qa: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  question: { fontSize: 15, fontWeight: '600', color: colors.text },
  answer: { fontSize: 16, color: colors.text, lineHeight: 22 },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
  },
  exampleHanzi: { fontSize: 22, color: colors.text },
  exampleJyutping: { fontSize: 14, color: colors.accent },
  exampleEnglish: { fontSize: 14, color: colors.muted },
  speaker: { fontSize: 18 },
  sayIt: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sayItHanzi: { fontSize: 36, color: colors.text },
  added: { fontSize: 13, color: colors.muted },
  spinner: { marginTop: 8 },
  error: { fontSize: 14, color: colors.accent },
  inputBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: colors.text,
  },
  send: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  sendText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
