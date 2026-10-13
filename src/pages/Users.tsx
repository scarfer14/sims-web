import { useState } from 'react';
import type { AppUser } from '../lib/types';
import { Field, Modal, useApp } from '../ui';

export default function Users() {
  const { state, run, backend } = useApp();
  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);
  const people = state.users.filter((u) => u.employee_id !== 'SYS-0000');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Users</h1>
          <p>Users are deactivated, never deleted, so the stock log always shows who did what</p>
        </div>
        {backend.mode === 'demo' && <button className="btn" onClick={() => setEditing('new')}>+ Add user</button>}
      </div>
      <div className="card">
        {backend.mode === 'supabase' && (
          <p className="small muted" style={{ marginTop: 0 }}>
            To add a staff member, create them in Supabase → Authentication → Users (“Add user”). They appear here
            automatically with a new Employee ID, which you can change with Edit.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee ID</th><th>Name</th><th>Email</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {people.map((u) => (
                <tr key={u.user_id}>
                  <td><b>{u.employee_id}</b></td>
                  <td>{u.name}{u.user_id === state.me.user_id && <span className="muted small"> (you)</span>}</td>
                  <td className="muted">{u.email ?? '—'}</td>
                  <td>{u.is_active ? <span className="badge green">Active</span> : <span className="badge gray">Inactive</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => setEditing(u)}>Edit</button>{' '}
                    <button className="btn sm link" disabled={u.user_id === state.me.user_id}
                      onClick={() => run('set_user_active', { p_id: u.user_id, p_active: !u.is_active }, u.is_active ? 'User deactivated.' : 'User activated.')}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {backend.mode === 'demo' && <p className="small muted">Demo mode: every account signs in with the password <b>sims123</b>.</p>}
      </div>
      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserForm({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const { run, backend } = useApp();
  const [name, setName] = useState(user?.name ?? '');
  const [emp, setEmp] = useState(user?.employee_id ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('save_user', { p_id: user?.user_id ?? null, p_name: name, p_employee_id: emp, p_email: email }, user ? 'User updated.' : 'User added.')) onClose();
  };
  return (
    <Modal title={user ? 'Edit user' : 'Add user'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <div className="form-grid">
          <Field label="Employee ID"><input className="input" value={emp} onChange={(e) => setEmp(e.target.value)} required placeholder="EMP-0003" /></Field>
          <Field label="Email" hint={backend.mode === 'supabase' ? 'Must match their Supabase login email' : undefined}>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={backend.mode === 'supabase' && !!user} />
          </Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn">Save</button>
        </div>
      </form>
    </Modal>
  );
}
