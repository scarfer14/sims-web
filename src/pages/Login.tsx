import { useState } from 'react';
import type { Backend } from '../lib/api';
import type { Me } from '../lib/types';
import { Field } from '../ui';

export default function Login({ backend, onSignedIn, onBack }: { backend: Backend; onSignedIn: (m: Me) => void; onBack: () => void }) {
  const [login, setLogin] = useState(backend.mode === 'demo' ? 'EMP-0001' : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await backend.signIn(login, password));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 className="serif">Terminal Sign In</h1>
        <p className="sub">Access the inventory management system for SIMS staff</p>
        {error && <div className="err" role="alert">{error}</div>}
        <Field label="Employee ID or email">
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 12 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Authorize & Connect'}
        </button>
        <button type="button" className="btn link" style={{ color: '#f0d6d2', width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={onBack}>
          ← Back to home
        </button>
        {backend.mode === 'demo' && (
          <div className="notice">
            <b>Demo mode.</b> Sign in as <b>EMP-0001</b> with password <b>sims123</b>. EMP-0002 is a deactivated
            account (it will be refused). Data is stored in this browser only.
          </div>
        )}
      </form>
    </div>
  );
}
