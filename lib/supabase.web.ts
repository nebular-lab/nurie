// Web では localStorage に refresh token を寄せる。SSR (= static rendering) 時は
// window が無いので null/no-op で安全側に倒す。

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY が .env に設定されていません',
  );
}

const webStorage = {
  getItem: async (k: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(k);
  },
  setItem: async (k: string, v: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(k, v);
  },
  removeItem: async (k: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(k);
  },
};

export const supabase = createClient(url, key, {
  auth: {
    storage: webStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
