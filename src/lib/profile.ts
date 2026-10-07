import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type DisplayPrefs = {
  hanzi: boolean;
  jyutping: boolean;
  english: boolean;
  tone_colors?: boolean;
  autoplay?: boolean;
  auto_send?: boolean;
  onboarded?: boolean;
};

export type Profile = {
  id: string;
  level: number;
  display_prefs: DisplayPrefs;
  voice: string;
  speech_rate: number;
  plan: 'free' | 'pro';
  memory: { facts: string[] };
};

export const PROFILE_KEY = ['profile'];

export function useProfile() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: PROFILE_KEY,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, level, display_prefs, voice, speech_rate, plan, memory')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export async function updateProfile(userId: string, values: Partial<Omit<Profile, 'id' | 'plan'>>) {
  const { error } = await supabase.from('profiles').update(values).eq('id', userId);
  if (error) throw error;
}
