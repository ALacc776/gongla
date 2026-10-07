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
import { receiveClip, useSpeaker, useVoiceSettings, warmUpAudio } from '@/lib/audio';
import { routeInput } from '@/lib/btw';
import { useDisplayStore } from '@/lib/display-store';
import { formatSeconds, SHOW_TIMINGS, usePerfStore } from '@/lib/perf-store';
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
  const [listening, setListening] = useState(false);
  // The reply while it streams in: its text arrives before the glosses and gaps.
  const [streamingReply, setStreamingReply] = useState<{ id: string; hanzi: string } | null>(null);

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
  const voiceSettings = useVoiceSettings(spec?.character.voice);

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

  // Replies already spoken (or that shouldn't be), so nothing plays twice.
  const played = useRef<Set<string> | null>(null);
  // Auto-play the opening line when the setting is on. Replies are spoken as they
  // stream in (see send), and a reopened chat doesn't replay old messages.
  useEffect(() => {
    if (!messages.data || readOnly) return;
    if (played.current === null) {
      played.current = new Set(messages.data.length > 1 ? messages.data.map((m) => m.id) : []);
    }
    const last = messages.data.at(-1);
    if (!display.autoplay || !last || last.role !== 'assistant' || played.current.has(last.id)) return;
    played.current.add(last.id);
    speak(last.text_raw);
  }, [messages.data, display.autoplay, readOnly, speak]);

  useEffect(() => {
    warmUpAudio().catch(() => {});
  }, []);

  const perf = usePerfStore();
  // How long the last voice recording took to turn into text; attached to the next sent message.
  const heardMs = useRef<number | null>(null);

  const send = useMutation({
    mutationFn: ({ text, spoken }: { text: string; spoken: boolean }) => {
      const started = Date.now();
      // A turn you spoke always answers out loud; its voice streams in with the reply.
      const wantVoice = spoken || display.autoplay;
      let clip: ReturnType<typeof receiveClip> | null = null;
      let sayText = '';
      return sendChat(
        sessionId,
        text,
        {
          onSay: (say) => {
            perf.record('reply', say.message_id, Date.now() - started);
            setStreamingReply({ id: say.message_id, hanzi: say.hanzi });
            played.current?.add(say.message_id);
            sayText = say.hanzi;
            if (wantVoice) clip = receiveClip(say.hanzi, voiceSettings);
          },
          onAudio: (b64) => clip?.append(b64),
          onAudioEnd: () => {
            clip?.play().then((ok) => {
              if (!ok) speak(sayText);
            });
          },
          onAudioError: () => speak(sayText),
        },
        wantVoice ? voiceSettings : undefined,
      );
    },
    onSuccess: ({ user_message, message, turn_count, turn_cap }) => {
      if (heardMs.current !== null) perf.record('heard', user_message.id, heardMs.current);
      heardMs.current = null;
      // Swap the previews for the saved messages in one go, so no message is listed twice.
      setPendingText(null);
      setStreamingReply(null);
      queryClient.setQueryData<ChatMessage[]>(messagesKey, (old = []) => [
        ...old.filter((m) => m.id !== user_message.id && m.id !== message.id),
        user_message,
        message,
      ]);
      queryClient.invalidateQueries({ queryKey: ['gaps'] });
      if (turn_count >= turn_cap) setTurnCapped(true);
    },
    onError: (_error, { text }) => setDraft(text),
    onSettled: () => {
      setPendingText(null);
      setStreamingReply(null);
    },
  });

  function submit(raw = draft, spoken = false) {
    if (!raw.trim() || send.isPending) return;
    const route = routeInput(raw);
    setDraft('');
    if (route.kind === 'ask') {
      // F16: /btw goes to the tutor, never to the character.
      setAskQuestion(route.question || null);
      setAskOpen(true);
      return;
    }
    setPendingText(route.text);
    send.mutate({ text: route.text, spoken });
  }

  // F14: what the mic heard. Sent straight away when auto-send is on, unless
  // something is already typed, in which case it is added for checking.
  function onTranscript(text: string, ms: number) {
    heardMs.current = ms;
    if (display.autoSend && !draft.trim()) submit(text, true);
    else setDraft((d) => (d ? `${d} ${text}` : text));
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

  function timingLine(item: { id: string; role: string; text_raw: string }) {
    const parts =
      item.role === 'assistant'
        ? [
            formatSeconds(perf.reply[item.id]) && `reply ${formatSeconds(perf.reply[item.id])}`,
            formatSeconds(perf.voice[item.text_raw]) && `voice ${formatSeconds(perf.voice[item.text_raw])}`,
          ]
        : [formatSeconds(perf.heard[item.id]) && `heard in ${formatSeconds(perf.heard[item.id])}`];
    const line = parts.filter(Boolean).join(' · ');
    return line ? `⏱ ${line}` : undefined;
  }

  const lastReply = messages.data?.filter((m) => m.role === 'assistant').at(-1);
  const goalMet = isReply(lastReply?.payload ?? null) && (lastReply!.payload as { goal_met: boolean }).goal_met;
  const limited = send.error instanceof ApiError && send.error.reason === 'daily_limit';

  // The list is inverted so it stays pinned to the newest message.
  const items: ChatMessage[] = [
    ...(messages.data ?? []),
    ...(pendingText ? [{ id: 'pending', role: 'user' as const, text_raw: pendingText, payload: null, created_at: '' }] : []),
    ...(streamingReply && !messages.data?.some((m) => m.id === streamingReply.id)
      ? [
          {
            id: streamingReply.id,
            role: 'assistant' as const,
            text_raw: streamingReply.hanzi,
            payload: { segments: [{ hanzi: streamingReply.hanzi, gloss: '', jyutping: '' }], english: '', goal_met: false },
            created_at: '',
          },
        ]
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
            ListHeaderComponent={send.isPending && !streamingReply ? <TypingBubble /> : null}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                timing={SHOW_TIMINGS ? timingLine(item) : undefined}
                onTapSegment={item.id === 'pending' || item.id === streamingReply?.id || readOnly ? undefined : onTapSegment}
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
              placeholder={listening ? 'Listening…' : 'Reply any way you can'}
              placeholderTextColor={colors.muted}
              multiline
              editable={!limited && !turnCapped}
            />
            {!!draft.trim() && (
              <Pressable
                style={[styles.sendButton, send.isPending && styles.sendDisabled]}
                disabled={send.isPending}
                onPress={() => submit()}>
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            )}
            {/* Always mounted so the mic stays ready; hidden while there's typed text. */}
            <MicButton
              hidden={!!draft.trim()}
              disabled={send.isPending || limited || turnCapped}
              onTranscript={onTranscript}
              onListeningChange={setListening}
            />
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
