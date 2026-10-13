// Demo mode: a real PostgreSQL database (PGlite) running inside the browser.
// It runs the exact same SQL rules as the Supabase version.
import type { PGlite } from '@electric-sql/pglite';
import coreSql from '../../db/core.sql?raw';
import seedSql from '../../db/seed.sql?raw';
import demoSql from '../../db/demo.sql?raw';

export const SCHEMA_VERSION = '1';
export const DEMO_PASSWORD = 'sims123';

// Supabase provides auth.uid(); in the browser we fake it with a session setting.
const AUTH_STUB = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.uid', true), '')::uuid $$;
`;

export async function bootstrap(db: PGlite, force = false): Promise<void> {
  if (!force) {
    const t = await db.query<{ t: string | null }>(`select to_regclass('public.sims_meta')::text as t`);
    if (t.rows[0]?.t) {
      const v = await db.query<{ value: string }>(`select value from public.sims_meta where key = 'version'`);
      if (v.rows[0]?.value === SCHEMA_VERSION) return;
    }
  }
  await db.exec(`drop schema if exists public cascade; create schema public;`);
  await db.exec(AUTH_STUB);
  await db.exec(coreSql);
  await db.exec(seedSql);
  await db.exec(demoSql);
  await db.exec(`create table sims_meta (key text primary key, value text);
                 insert into sims_meta values ('version', '${SCHEMA_VERSION}');`);
}

export async function setSessionUser(db: PGlite, authId: string | null) {
  await db.query(`select set_config('app.uid', $1, false)`, [authId ?? '']);
}

/** Calls an SQL function with named arguments, e.g. callFn(db, 'create_sale', {p_payment_method: 'CASH', ...}) */
export async function callFn<T = unknown>(db: PGlite, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error('Bad function name');
  const keys = Object.keys(args);
  for (const k of keys) if (!/^p_[a-z0-9_]+$/.test(k)) throw new Error('Bad argument name');
  const params = keys.map((k) => {
    const v = args[k];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  const res = await db.query<{ r: T }>(sql, params);
  return res.rows[0]?.r as T;
}

/** Demo login: Employee ID (or email) + the shared demo password. Returns the auth id. */
export async function demoLogin(db: PGlite, login: string, password: string): Promise<string> {
  const res = await db.query<{ auth_id: string | null; is_active: boolean; name: string }>(
    `select auth_id, is_active, name from app_users
      where upper(employee_id) = upper($1) or lower(email) = lower($1) limit 1`,
    [login.trim()],
  );
  const u = res.rows[0];
  if (!u || !u.auth_id || password !== DEMO_PASSWORD) throw new Error('Wrong Employee ID or password.');
  if (!u.is_active) throw new Error(`${u.name}'s account is deactivated.`);
  return u.auth_id;
}

/** New users created in demo mode get a login automatically. */
export async function linkUnlinkedUsers(db: PGlite) {
  await db.exec(`update app_users set auth_id = gen_random_uuid()
                  where auth_id is null and employee_id <> 'SYS-0000'`);
}
