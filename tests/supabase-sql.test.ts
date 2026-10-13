// Runs the generated supabase/setup.sql in a Supabase-like database (stubbed auth schema + roles).
import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

it('supabase/setup.sql installs, links auth users, and works end to end', async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    insert into auth.users (id, email) values ('b0000000-0000-4000-8000-000000000001', 'Existing@Store.ph');`);
  const sql = readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // running it twice must be safe
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('b0000000-0000-4000-8000-000000000002', 'juan@store.ph', '{"name":"Juan Tamad","employee_id":"emp-0001"}')`);
  const users = (await db.query<any>(`select employee_id, name, email from app_users where auth_id is not null order by email`)).rows;
  expect(users).toEqual([
    { employee_id: 'EMP-1001', name: 'Existing', email: 'existing@store.ph' },
    { employee_id: 'EMP-0001', name: 'Juan Tamad', email: 'juan@store.ph' },
  ]);
  expect((await db.query<any>(`select login_email('emp-0001') as e`)).rows[0].e).toBe('juan@store.ph');
  await db.query(`select set_config('app.uid', 'b0000000-0000-4000-8000-000000000002', false)`);
  const st = (await db.query<any>(`select get_state() as s`)).rows[0].s;
  expect(st.products.length).toBe(5);
  expect(st.me.name).toBe('Juan Tamad');
  const sale = (await db.query<any>(`select create_sale('CASH', '[{"product_id":"20000000-0000-4000-8000-000000000003","quantity":2}]'::jsonb) as r`)).rows[0].r;
  expect(Number(sale.total_amount)).toBe(250);
  // anon cannot read tables directly
  const priv = (await db.query<any>(`select has_table_privilege('anon','products','select') a, has_function_privilege('anon','get_state()','execute') b, has_function_privilege('authenticated','get_state()','execute') c`)).rows[0];
  expect(priv).toEqual({ a: false, b: false, c: true });
});
