import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { bootstrap, callFn, setSessionUser, demoLogin } from '../src/lib/localdb';
import { computeReports } from '../src/lib/reports';

let db: PGlite;
const RICE = '20000000-0000-4000-8000-000000000001';
const OJ = '20000000-0000-4000-8000-000000000002';
const MILK = '20000000-0000-4000-8000-000000000003';
const SUP_ACTIVE = '40000000-0000-4000-8000-000000000001';
const SUP_INACTIVE = '40000000-0000-4000-8000-000000000003';
const CAT = '10000000-0000-4000-8000-000000000001';

const state = () => callFn<any>(db, 'get_state');
const onHand = async (id: string) => (await state()).products.find((p: any) => p.product_id === id).quantity_on_hand;

beforeAll(async () => {
  db = new PGlite();
  await bootstrap(db);
  await setSessionUser(db, await demoLogin(db, 'EMP-0001', 'sims123'));
});

describe('login', () => {
  it('refuses wrong password and inactive user', async () => {
    await expect(demoLogin(db, 'EMP-0001', 'nope')).rejects.toThrow(/Wrong/);
    await expect(demoLogin(db, 'EMP-0002', 'sims123')).rejects.toThrow(/deactivated/);
  });
  it('refuses calls when not signed in', async () => {
    await setSessionUser(db, null);
    await expect(state()).rejects.toThrow(/not signed in/);
    await setSessionUser(db, await demoLogin(db, 'emp-0001', 'sims123'));
  });
});

describe('seed reports (match the paper)', () => {
  it('low stock = Rice 5 kg + Orange Juice 1 L, value PHP 2,365.00', async () => {
    const r = computeReports(await state());
    expect(r.lowStock.map((p) => p.product_name).sort()).toEqual(['Orange Juice 1 L', 'Rice 5 kg']);
    expect(r.stockValueCost).toBe('2365.00');
  });
});

describe('products', () => {
  it('generates SKU, validates EAN-13, rejects duplicates and negative prices', async () => {
    const r = await callFn<any>(db, 'save_product', { p_id: null, p_category_id: CAT, p_product_name: 'Flour 1 kg', p_description: '', p_sku: '', p_barcode: '4006381333931', p_unit: 'KG', p_cost_price: 40.5, p_selling_price: 55, p_reorder_level: 2, p_initial_qty: 4 });
    const p = (await state()).products.find((x: any) => x.product_id === r.product_id);
    expect(p.sku).toMatch(/^SMS-[A-Z0-9]{8}$/);
    expect(p.quantity_on_hand).toBe(4);
    await expect(callFn(db, 'save_product', { p_id: null, p_category_id: CAT, p_product_name: 'X', p_description: '', p_sku: '', p_barcode: '4006381333932', p_unit: 'PCS', p_cost_price: 1, p_selling_price: 1, p_reorder_level: 0, p_initial_qty: 0 })).rejects.toThrow(/EAN-13/);
    await expect(callFn(db, 'save_product', { p_id: null, p_category_id: CAT, p_product_name: 'X', p_description: '', p_sku: p.sku, p_barcode: '', p_unit: 'PCS', p_cost_price: 1, p_selling_price: 1, p_reorder_level: 0, p_initial_qty: 0 })).rejects.toThrow(/already uses/);
    await expect(callFn(db, 'save_product', { p_id: null, p_category_id: CAT, p_product_name: 'X', p_description: '', p_sku: '', p_barcode: '', p_unit: 'PCS', p_cost_price: -1, p_selling_price: 1, p_reorder_level: 0, p_initial_qty: 0 })).rejects.toThrow(/Prices/);
  });
  it('cannot delete a product with movements, can delete one without', async () => {
    await expect(callFn(db, 'delete_product', { p_id: RICE })).rejects.toThrow(/cannot be deleted/);
    const r = await callFn<any>(db, 'save_product', { p_id: null, p_category_id: CAT, p_product_name: 'Temp', p_description: '', p_sku: '', p_barcode: '', p_unit: 'PCS', p_cost_price: 1, p_selling_price: 2, p_reorder_level: 0, p_initial_qty: 0 });
    await callFn(db, 'delete_product', { p_id: r.product_id });
    expect((await state()).products.find((x: any) => x.product_id === r.product_id)).toBeUndefined();
  });
});

describe('stock movements', () => {
  it('updates balance and log together; refuses negative stock and zero qty', async () => {
    const before = (await state()).movements.length;
    await callFn(db, 'record_movement', { p_product_id: MILK, p_movement_type: 'damage', p_quantity: 1, p_reason: 'Leaking' });
    expect(await onHand(MILK)).toBe(7);
    expect((await state()).movements.length).toBe(before + 1);
    await expect(callFn(db, 'record_movement', { p_product_id: MILK, p_movement_type: 'stock_out', p_quantity: 99, p_reason: '' })).rejects.toThrow(/Insufficient stock/);
    await expect(callFn(db, 'record_movement', { p_product_id: MILK, p_movement_type: 'stock_in', p_quantity: 0, p_reason: '' })).rejects.toThrow(/zero/);
    expect(await onHand(MILK)).toBe(7);
  });
  it('adjustment is signed and needs a reason', async () => {
    await expect(callFn(db, 'record_movement', { p_product_id: MILK, p_movement_type: 'adjustment', p_quantity: -2, p_reason: '' })).rejects.toThrow(/reason/);
    await callFn(db, 'record_movement', { p_product_id: MILK, p_movement_type: 'adjustment', p_quantity: -2, p_reason: 'Recount' });
    expect(await onHand(MILK)).toBe(5);
  });
  it('on hand equals the sum of movements for every product', async () => {
    const s = await state();
    for (const p of s.products) {
      const sum = s.movements.filter((m: any) => m.product_id === p.product_id).reduce((a: number, m: any) => a + m.quantity_delta, 0);
      expect(sum).toBe(p.quantity_on_hand);
    }
  });
});

describe('purchase orders', () => {
  it('refuses inactive suppliers; receive adds stock; non-pending cannot change', async () => {
    await expect(callFn(db, 'create_purchase_order', { p_supplier_id: SUP_INACTIVE, p_items: [{ product_id: RICE, quantity: 1, unit_cost: 1 }] })).rejects.toThrow(/active supplier/);
    const po = await callFn<any>(db, 'create_purchase_order', { p_supplier_id: SUP_ACTIVE, p_items: [{ product_id: RICE, quantity: 10, unit_cost: 245.1 }] });
    await callFn(db, 'update_purchase_order', { p_id: po.purchase_order_id, p_items: [{ product_id: RICE, quantity: 10, unit_cost: 245.1 }, { product_id: OJ, quantity: 3, unit_cost: 80.05 }] });
    let p = (await state()).purchase_orders.find((x: any) => x.purchase_order_id === po.purchase_order_id);
    expect(Number(p.total_amount)).toBeCloseTo(2691.15, 2);
    const rice = await onHand(RICE);
    await callFn(db, 'receive_purchase_order', { p_id: po.purchase_order_id });
    expect(await onHand(RICE)).toBe(rice + 10);
    await expect(callFn(db, 'cancel_purchase_order', { p_id: po.purchase_order_id })).rejects.toThrow(/Only pending/);
    await expect(callFn(db, 'update_purchase_order', { p_id: po.purchase_order_id, p_items: [{ product_id: RICE, quantity: 1, unit_cost: 1 }] })).rejects.toThrow(/Only pending/);
  });
});

describe('sales', () => {
  it('computes totals with exact decimals and decreases stock', async () => {
    const oj = await onHand(OJ);
    const r = await callFn<any>(db, 'create_sale', { p_payment_method: 'CASH', p_items: [{ product_id: OJ, quantity: 2 }] });
    expect(Number(r.total_amount)).toBe(230);
    expect(await onHand(OJ)).toBe(oj - 2);
  });
  it('a sale failing on its last item changes nothing', async () => {
    const s0 = await state();
    await expect(callFn(db, 'create_sale', { p_payment_method: 'CARD', p_items: [{ product_id: MILK, quantity: 1 }, { product_id: OJ, quantity: 999 }] })).rejects.toThrow(/Insufficient/);
    const s1 = await state();
    expect(s1.sales.length).toBe(s0.sales.length);
    expect(s1.movements.length).toBe(s0.movements.length);
  });
});

describe('users', () => {
  it('cannot deactivate yourself; deactivated users are refused', async () => {
    const s = await state();
    await expect(callFn(db, 'set_user_active', { p_id: s.me.user_id, p_active: false })).rejects.toThrow(/own account/);
    await callFn(db, 'set_user_active', { p_id: '00000000-0000-4000-8000-000000000102', p_active: true });
    await setSessionUser(db, await demoLogin(db, 'EMP-0002', 'sims123'));
    await callFn(db, 'set_user_active', { p_id: '00000000-0000-4000-8000-000000000101', p_active: false });
    await setSessionUser(db, 'a0000000-0000-4000-8000-000000000101');
    await expect(callFn(db, 'record_movement', { p_product_id: MILK, p_movement_type: 'stock_in', p_quantity: 1, p_reason: '' })).rejects.toThrow(/inactive/);
  });
});
