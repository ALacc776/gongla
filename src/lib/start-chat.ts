import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { endSession, startSession } from '@/lib/api';
import { useVoiceSettings } from '@/lib/audio';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { SESSION_COLUMNS, type SessionRow } from '@/lib/types';

export const OPEN_SESSION_KEY = ['sessions', 'open'];

// The unfinished chat, if any (F18 "Continue" card).
export function useOpenSession() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: OPEN_SESSION_KEY,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as unknown as SessionRow | undefined) ?? null;
    },
  });
}

// Starts a scenario. If a chat is unfinished, asks to end it first (F18).
export function useStartChat() {
  const queryClient = useQueryClient();
  const open = useOpenSession();
  const { rate } = useVoiceSettings();

  const mutation = useMutation({
    mutationFn: async (scenarioId: string) => {
      if (open.data) await endSession(open.data.id);
      return startSession(scenarioId, rate);
    },
    onSuccess: ({ session_id }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.push({ pathname: '/chat', params: { sessionId: session_id } });
    },
  });

  function start(scenarioId: string) {
    if (mutation.isPending) return;
    if (open.data) {
      Alert.alert('End the current chat?', 'You have an unfinished chat. Starting a new one ends it.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End and start', onPress: () => mutation.mutate(scenarioId) },
      ]);
    } else {
      mutation.mutate(scenarioId);
    }
  }

  return { start, ...mutation };
}
