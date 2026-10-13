-- Demo-mode only (browser database). Two staff accounts; password: sims123
insert into app_users (user_id, auth_id, employee_id, name, email, is_active) values
  ('00000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000101', 'EMP-0001', 'Juan Tamad',   'juan@sims.local',  true),
  ('00000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000102', 'EMP-0002', 'Maria Santos', 'maria@sims.local', false)
on conflict do nothing;
