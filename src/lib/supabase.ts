import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY in .env');
}

// SecureStore warns above ~2 KB per value and a Supabase session can be larger,
// so each value is split into chunks.
const CHUNK_SIZE = 1800;

const chunkedSecureStorage = {
  async getItem(name: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${name}.count`);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${name}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(name: string, value: string): Promise<void> {
    await chunkedSecureStorage.removeItem(name);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${name}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${name}.count`, String(count));
  },
  async removeItem(name: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${name}.count`);
    if (count !== null) {
      for (let i = 0; i < Number(count); i++) {
        await SecureStore.deleteItemAsync(`${name}.${i}`);
      }
      await SecureStore.deleteItemAsync(`${name}.count`);
    }
  },
};

export const supabase = createClient(url, key, {
  auth: {
    storage: chunkedSecureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
