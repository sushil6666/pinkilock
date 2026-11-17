/** An in-memory session store, for tests that need one without a live backend. */
import type { SessionStorage } from '../../src/services/supabase/supabaseBackend';

export function memoryStorage(): SessionStorage & { dump(): Map<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
    dump: () => m,
  };
}
