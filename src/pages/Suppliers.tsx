import { useState } from 'react';
import { centsToStr, peso, toCents } from '../lib/reports';
import type { PurchaseOrder, Supplier } from '../lib/types';
import { Field, fmtDate, Modal, StatusBadge, useApp } from '../ui';

export default function Suppliers() {
  const { state, run } = useApp();
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [po, setPo] = useState<PurchaseOrder | 'new' | null>(null);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'RECEIVED' | 'CANCELLED'>('ALL');
  const orders = state.purchase_orders.filter((o) => filter === 'ALL' || o.status === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Suppliers & Purchase Orders</h1>
          <p>Receiving an order adds its items to stock and logs a stock-in for each line</p>
        </div>
        <div className="row">
          <button className="btn light" onClick={() => setEditing('new')}>+ Supplier</button>
          <button className="btn" onClick={() => setPo('new')} disabled={!state.suppliers.some((s) => s.is_active) || !state.products.length}>+ Purchase order</button>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>
            Purchase orders
            <span className="chips">
              {(['ALL', 'PENDING', 'RECEIVED', 'CANCELLED'] as const).map((s) => (
                <button key={s} className={'chip' + (filter === s ? ' active' : '')} onClick={() => setFilter(s)}>{s[0] + s.slice(1).toLowerCase()}</button>
              ))}
            </span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Supplier</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.purchase_order_id}>
                    <td className="small">{fmtDate(o.order_date)}<div className="muted">by {o.ordered_by_name}</div></td>
                    <td>{o.supplier_name}<div className="muted small">{o.items.length} line(s)</div></td>
                    <td className="num">{peso(o.total_amount)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm ghost" onClick={() => setViewing(o)}>View</button>{' '}
                      {o.status === 'PENDING' && (
                        <>
                          <button className="btn sm" onClick={() => confirm('Receive this order? Its items will be added to stock.') && run('receive_purchase_order', { p_id: o.purchase_order_id }, 'Order received — stock updated.')}>Receive</button>{' '}
                          <button className="btn sm ghost" onClick={() => setPo(o)}>Edit</button>{' '}
                          <button className="btn sm link" onClick={() => confirm('Cancel this order?') && run('cancel_purchase_order', { p_id: o.purchase_order_id }, 'Order cancelled.')}>Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length === 0 && <div className="empty">No purchase orders yet.</div>}
          </div>
        </div>

        <div className="card">
          <h2>Suppliers directory</h2>
          {state.suppliers.map((s) => (
            <div className="list-item" key={s.supplier_id}>
              <div style={{ minWidth: 0 }}>
                <b>{s.supplier_name}</b> {!s.is_active && <span className="badge gray">Inactive</span>}
                <div className="muted small">{[s.contact_name, s.phone, s.email].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn sm ghost" onClick={() => setEditing(s)}>Edit</button>
                <button className="btn sm link" onClick={() => run('set_supplier_active', { p_id: s.supplier_id, p_active: !s.is_active }, s.is_active ? 'Supplier deactivated.' : 'Supplier activated.')}>
                  {s.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
          {state.suppliers.length === 0 && <div className="empty">No suppliers yet.</div>}
        </div>
      </div>

      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {po && <POForm order={po === 'new' ? null : po} onClose={() => setPo(null)} />}
      {viewing && (
        <Modal title="Purchase order" onClose={() => setViewing(null)}>
          <p className="small muted">{viewing.supplier_name} · {fmtDate(viewing.order_date)} · ordered by {viewing.ordered_by_name} · <StatusBadge status={viewing.status} /></p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Total</th></tr></thead>
              <tbody>
                {viewing.items.map((it, i) => (
                  <tr key={i}><td>{it.product_name}</td><td className="num">{it.quantity}</td><td className="num">{peso(it.unit_cost)}</td><td className="num">{peso(it.total_price)}</td></tr>
                ))}
                <tr><td colSpan={3}><b>Total</b></td><td className="num"><b>{peso(viewing.total_amount)}</b></td></tr>
              </tbody>
            </table>
          </div>
          <div className="modal-actions"><button className="btn" onClick={() => setViewing(null)}>Close</button></div>
        </Modal>
      )}
    </>
  );
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const { run } = useApp();
  const [f, setF] = useState({
    name: supplier?.supplier_name ?? '', contact: supplier?.contact_name ?? '', email: supplier?.email ?? '',
    phone: supplier?.phone ?? '', address: supplier?.address ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('save_supplier', { p_id: supplier?.supplier_id ?? null, p_supplier_name: f.name, p_contact_name: f.contact, p_email: f.email, p_phone: f.phone, p_address: f.address }, supplier ? 'Supplier updated.' : 'Supplier added.')) onClose();
  };
  return (
    <Modal title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Supplier name"><input className="input" value={f.name} onChange={set('name')} required /></Field>
        <div className="form-grid">
          <Field label="Contact person"><input className="input" value={f.contact} onChange={set('contact')} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn">Save</button>
        </div>
      </form>
    </Modal>
  );
}

interface Line { product_id: string; quantity: string; unit_cost: string }

function POForm({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) {
  const { state, run } = useApp();
  const active = state.suppliers.filter((s) => s.is_active);
  const [supplier, setSupplier] = useState(order?.supplier_id ?? active[0]?.supplier_id ?? '');
  const first = state.products[0];
  const [lines, setLines] = useState<Line[]>(
    order
      ? order.items.map((it) => ({ product_id: it.product_id, quantity: String(it.quantity), unit_cost: String(it.unit_cost) }))
      : [{ product_id: first?.product_id ?? '', quantity: '1', unit_cost: String(first?.cost_price ?? '0') }],
  );
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  let totalCents = 0;
  for (const l of lines) totalCents += toCents(l.unit_cost || 0) * (parseInt(l.quantity, 10) || 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const items = lines.map((l) => ({ product_id: l.product_id, quantity: parseInt(l.quantity, 10), unit_cost: Number(l.unit_cost) }));
    const ok = order
      ? await run('update_purchase_order', { p_id: order.purchase_order_id, p_items: items }, 'Order updated.')
      : await run('create_purchase_order', { p_supplier_id: supplier, p_items: items }, 'Purchase order created.');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={order ? 'Edit purchase order' : 'New purchase order'} onClose={onClose} wide>
      <form onSubmit={save}>
        <Field label="Supplier">
          {order ? (
            <div className="input" style={{ background: '#faf6f3' }}>{order.supplier_name}</div>
          ) : (
            <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} required>
              {active.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
            </select>
          )}
        </Field>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit cost (₱)</th><th className="num">Line total</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 180 }}>
                    <select className="input" value={l.product_id} onChange={(e) => {
                      const p = state.products.find((x) => x.product_id === e.target.value);
                      update(i, { product_id: e.target.value, unit_cost: String(p?.cost_price ?? l.unit_cost) });
                    }}>
                      {state.products.map((p) => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
                    </select>
                  </td>
                  <td style={{ width: 90 }}><input className="input" type="number" min="1" step="1" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} required /></td>
                  <td style={{ width: 120 }}><input className="input" type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => update(i, { unit_cost: e.target.value })} required /></td>
                  <td className="num">{peso(centsToStr(toCents(l.unit_cost || 0) * (parseInt(l.quantity, 10) || 0)))}</td>
                  <td><button type="button" className="btn sm link" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ margin: '12px 0' }}>
          <button type="button" className="btn sm ghost" onClick={() => setLines([...lines, { product_id: first?.product_id ?? '', quantity: '1', unit_cost: String(first?.cost_price ?? '0') }])}>+ Add line</button>
          <span className="spacer" />
          <b>Total: {peso(centsToStr(totalCents))}</b>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !supplier}>{busy ? 'Saving…' : order ? 'Save changes' : 'Create order'}</button>
        </div>
      </form>
    </Modal>
  );
}
