// Reports are simple loops over the data (the imperative style from Implementation B).
// Money is handled in centavos (integers) so there are no floating-point errors.
import type { AppState, Product } from './types';

export const toCents = (v: number | string) => Math.round(Number(v) * 100);
export const centsToStr = (c: number) => (c / 100).toFixed(2);
export const peso = (v: number | string) =>
  '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function isLowStock(p: Product) {
  return p.quantity_on_hand <= p.reorder_level;
}

export function computeReports(s: AppState) {
  const lowStock: Product[] = [];
  let costCents = 0;
  let retailCents = 0;
  let units = 0;
  for (const p of s.products) {
    if (isLowStock(p)) lowStock.push(p);
    costCents += toCents(p.cost_price) * p.quantity_on_hand;
    retailCents += toCents(p.selling_price) * p.quantity_on_hand;
    units += p.quantity_on_hand;
  }
  let salesCents = 0;
  for (const sale of s.sales) salesCents += toCents(sale.total_amount);
  const pendingPOs = s.purchase_orders.filter((po) => po.status === 'PENDING').length;
  return {
    lowStock,
    stockValueCost: centsToStr(costCents),
    stockValueRetail: centsToStr(retailCents),
    units,
    salesTotal: centsToStr(salesCents),
    pendingPOs,
  };
}

/** Net quantity per movement type over the last N days (for the dashboard chart). */
export function movementTotals(s: AppState, days = 30) {
  const since = Date.now() - days * 86400000;
  const totals: Record<string, number> = {};
  for (const m of s.movements) {
    if (new Date(m.created_at).getTime() < since) continue;
    totals[m.movement_type] = (totals[m.movement_type] ?? 0) + Math.abs(m.quantity_delta);
  }
  return totals;
}

export function ean13Valid(code: string) {
  if (!/^\d{13}$/.test(code)) return false;
  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (total % 10)) % 10 === Number(code[12]);
}
