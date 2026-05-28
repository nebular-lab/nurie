import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/shared/effect/supabase/supabase';

export type AuthSessionState =
  | { status: 'loading' }
  | { status: 'signed-in'; user: User }
  | { status: 'signed-out' }
  | { status: 'error'; message: string };

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    // 起動時に SecureStore に保存された refresh token から復元を試みる。
    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setState({ status: 'error', message: error.message });
        return;
      }
      setState(
        data.session
          ? { status: 'signed-in', user: data.session.user }
          : { status: 'signed-out' },
      );
    });

    // ログイン / ログアウト / トークン更新を購読。signInWithPassword 成功時もここに来る。
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState(
        session
          ? { status: 'signed-in', user: session.user }
          : { status: 'signed-out' },
      );
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
