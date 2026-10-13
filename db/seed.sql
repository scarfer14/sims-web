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
