import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { router, Stack, useLocalSearchParams } from 'expo-router';
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
import { Button, Icon, Toggle } from '@/components/ui';
import { ApiError, sendChat, tapGap } from '@/lib/api';
import { receiveClip, useSpeaker, useVoiceSettings, warmUpAudio } from '@/lib/audio';
import { routeInput } from '@/lib/btw';
import { useDisplayStore } from '@/lib/display-store';
import { formatSeconds, SHOW_TIMINGS, usePerfStore } from '@/lib/perf-store';
import { supabase } from '@/lib/supabase';
import { colors, hanzi, radius, type } from '@/lib/theme';
import { isReply, SESSION_COLUMNS, type ChatMessage, type SessionRow } from '@/lib/types';

const LAYERS = [
  { key: 'hanzi', label: '字' },
  { key: 'jyutping', label: 'jyut' },
  { key: 'english', label: 'EN' },
] as const;

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
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
      {
        text: 'End',
        style: 'destructive',
        onPress: () => router.replace({ pathname: '/summary', params: { sessionId } }),
      },
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
    ...(pendingText
      ? [{ id: 'pending', role: 'user' as const, text_raw: pendingText, payload: null, created_at: '' }]
      : []),
    ...(streamingReply && !messages.data?.some((m) => m.id === streamingReply.id)
      ? [
          {
            id: streamingReply.id,
            role: 'assistant' as const,
            text_raw: streamingReply.hanzi,
            payload: {
              segments: [{ hanzi: streamingReply.hanzi, gloss: '', jyutping: '' }],
              english: '',
              goal_met: false,
            },
            created_at: '',
          },
        ]
      : []),
  ].reverse();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: spec?.title ?? '',
          headerRight: readOnly
            ? undefined
            : () => (
                <Pressable onPress={endChat} hitSlop={10} accessibilityRole="button" style={styles.endButton}>
                  <Text style={styles.end}>End</Text>
                </Pressable>
              ),
        }}
      />
      {readOnly && <Text style={styles.subtitle}>Ended chat · read only</Text>}
      <View style={styles.toolbar}>
        {LAYERS.map(({ key, label }) => (
          <Toggle key={key} label={label} on={display[key]} onPress={() => display.toggle(key)} />
        ))}
        <View style={styles.flex} />
        <Toggle
          label="Slow"
          icon="tortoise.fill"
          on={display.slow}
          onPress={() => display.set({ slow: !display.slow })}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}>
        {messages.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator />
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
                onTapSegment={
                  item.id === 'pending' || item.id === streamingReply?.id || readOnly ? undefined : onTapSegment
                }
                onPlay={speak}
              />
            )}
          />
        )}

        {!readOnly && (goalMet || turnCapped) && (
          <Pressable
            style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
            onPress={() => router.replace({ pathname: '/summary', params: { sessionId } })}
            accessibilityRole="button">
            <Icon
              name={goalMet ? 'checkmark.seal.fill' : 'flag.checkered'}
              size={22}
              color={goalMet ? colors.success : colors.secondary}
            />
            <View style={styles.flex}>
              <Text style={styles.bannerTitle}>
                {goalMet ? 'Scene complete!' : 'This chat is at its length limit.'}
              </Text>
              <Text style={styles.bannerLink}>See your summary</Text>
            </View>
            <Icon name="chevron.right" size={13} weight="semibold" color={colors.tertiary} />
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
            <Button
              title="Questions you asked"
              variant="tinted"
              size="small"
              icon="questionmark.bubble"
              onPress={() => setAskOpen(true)}
            />
            <Button
              title="Summary"
              variant="tinted"
              size="small"
              icon="chart.bar.fill"
              onPress={() => router.push({ pathname: '/summary', params: { sessionId } })}
            />
          </View>
        ) : (
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Pressable
              style={({ pressed }) => [styles.askButton, pressed && styles.pressed]}
              onPress={() => setAskOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Ask a tutor">
              <View style={styles.askCircle}>
                <Icon name="questionmark" size={17} weight="semibold" />
              </View>
            </Pressable>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={listening ? 'Listening…' : 'Reply any way you can'}
                placeholderTextColor={colors.placeholder}
                multiline
                editable={!limited && !turnCapped}
              />
              {!!draft.trim() && (
                <Pressable
                  style={({ pressed }) => [styles.sendButton, (pressed || send.isPending) && styles.pressed]}
                  disabled={send.isPending}
                  onPress={() => submit()}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Send">
                  <Icon name="arrow.up.circle.fill" size={32} />
                </Pressable>
              )}
            </View>
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
  container: { flex: 1, backgroundColor: colors.plain },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  subtitle: { ...type.footnote, color: colors.secondary, textAlign: 'center', paddingBottom: 6 },
  endButton: { paddingHorizontal: 6 },
  end: { ...type.body, color: colors.accent },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.inset,
  },
  bannerTitle: { ...type.headline, color: colors.text },
  bannerLink: { ...type.subhead, color: colors.accent },
  error: { ...type.footnote, paddingHorizontal: 16, paddingBottom: 8, color: colors.destructive },
  readOnlyBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: colors.plain,
  },
  askButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  askCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.separator,
    backgroundColor: colors.plain,
  },
  input: {
    ...hanzi,
    flex: 1,
    maxHeight: 132,
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
    color: colors.text,
  },
  sendButton: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
});
