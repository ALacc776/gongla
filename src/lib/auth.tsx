import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthState = {
  userId: string | null;
  error: string | null;
};

const AuthContext = createContext<AuthState>({ userId: null, error: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, error: null });

  useEffect(() => {
    let cancelled = false;

    async function ensureSession() {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!cancelled) setState({ userId: existing.session.user.id, error: null });
        return;
      }
      const { data, error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error || !data.user) {
        setState({ userId: null, error: error?.message ?? 'Anonymous sign-in failed' });
      } else {
        setState({ userId: data.user.id, error: null });
      }
    }

    ensureSession();

    // Keeps userId current after sign-out (account deletion) and a new anonymous sign-in.
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setState({ userId: session.user.id, error: null });
    });

    // Only refresh tokens while the app is in the foreground.
    const appStateSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();

    return () => {
      cancelled = true;
      appStateSub.remove();
      authSub.subscription.unsubscribe();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
