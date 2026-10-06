import { useQueryClient } from '@tanstack/react-query';
import { router, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth';
import { useDisplayStore } from '@/lib/display-store';
import { PROFILE_KEY, updateProfile, useProfile, type Profile } from '@/lib/profile';

// Loads display settings from the profile once, saves later changes back, and
// sends first-time users to the level picker.
export function PrefsSync() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const segments = useSegments();
  const loaded = useRef(false);

  useEffect(() => {
    if (!profile || loaded.current) return;
    loaded.current = true;
    const p = profile.display_prefs ?? {};
    useDisplayStore.getState().set({
      hanzi: p.hanzi ?? true,
      jyutping: p.jyutping ?? true,
      english: p.english ?? profile.level < 3,
      autoplay: p.autoplay ?? false,
    });
  }, [profile]);

  useEffect(() => {
    if (profile && !profile.display_prefs?.onboarded && segments[0] !== 'welcome') {
      router.replace('/welcome');
    }
  }, [profile, segments]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useDisplayStore.subscribe((state, prev) => {
      if (!loaded.current) return;
      if (
        state.hanzi === prev.hanzi &&
        state.jyutping === prev.jyutping &&
        state.english === prev.english &&
        state.autoplay === prev.autoplay
      ) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        const current = queryClient.getQueryData<Profile>(PROFILE_KEY);
        updateProfile(userId, {
          display_prefs: {
            ...(current?.display_prefs ?? {}),
            hanzi: state.hanzi,
            jyutping: state.jyutping,
            english: state.english,
            autoplay: state.autoplay,
          },
        }).catch(() => {});
      }, 800);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, queryClient]);

  return null;
}
