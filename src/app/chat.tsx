import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskSheet } from '@/components/ask-sheet';
import { LimitNotice } from '@/components/limit-notice';
import { MessageBubble, TypingBubble } from '@/components/message-bubble';
import { MicButton } from '@/components/mic-button';
import { ApiError, sendChat, tapGap } from '@/lib/api';
import { useSpeaker } from '@/lib/audio';
import { routeInput } from '@/lib/btw';
import { useDisplayStore } from '@/lib/display-store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { isReply, SESSION_COLUMNS, type ChatMessage, type SessionRow } from '@/lib/types';

const LAYERS = [
  { key: 'hanzi', label: '字' },
  { key: 'jyutping', label: 'jyut' },
  { key: 'english', label: 'EN' },
] as const;

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const display = useDisplayStore();
  const [draft, setDraft] = useState('');
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState<string | null>(null);
  const [turnCapped, setTurnCapped] = useState(false);

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.from('sessions').select(SESSION_COLUMNS).eq('id', sessionId).single();
      if (error) throw error;
      return data as unknown as SessionRow;
    },
  });
  const spec = session.data?.scenarios?.spec;
  const readOnly = !!session.data?.ended_at;
  const speak = useSpeaker(spec?.character.voice);

  const messagesKey = ['messages', sessionId];
  const messages = useQuery({
    queryKey: messagesKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, role, text_raw, payload, created_at')
        .eq('session_id', sessionId)
        .order('created_at');
      if (error) throw error;
      return data as ChatMessage[];
    },
  });

  // Auto-play the opening line and each new reply when the setting is on.
  const lastPlayed = useRef<string | null>(null);
  useEffect(() => {
    const last = messages.data?.at(-1);
    if (!display.autoplay || readOnly || !last || last.role !== 'assistant') return;
    if (lastPlayed.current === null && messages.data!.length > 1) {
      lastPlayed.current = last.id; // Reopened chat: don't replay old messages.
      return;
    }
    if (lastPlayed.current !== last.id) {
      lastPlayed.current = last.id;
      speak(last.text_raw);
    }
  }, [messages.data, display.autoplay, readOnly, speak]);

  const send = useMutation({
    mutationFn: (text: string) => sendChat(sessionId, text),
    onSuccess: ({ user_message, message, turn_count, turn_cap }) => {
      queryClient.setQueryData<ChatMessage[]>(messagesKey, (old = []) => [...old, user_message, message]);
      queryClient.invalidateQueries({ queryKey: ['gaps'] });
      if (turn_count >= turn_cap) setTurnCapped(true);
    },
    onError: (_error, text) => setDraft(text),
    onSettled: () => setPendingText(null),
  });

  function submit() {
    if (!draft.trim() || send.isPending) return;
    const route = routeInput(draft);
    setDraft('');
    if (route.kind === 'ask') {
      // F16: /btw goes to the tutor, never to the character.
      setAskQuestion(route.question || null);
      setAskOpen(true);
      return;
    }
    setPendingText(route.text);
    send.mutate(route.text);
  }

  function onTapSegment(messageId: string, index: number, hanzi: string) {
    speak(hanzi);
    tapGap(messageId, index)
      .then(() => queryClient.invalidateQueries({ queryKey: ['gaps'] }))
      .catch(() => {});
  }

  function endChat() {
    Alert.alert('End this chat?', "You'll see your summary. Ended chats can't be continued.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: () => router.replace({ pathname: '/summary', params: { sessionId } }) },
    ]);
  }

  const lastReply = messages.data?.filter((m) => m.role === 'assistant').at(-1);
  const goalMet = isReply(lastReply?.payload ?? null) && (lastReply!.payload as { goal_met: boolean }).goal_met;
  const limited = send.error instanceof ApiError && send.error.reason === 'daily_limit';

  // The list is inverted so it stays pinned to the newest message.
  const items = [
    ...(messages.data ?? []),
    ...(pendingText
      ? [{ id: 'pending', role: 'user' as const, text_raw: pendingText, payload: null, created_at: '' }]
      : []),
  ].reverse();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {spec ? `${spec.character.emoji ?? ''} ${spec.title}`.trim() : ''}
          </Text>
          {readOnly && <Text style={styles.subtitle}>Ended chat · read only</Text>}
        </View>
        {!readOnly && (
          <Pressable onPress={endChat} hitSlop={10}>
            <Text style={styles.end}>End</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.toolbar}>
        {LAYERS.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => display.toggle(key)}
            style={[styles.toggle, display[key] && styles.toggleOn]}>
            <Text style={[styles.toggleText, display[key] && styles.toggleTextOn]}>{label}</Text>
          </Pressable>
        ))}
        <View style={styles.flex} />
        <Pressable
          onPress={() => display.set({ slow: !display.slow })}
          style={[styles.toggle, display.slow && styles.toggleOn]}>
          <Text style={[styles.toggleText, display.slow && styles.toggleTextOn]}>🐢 slow</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {messages.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            inverted
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={send.isPending ? <TypingBubble /> : null}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                onTapSegment={item.id === 'pending' || readOnly ? undefined : onTapSegment}
                onPlay={speak}
              />
            )}
          />
        )}

        {!readOnly && (goalMet || turnCapped) && (
          <Pressable
            style={styles.banner}
            onPress={() => router.replace({ pathname: '/summary', params: { sessionId } })}>
            <Text style={styles.bannerText}>
              {goalMet ? 'Scene complete! ' : 'This chat is at its length limit. '}
              <Text style={styles.bannerLink}>See your summary ›</Text>
            </Text>
          </Pressable>
        )}

        {limited ? (
          <LimitNotice name={spec?.character.name} />
        ) : (
          (send.isError || messages.isError) && (
            <Text style={styles.error}>{send.error?.message ?? 'Could not load this chat.'}</Text>
          )
        )}

        {readOnly ? (
          <View style={[styles.readOnlyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable onPress={() => setAskOpen(true)}>
              <Text style={styles.bannerLink}>Questions you asked</Text>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/summary', params: { sessionId } })}>
              <Text style={styles.bannerLink}>Summary</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable style={styles.askButton} onPress={() => setAskOpen(true)} hitSlop={6}>
              <Text style={styles.askText}>?</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Reply any way you can"
              placeholderTextColor={colors.muted}
              multiline
              editable={!limited && !turnCapped}
            />
            {draft.trim() ? (
              <Pressable
                style={[styles.sendButton, send.isPending && styles.sendDisabled]}
                disabled={send.isPending}
                onPress={submit}>
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            ) : (
              <MicButton
                disabled={send.isPending || limited || turnCapped}
                onTranscript={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <AskSheet
        sessionId={sessionId}
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        initialQuestion={askQuestion}
        onConsumedInitial={() => setAskQuestion(null)}
        onPlay={speak}
        readOnly={readOnly}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  back: { fontSize: 30, lineHeight: 32, color: colors.accent },
  titleWrap: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted },
  end: { fontSize: 17, fontWeight: '600', color: colors.accent },
  toolbar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggle: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  toggleOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleText: { fontSize: 14, color: colors.muted },
  toggleTextOn: { color: '#FFFFFF' },
  list: { padding: 16, gap: 10 },
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  bannerText: { fontSize: 15, color: colors.text },
  bannerLink: { fontSize: 15, fontWeight: '600', color: colors.accent },
  error: { paddingHorizontal: 16, paddingBottom: 8, fontSize: 14, color: colors.accent },
  readOnlyBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  askButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askText: { fontSize: 20, fontWeight: '700', color: colors.accent },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 22,
    color: colors.text,
  },
  sendButton: {
    height: 44,
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
