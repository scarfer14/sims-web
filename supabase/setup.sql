-- SIMS: paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Generated from db/core.sql + db/seed.sql + db/supabase.sql (npm run build:sql).

-- =====================================================================
-- SIMS: The Supermarket Inventory Management System by FORZA
-- Core schema + business rules (portable PostgreSQL).
-- Every change to stock goes through ONE function (_apply_movement), so
-- the on-hand balance and the movement log always change together.
-- =====================================================================

-- ---------- Tables (the ten entities from the ERD) -------------------

create table if not exists app_users (
  user_id      uuid primary key default gen_random_uuid(),
  auth_id      uuid unique,                -- links to Supabase Auth (null for seed/system)
  employee_id  text not null unique,
  name         text not null,
  email        text unique,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists categories (
  category_id   uuid primary key default gen_random_uuid(),
  category_name text not null unique,
  description   text
);

create table if not exists products (
  product_id       uuid primary key default gen_random_uuid(),
  category_id      uuid not null references categories(category_id),
  sku              text not null unique,
  barcode          text unique,
  product_name     text not null,
  description      text,
  unit_measurement text not null default 'PCS' check (unit_measurement in ('PCS','KG','L')),
  cost_price       numeric(12,2) not null check (cost_price >= 0),
  selling_price    numeric(12,2) not null check (selling_price >= 0),
  reorder_level    integer not null default 0 check (reorder_level >= 0),
  created_at       timestamptz not null default now()
);

create table if not exists inventories (
  inventory_id     uuid primary key default gen_random_uuid(),
  product_id       uuid not null unique references products(product_id) on delete cascade,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0)
);

create table if not exists stock_movements (
  stock_movement_id uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(product_id),
  performed_by      uuid not null references app_users(user_id),
  movement_type     text not null check (movement_type in
                      ('stock_in','stock_out','sale','return','damage','expired','adjustment')),
  quantity_delta    integer not null check (quantity_delta <> 0),
  reason            text,
  created_at        timestamptz not null default now()
);

create table if not exists suppliers (
  supplier_id   uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  is_active     boolean not null default true
);

create table if not exists purchase_orders (
  purchase_order_id uuid primary key default gen_random_uuid(),
  supplier_id       uuid not null references suppliers(supplier_id),
  ordered_by        uuid not null references app_users(user_id),
  order_date        timestamptz not null default now(),
  status            text not null default 'PENDING' check (status in ('PENDING','RECEIVED','CANCELLED')),
  total_amount      numeric(12,2) not null default 0
);

create table if not exists purchase_order_items (
  purchase_order_item_id uuid primary key default gen_random_uuid(),
  purchase_order_id      uuid not null references purchase_orders(purchase_order_id) on delete cascade,
  product_id             uuid not null references products(product_id),
  quantity               integer not null check (quantity > 0),
  unit_cost              numeric(12,2) not null check (unit_cost >= 0),
  total_price            numeric(12,2) not null
);

create table if not exists sales (
  sale_id        uuid primary key default gen_random_uuid(),
  sold_by        uuid not null references app_users(user_id),
  sale_date      timestamptz not null default now(),
  total_amount   numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('CASH','CARD','E-WALLET'))
);

create table if not exists sale_items (
  sale_item_id uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references sales(sale_id) on delete cascade,
  product_id   uuid not null references products(product_id),
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(12,2) not null,
  total_price  numeric(12,2) not null
);

create index if not exists idx_movements_product on stock_movements(product_id);
create index if not exists idx_movements_created on stock_movements(created_at desc);

-- ---------- Helpers ---------------------------------------------------

-- The signed-in, active SIMS user (refuses inactive users).
create or replace function _actor() returns app_users
language plpgsql stable security definer set search_path = public as $$
declare u app_users;
begin
  select * into u from app_users where auth_id = auth.uid();
  if not found then
    raise exception 'You are not signed in, or this login has no SIMS account.';
  end if;
  if not u.is_active then
    raise exception 'User % is inactive and cannot make changes.', u.name;
  end if;
  return u;
end $$;

-- EAN-13 checksum: alternate weights 1 and 3, compare with the 13th digit.
create or replace function ean13_valid(p_code text) returns boolean
language plpgsql immutable as $$
declare total int := 0; i int;
begin
  if p_code is null or p_code !~ '^[0-9]{13}$' then return false; end if;
  for i in 1..12 loop
    total := total + substr(p_code, i, 1)::int * (case when i % 2 = 1 then 1 else 3 end);
  end loop;
  return (10 - total % 10) % 10 = substr(p_code, 13, 1)::int;
end $$;

-- SKU in the form SMS-XXXXXXXX
create or replace function _new_sku() returns text
language plpgsql volatile as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text := 'SMS-'; i int;
begin
  for i in 1..8 loop
    s := s || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return s;
end $$;

-- THE single place where stock changes. Balance + log in one transaction.
create or replace function _apply_movement(
  p_product_id uuid, p_type text, p_delta int, p_reason text, p_user_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare on_hand int; pname text; mid uuid;
begin
  if p_type not in ('stock_in','stock_out','sale','return','damage','expired','adjustment') then
    raise exception 'Unknown movement type: %', p_type;
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Quantity must not be zero.';
  end if;
  if not exists (select 1 from app_users where user_id = p_user_id and is_active) then
    raise exception 'Movements can only be recorded by an active user.';
  end if;

  select i.quantity_on_hand, p.product_name into on_hand, pname
    from inventories i join products p using (product_id)
   where i.product_id = p_product_id
   for update of i;
  if not found then
    raise exception 'Product not found.';
  end if;
  if on_hand + p_delta < 0 then
    raise exception 'Insufficient stock for %: % on hand, % requested.', pname, on_hand, -p_delta;
  end if;

  update inventories set quantity_on_hand = quantity_on_hand + p_delta where product_id = p_product_id;
  insert into stock_movements (product_id, performed_by, movement_type, quantity_delta, reason)
  values (p_product_id, p_user_id, p_type, p_delta, nullif(trim(coalesce(p_reason,'')), ''))
  returning stock_movement_id into mid;
  return mid;
end $$;

-- ---------- Session ---------------------------------------------------

create or replace function whoami() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u app_users;
begin
  u := _actor();
  return jsonb_build_object('user_id', u.user_id, 'employee_id', u.employee_id,
                            'name', u.name, 'email', u.email);
end $$;

-- Lets the login page accept an Employee ID instead of an email.
create or replace function login_email(p_employee_id text) returns text
language sql stable security definer set search_path = public as $$
  select email from app_users where upper(employee_id) = upper(trim(p_employee_id)) and is_active limit 1;
$$;

-- ---------- Read everything the UI needs in one call ------------------

create or replace function get_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me app_users;
begin
  me := _actor();
  return jsonb_build_object(
    'me', jsonb_build_object('user_id', me.user_id, 'employee_id', me.employee_id, 'name', me.name, 'email', me.email),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.category_name) from categories c), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object(
               'quantity_on_hand', coalesce(i.quantity_on_hand, 0),
               'category_name', c.category_name,
               'has_movements', exists (select 1 from stock_movements m where m.product_id = p.product_id))
             order by p.product_name)
        from products p
        left join inventories i using (product_id)
        left join categories c using (category_id)), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(to_jsonb(s) order by s.supplier_name) from suppliers s), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'employee_id', u.employee_id,
                         'name', u.name, 'email', u.email, 'is_active', u.is_active, 'linked', u.auth_id is not null)
                       order by u.employee_id) from app_users u), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc) from (
        select to_jsonb(m) || jsonb_build_object('product_name', p.product_name, 'user_name', u.name) as x
          from stock_movements m
          join products p using (product_id)
          join app_users u on u.user_id = m.performed_by
         order by m.created_at desc
         limit 500) t), '[]'::jsonb),
    'purchase_orders', coalesce((
      select jsonb_agg(to_jsonb(po) || jsonb_build_object(
               'supplier_name', s.supplier_name,
               'ordered_by_name', u.name,
               'items', coalesce((select jsonb_agg(to_jsonb(it) || jsonb_build_object('product_name', p.product_name))
                                    from purchase_order_items it join products p using (product_id)
                                   where it.purchase_order_id = po.purchase_order_id), '[]'::jsonb))
             order by po.order_date desc)
        from purchase_orders po
        join suppliers s using (supplier_id)
        join app_users u on u.user_id = po.ordered_by), '[]'::jsonb),
    'sales', coalesce((
      select jsonb_agg(x order by x->>'sale_date' desc) from (
        select to_jsonb(sa) || jsonb_build_object(
                 'sold_by_name', u.name,
                 'items', coalesce((select jsonb_agg(to_jsonb(it) || jsonb_build_object('product_name', p.product_name))
                                      from sale_items it join products p using (product_id)
                                     where it.sale_id = sa.sale_id), '[]'::jsonb)) as x
          from sales sa join app_users u on u.user_id = sa.sold_by
         order by sa.sale_date desc
         limit 300) t), '[]'::jsonb)
  );
end $$;

-- ---------- Categories ------------------------------------------------

create or replace function save_category(p_id uuid, p_name text, p_description text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; rid uuid;
begin
  me := _actor();
  if coalesce(trim(p_name), '') = '' or length(trim(p_name)) > 100 then
    raise exception 'Category name is required (max 100 characters).';
  end if;
  begin
    if p_id is null then
      insert into categories (category_name, description) values (trim(p_name), nullif(trim(coalesce(p_description,'')), ''))
      returning category_id into rid;
    else
      update categories set category_name = trim(p_name), description = nullif(trim(coalesce(p_description,'')), '')
       where category_id = p_id returning category_id into rid;
      if rid is null then raise exception 'Category not found.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'A category named "%" already exists.', trim(p_name);
  end;
  return jsonb_build_object('category_id', rid);
end $$;

create or replace function delete_category(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users;
begin
  me := _actor();
  if exists (select 1 from products where category_id = p_id) then
    raise exception 'This category still has products. Move or delete them first.';
  end if;
  delete from categories where category_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Products --------------------------------------------------

create or replace function save_product(
  p_id uuid, p_category_id uuid, p_product_name text, p_description text,
  p_sku text, p_barcode text, p_unit text, p_cost_price numeric, p_selling_price numeric,
  p_reorder_level int, p_initial_qty int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; rid uuid; v_sku text; v_barcode text;
begin
  me := _actor();
  if coalesce(trim(p_product_name), '') = '' or length(trim(p_product_name)) > 150 then
    raise exception 'Product name is required (max 150 characters).';
  end if;
  if not exists (select 1 from categories where category_id = p_category_id) then
    raise exception 'Please choose an existing category.';
  end if;
  if p_unit not in ('PCS','KG','L') then
    raise exception 'Unit must be PCS, KG or L.';
  end if;
  if p_cost_price is null or p_cost_price < 0 or p_selling_price is null or p_selling_price < 0 then
    raise exception 'Prices must be zero or more.';
  end if;
  if p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Reorder level must be zero or more.';
  end if;
  v_barcode := nullif(trim(coalesce(p_barcode, '')), '');
  if v_barcode is not null and not ean13_valid(v_barcode) then
    raise exception 'Barcode % is not a valid EAN-13 code.', v_barcode;
  end if;
  v_sku := upper(nullif(trim(coalesce(p_sku, '')), ''));
  if v_sku is not null and length(v_sku) > 50 then
    raise exception 'SKU must be 50 characters or fewer.';
  end if;

  begin
    if p_id is null then
      insert into products (category_id, sku, barcode, product_name, description, unit_measurement,
                            cost_price, selling_price, reorder_level)
      values (p_category_id, coalesce(v_sku, _new_sku()), v_barcode, trim(p_product_name),
              nullif(trim(coalesce(p_description,'')), ''), p_unit,
              round(p_cost_price, 2), round(p_selling_price, 2), p_reorder_level)
      returning product_id into rid;
      insert into inventories (product_id, quantity_on_hand) values (rid, 0);
      if coalesce(p_initial_qty, 0) < 0 then
        raise exception 'Initial quantity cannot be negative.';
      elsif coalesce(p_initial_qty, 0) > 0 then
        perform _apply_movement(rid, 'stock_in', p_initial_qty, 'Initial stock', me.user_id);
      end if;
    else
      update products set category_id = p_category_id, sku = coalesce(v_sku, sku), barcode = v_barcode,
             product_name = trim(p_product_name), description = nullif(trim(coalesce(p_description,'')), ''),
             unit_measurement = p_unit, cost_price = round(p_cost_price, 2),
             selling_price = round(p_selling_price, 2), reorder_level = p_reorder_level
       where product_id = p_id returning product_id into rid;
      if rid is null then raise exception 'Product not found.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Another product already uses this SKU or barcode.';
  end;
  return jsonb_build_object('product_id', rid);
end $$;

create or replace function delete_product(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users;
begin
  me := _actor();
  if exists (select 1 from stock_movements where product_id = p_id) then
    raise exception 'This product has stock movements and cannot be deleted (the audit trail must stay complete).';
  end if;
  if exists (select 1 from purchase_order_items where product_id = p_id)
     or exists (select 1 from sale_items where product_id = p_id) then
    raise exception 'This product appears on a purchase order or sale and cannot be deleted.';
  end if;
  delete from products where product_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Stock movements -------------------------------------------

-- quantity is a positive number; the movement type decides the sign.
-- 'adjustment' takes a signed quantity (e.g. -2 after a recount).
create or replace function record_movement(
  p_product_id uuid, p_movement_type text, p_quantity int, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; delta int; mid uuid;
begin
  me := _actor();
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantity must not be zero.';
  end if;
  if p_movement_type = 'sale' then
    raise exception 'Sales are recorded from the Sales page.';
  elsif p_movement_type in ('stock_in','return') then
    if p_quantity < 0 then raise exception 'Quantity must be positive.'; end if;
    delta := p_quantity;
  elsif p_movement_type in ('stock_out','damage','expired') then
    if p_quantity < 0 then raise exception 'Quantity must be positive.'; end if;
    delta := -p_quantity;
  elsif p_movement_type = 'adjustment' then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Adjustments need a reason.';
    end if;
    delta := p_quantity;
  else
    raise exception 'Unknown movement type: %', p_movement_type;
  end if;
  mid := _apply_movement(p_product_id, p_movement_type, delta, p_reason, me.user_id);
  return jsonb_build_object('stock_movement_id', mid);
end $$;

-- ---------- Suppliers -------------------------------------------------

create or replace function save_supplier(
  p_id uuid, p_supplier_name text, p_contact_name text, p_email text, p_phone text, p_address text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; rid uuid;
begin
  me := _actor();
  if coalesce(trim(p_supplier_name), '') = '' then
    raise exception 'Supplier name is required.';
  end if;
  if coalesce(trim(p_email), '') <> '' and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Supplier email is not valid.';
  end if;
  if p_id is null then
    insert into suppliers (supplier_name, contact_name, email, phone, address)
    values (trim(p_supplier_name), nullif(trim(coalesce(p_contact_name,'')),''), nullif(trim(coalesce(p_email,'')),''),
            nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_address,'')),''))
    returning supplier_id into rid;
  else
    update suppliers set supplier_name = trim(p_supplier_name), contact_name = nullif(trim(coalesce(p_contact_name,'')),''),
           email = nullif(trim(coalesce(p_email,'')),''), phone = nullif(trim(coalesce(p_phone,'')),''),
           address = nullif(trim(coalesce(p_address,'')),'')
     where supplier_id = p_id returning supplier_id into rid;
    if rid is null then raise exception 'Supplier not found.'; end if;
  end if;
  return jsonb_build_object('supplier_id', rid);
end $$;

create or replace function set_supplier_active(p_id uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users;
begin
  me := _actor();
  update suppliers set is_active = p_active where supplier_id = p_id;
  if not found then raise exception 'Supplier not found.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Purchase orders -------------------------------------------

-- Replaces an order's lines and recomputes its total (used by create + update).
create or replace function _write_po_items(p_po_id uuid, p_items jsonb) returns numeric
language plpgsql security definer set search_path = public as $$
declare it jsonb; q int; c numeric; total numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase order needs at least one item.';
  end if;
  delete from purchase_order_items where purchase_order_id = p_po_id;
  for it in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from products where product_id = (it->>'product_id')::uuid) then
      raise exception 'Every line needs an existing product.';
    end if;
    q := (it->>'quantity')::int;
    c := round((it->>'unit_cost')::numeric, 2);
    if q is null or q <= 0 then raise exception 'Order quantities must be greater than zero.'; end if;
    if c is null or c < 0 then raise exception 'Unit costs must be zero or more.'; end if;
    insert into purchase_order_items (purchase_order_id, product_id, quantity, unit_cost, total_price)
    values (p_po_id, (it->>'product_id')::uuid, q, c, q * c);
    total := total + q * c;
  end loop;
  update purchase_orders set total_amount = total where purchase_order_id = p_po_id;
  return total;
end $$;

create or replace function create_purchase_order(p_supplier_id uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; rid uuid;
begin
  me := _actor();
  if not exists (select 1 from suppliers where supplier_id = p_supplier_id and is_active) then
    raise exception 'Purchase orders can only be placed with an active supplier.';
  end if;
  insert into purchase_orders (supplier_id, ordered_by) values (p_supplier_id, me.user_id)
  returning purchase_order_id into rid;
  perform _write_po_items(rid, p_items);
  return jsonb_build_object('purchase_order_id', rid);
end $$;

create or replace function update_purchase_order(p_id uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; st text;
begin
  me := _actor();
  select status into st from purchase_orders where purchase_order_id = p_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if st <> 'PENDING' then raise exception 'Only pending purchase orders can be edited.'; end if;
  perform _write_po_items(p_id, p_items);
  return jsonb_build_object('ok', true);
end $$;

create or replace function receive_purchase_order(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; st text; it record;
begin
  me := _actor();
  select status into st from purchase_orders where purchase_order_id = p_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if st <> 'PENDING' then raise exception 'Only pending purchase orders can be received.'; end if;
  for it in select * from purchase_order_items where purchase_order_id = p_id loop
    perform _apply_movement(it.product_id, 'stock_in', it.quantity,
                            'Received PO ' || left(p_id::text, 8), me.user_id);
  end loop;
  update purchase_orders set status = 'RECEIVED' where purchase_order_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function cancel_purchase_order(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; st text;
begin
  me := _actor();
  select status into st from purchase_orders where purchase_order_id = p_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if st <> 'PENDING' then raise exception 'Only pending purchase orders can be cancelled.'; end if;
  update purchase_orders set status = 'CANCELLED' where purchase_order_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Sales -----------------------------------------------------

-- Checks EVERY line before changing anything, so a sale that fails on its
-- last item leaves stock untouched.
create or replace function create_sale(p_payment_method text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; it record; sid uuid; total numeric := 0; on_hand int; pname text;
begin
  me := _actor();
  if p_payment_method not in ('CASH','CARD','E-WALLET') then
    raise exception 'Payment method must be CASH, CARD or E-WALLET.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item.';
  end if;

  -- 1) validate all lines (same product on two lines is summed)
  for it in
    select (e->>'product_id')::uuid as product_id, sum((e->>'quantity')::int) as qty, min((e->>'quantity')::int) as min_q
      from jsonb_array_elements(p_items) e group by 1
  loop
    if it.min_q is null or it.min_q <= 0 then
      raise exception 'Sale quantities must be greater than zero.';
    end if;
    select i.quantity_on_hand, p.product_name into on_hand, pname
      from inventories i join products p using (product_id)
     where i.product_id = it.product_id for update of i;
    if not found then raise exception 'A product on this sale no longer exists.'; end if;
    if on_hand < it.qty then
      raise exception 'Insufficient stock for %: % on hand, % requested.', pname, on_hand, it.qty;
    end if;
  end loop;

  -- 2) apply
  insert into sales (sold_by, payment_method) values (me.user_id, p_payment_method) returning sale_id into sid;
  for it in
    select (e->>'product_id')::uuid as product_id, (e->>'quantity')::int as qty, p.selling_price
      from jsonb_array_elements(p_items) e
      join products p on p.product_id = (e->>'product_id')::uuid
  loop
    insert into sale_items (sale_id, product_id, quantity, unit_price, total_price)
    values (sid, it.product_id, it.qty, it.selling_price, it.qty * it.selling_price);
    total := total + it.qty * it.selling_price;
    perform _apply_movement(it.product_id, 'sale', -it.qty, 'Sale ' || left(sid::text, 8), me.user_id);
  end loop;
  update sales set total_amount = total where sale_id = sid;
  return jsonb_build_object('sale_id', sid, 'total_amount', total);
end $$;

-- ---------- Users -----------------------------------------------------

create or replace function save_user(p_id uuid, p_name text, p_employee_id text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users; rid uuid;
begin
  me := _actor();
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_employee_id), '') = '' then
    raise exception 'Name and Employee ID are required.';
  end if;
  begin
    if p_id is null then
      insert into app_users (name, employee_id, email)
      values (trim(p_name), upper(trim(p_employee_id)), nullif(lower(trim(coalesce(p_email,''))), ''))
      returning user_id into rid;
    else
      update app_users set name = trim(p_name), employee_id = upper(trim(p_employee_id)),
             email = nullif(lower(trim(coalesce(p_email,''))), '')
       where user_id = p_id returning user_id into rid;
      if rid is null then raise exception 'User not found.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'That Employee ID or email is already in use.';
  end;
  return jsonb_build_object('user_id', rid);
end $$;

-- Users are deactivated, never deleted (their movements must stay traceable).
create or replace function set_user_active(p_id uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me app_users;
begin
  me := _actor();
  if p_id = me.user_id and not p_active then
    raise exception 'You cannot deactivate your own account.';
  end if;
  update app_users set is_active = p_active where user_id = p_id;
  if not found then raise exception 'User not found.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- SIMS sample data. Safe to run more than once (fixed IDs + ON CONFLICT).
-- With this data the low-stock report shows Rice 5 kg and Orange Juice 1 L,
-- and the stock value at cost is PHP 2,365.00 (same as the report).

insert into app_users (user_id, employee_id, name, email, is_active) values
  ('00000000-0000-4000-8000-000000000001', 'SYS-0000', 'System (seed data)', null, false)
on conflict do nothing;

insert into categories (category_id, category_name, description) values
  ('10000000-0000-4000-8000-000000000001', 'Grains & Rice', 'Rice, flour and other staples'),
  ('10000000-0000-4000-8000-000000000002', 'Beverages', 'Juices, water and soft drinks'),
  ('10000000-0000-4000-8000-000000000003', 'Dairy', 'Milk, cheese and eggs'),
  ('10000000-0000-4000-8000-000000000004', 'Canned Goods', 'Canned fish, meat and vegetables'),
  ('10000000-0000-4000-8000-000000000005', 'Personal Care', 'Soap, shampoo and toiletries')
on conflict do nothing;

insert into products (product_id, category_id, sku, barcode, product_name, description, unit_measurement, cost_price, selling_price, reorder_level) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'SMS-RICE0005', '4800123450012', 'Rice 5 kg',          'Well-milled white rice', 'KG',  250.00, 299.00, 5),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'SMS-OJ000001', '4800123450029', 'Orange Juice 1 L',   '100% orange juice',      'L',    85.00, 115.00, 6),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'SMS-MILK0001', '4800123450036', 'Whole Milk 1 L',     'Fresh whole milk',       'L',    95.00, 125.00, 5),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'SMS-SARD0155', '4800123450043', 'Sardines 155 g',     'Sardines in tomato sauce','PCS', 22.50,  29.00, 6),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'SMS-SOAP0135', '4800123450050', 'Bath Soap 135 g',    'Moisturizing bar soap',  'PCS',  46.00,  59.00, 4)
on conflict do nothing;

insert into inventories (product_id, quantity_on_hand) values
  ('20000000-0000-4000-8000-000000000001', 3),
  ('20000000-0000-4000-8000-000000000002', 2),
  ('20000000-0000-4000-8000-000000000003', 8),
  ('20000000-0000-4000-8000-000000000004', 10),
  ('20000000-0000-4000-8000-000000000005', 10)
on conflict do nothing;

insert into stock_movements (stock_movement_id, product_id, performed_by, movement_type, quantity_delta, reason, created_at) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'stock_in', 3,  'Opening stock', now() - interval '3 days'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'stock_in', 2,  'Opening stock', now() - interval '3 days'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'stock_in', 8,  'Opening stock', now() - interval '3 days'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'stock_in', 10, 'Opening stock', now() - interval '3 days'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'stock_in', 10, 'Opening stock', now() - interval '3 days')
on conflict do nothing;

insert into suppliers (supplier_id, supplier_name, contact_name, email, phone, address, is_active) values
  ('40000000-0000-4000-8000-000000000001', 'Luzon Grains Trading', 'Ramon Cruz',  'orders@luzongrains.example', '0917 555 0101', 'Quezon City',    true),
  ('40000000-0000-4000-8000-000000000002', 'FreshFarm Dairy Co.',  'Ana Reyes',   'sales@freshfarm.example',    '0918 555 0202', 'Batangas',       true),
  ('40000000-0000-4000-8000-000000000003', 'Old Harbor Canning',   'Leo Santos',  'info@oldharbor.example',     '0919 555 0303', 'Navotas',        false)
on conflict do nothing;

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
