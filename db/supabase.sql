-- ---------- Supabase-only setup ----------------------------------------
-- 1) Lock the tables: the browser can't read/write them directly.
--    All access goes through the functions above (SECURITY DEFINER),
--    which check that the caller is a signed-in, active SIMS user.
alter table app_users            enable row level security;
alter table categories           enable row level security;
alter table products             enable row level security;
alter table inventories          enable row level security;
alter table stock_movements      enable row level security;
alter table suppliers            enable row level security;
alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;
alter table sales                enable row level security;
alter table sale_items           enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  whoami(), get_state(),
  save_category(uuid, text, text), delete_category(uuid),
  save_product(uuid, uuid, text, text, text, text, text, numeric, numeric, int, int), delete_product(uuid),
  record_movement(uuid, text, int, text),
  save_supplier(uuid, text, text, text, text, text), set_supplier_active(uuid, boolean),
  create_purchase_order(uuid, jsonb), update_purchase_order(uuid, jsonb),
  receive_purchase_order(uuid), cancel_purchase_order(uuid),
  create_sale(text, jsonb),
  save_user(uuid, text, text, text), set_user_active(uuid, boolean),
  ean13_valid(text)
to authenticated;

-- The login page may look up an email from an Employee ID before signing in.
grant execute on function login_email(text) to anon, authenticated;

-- 2) Every Supabase Auth user automatically gets a SIMS account.
--    Optional user metadata: {"name": "Juan Tamad", "employee_id": "EMP-0001"}
create sequence if not exists app_employee_seq start 1001;

create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users (auth_id, email, name, employee_id)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(upper(new.raw_user_meta_data->>'employee_id'), ''), 'EMP-' || nextval('app_employee_seq'))
  )
  on conflict (email) do update set auth_id = excluded.auth_id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- 3) Link any Auth users that already existed before this script ran.
insert into app_users (auth_id, email, name, employee_id)
select u.id, lower(u.email), split_part(u.email, '@', 1), 'EMP-' || nextval('app_employee_seq')
  from auth.users u
 where not exists (select 1 from app_users a where a.auth_id = u.id)
on conflict (email) do update set auth_id = excluded.auth_id;
