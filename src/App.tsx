import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackend, MODE, type Backend } from './lib/api';
import type { AppState, Me } from './lib/types';
import { AppCtx } from './ui';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import Sales from './pages/Sales';
import Movements from './pages/Movements';
import Users from './pages/Users';

const PAGES = {
  dashboard: { label: 'Dashboard', el: Dashboard },
  inventory: { label: 'Inventory', el: Inventory },
  suppliers: { label: 'Suppliers', el: Suppliers },
  sales: { label: 'Sales', el: Sales },
  movements: { label: 'Stock Log', el: Movements },
  users: { label: 'Users', el: Users },
} as const;
type PageKey = keyof typeof PAGES;

interface Toast { id: number; msg: string; error?: boolean }

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [bootError, setBootError] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<'landing' | 'login'>('landing');
  const [state, setState] = useState<AppState | null>(null);
  const [page, setPage] = useState<PageKey>(() => {
    const h = location.hash.slice(1);
    return (h in PAGES ? h : 'dashboard') as PageKey;
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menu, setMenu] = useState(false);
  const toastId = useRef(0);

  const toast = useCallback((msg: string, error?: boolean) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6000 : 3000);
  }, []);

  useEffect(() => {
    getBackend()
      .then(async (b) => {
        setBackend(b);
        const m = await b.restore();
        if (m) setMe(m);
      })
      .catch((e) => setBootError(String(e?.message ?? e)));
  }, []);

  const refresh = useCallback(async () => {
    if (!backend) return;
    try {
      setState(await backend.call<AppState>('get_state'));
    } catch (e: any) {
      toast(e.message, true);
      if (/not signed in|inactive/i.test(e.message)) {
        await backend.signOut();
        setMe(null);
        setState(null);
      }
    }
  }, [backend, toast]);

  useEffect(() => {
    if (me) refresh();
  }, [me, refresh]);

  useEffect(() => {
    location.hash = page;
  }, [page]);

  const run = useCallback(
    async (fn: string, args: Record<string, unknown>, success?: string) => {
      if (!backend) return false;
      try {
        await backend.call(fn, args);
        await refresh();
        if (success) toast(success);
        return true;
      } catch (e: any) {
        toast(e.message, true);
        await refresh();
        return false;
      }
    },
    [backend, refresh, toast],
  );

  const signOut = async () => {
    setMenu(false);
    await backend?.signOut();
    setMe(null);
    setState(null);
    setView('landing');
  };

  const resetDemo = async () => {
    setMenu(false);
    if (!backend?.resetDemo || !confirm('Reset all demo data back to the sample data?')) return;
    await backend.resetDemo();
    await signOut();
    toast('Demo data reset.');
  };

  const toastLayer = (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast' + (t.error ? ' error' : '')}>{t.msg}</div>
      ))}
    </div>
  );

  if (bootError) return <div className="loading">Could not start SIMS: {bootError}</div>;
  if (!backend) return <div className="loading">Loading SIMS…</div>;

  if (!me) {
    return (
      <>
        {view === 'landing' ? (
          <Landing onSignIn={() => setView('login')} />
        ) : (
          <Login backend={backend} onBack={() => setView('landing')} onSignedIn={(m) => { setMe(m); setPage('dashboard'); }} />
        )}
        {toastLayer}
      </>
    );
  }

  const Page = PAGES[page].el;
  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark">S</span>SIMS</div>
          <nav className="nav">
            {(Object.keys(PAGES) as PageKey[]).map((k) => (
              <button key={k} className={k === page ? 'active' : ''} onClick={() => setPage(k)}>{PAGES[k].label}</button>
            ))}
          </nav>
          <div className="user-menu">
            <button className="user-btn" onClick={() => setMenu((v) => !v)} aria-haspopup="menu">
              <span>{me.name}<small>{me.employee_id}</small></span> ▾
            </button>
            {menu && (
              <div className="dropdown" role="menu" onMouseLeave={() => setMenu(false)}>
                {MODE === 'demo' && <button onClick={resetDemo}>Reset demo data</button>}
                <button onClick={signOut}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="hero-band" />
      <main className="page">
        {state ? (
          <AppCtx.Provider value={{ state, backend, run, toast }}>
            <Page />
          </AppCtx.Provider>
        ) : (
          <div className="card empty">Loading data…</div>
        )}
      </main>
      {toastLayer}
    </>
  );
}
