// One small interface, two backends:
//  - "supabase": used when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
//  - "demo":     a PostgreSQL database inside the browser (no setup needed)
// Both run the same SQL functions from db/core.sql.
import type { Me } from './types';

export interface Backend {
  mode: 'supabase' | 'demo';
  restore(): Promise<Me | null>;
  signIn(login: string, password: string): Promise<Me>;
  signOut(): Promise<void>;
  call<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
  resetDemo?(): Promise<void>;
}

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const MODE: Backend['mode'] = URL_ && KEY ? 'supabase' : 'demo';

async function supabaseBackend(): Promise<Backend> {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(URL_!, KEY!);
  const call = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  };
  return {
    mode: 'supabase',
    async restore() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      try {
        return await call<Me>('whoami');
      } catch {
        await sb.auth.signOut();
        return null;
      }
    },
    async signIn(login, password) {
      let email = login.trim();
      if (!email.includes('@')) {
        const found = await call<string | null>('login_email', { p_employee_id: email });
        if (!found) throw new Error('Wrong Employee ID or password.');
        email = found;
      }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong Employee ID or password.' : error.message);
      try {
        return await call<Me>('whoami');
      } catch (e) {
        await sb.auth.signOut();
        throw e;
      }
    },
    async signOut() {
      await sb.auth.signOut();
    },
    call,
  };
}

const SESSION_KEY = 'sims-demo-session';
const store = {
  get: () => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } },
  set: (v: string | null) => { try { v ? localStorage.setItem(SESSION_KEY, v) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } },
};

async function demoBackend(): Promise<Backend> {
  const [{ PGlite }, local] = await Promise.all([import('@electric-sql/pglite'), import('./localdb')]);
  let db;
  try {
    db = await PGlite.create('idb://sims-demo'); // saved in this browser
  } catch {
    db = await PGlite.create(); // private window etc.: in memory only
  }
  await local.bootstrap(db);
  const call = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const r = await local.callFn<T>(db, fn, args);
    if (fn === 'save_user') await local.linkUnlinkedUsers(db);
    return r;
  };
  return {
    mode: 'demo',
    async restore() {
      const id = store.get();
      if (!id) return null;
      await local.setSessionUser(db, id);
      try {
        return await call<Me>('whoami');
      } catch {
        store.set(null);
        await local.setSessionUser(db, null);
        return null;
      }
    },
    async signIn(login, password) {
      const authId = await local.demoLogin(db, login, password);
      await local.setSessionUser(db, authId);
      store.set(authId);
      return call<Me>('whoami');
    },
    async signOut() {
      store.set(null);
      await local.setSessionUser(db, null);
    },
    call,
    async resetDemo() {
      await local.bootstrap(db, true);
    },
  };
}

let backendPromise: Promise<Backend> | null = null;
export function getBackend(): Promise<Backend> {
  backendPromise ??= MODE === 'supabase' ? supabaseBackend() : demoBackend();
  return backendPromise;
}
