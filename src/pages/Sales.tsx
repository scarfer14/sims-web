import { useState } from 'react';
import { centsToStr, peso, toCents } from '../lib/reports';
import type { Sale } from '../lib/types';
import { Field, fmtDate, Modal, useApp } from '../ui';

interface Line { product_id: string; quantity: string }

export default function Sales() {
  const { state, run } = useApp();
  const inStock = state.products.filter((p) => p.quantity_on_hand > 0);
  const [lines, setLines] = useState<Line[]>([]);
  const [pay, setPay] = useState<'CASH' | 'CARD' | 'E-WALLET'>('CASH');
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Sale | null>(null);

  const product = (id: string) => state.products.find((p) => p.product_id === id);
  let totalCents = 0;
  for (const l of lines) totalCents += toCents(product(l.product_id)?.selling_price ?? 0) * (parseInt(l.quantity, 10) || 0);

  const add = () => {
    const id = pick || inStock[0]?.product_id;
    if (!id) return;
    const existing = lines.findIndex((l) => l.product_id === id);
    if (existing >= 0) setLines(lines.map((l, i) => (i === existing ? { ...l, quantity: String((parseInt(l.quantity, 10) || 0) + 1) } : l)));
    else setLines([...lines, { product_id: id, quantity: '1' }]);
  };

  const checkout = async () => {
    setBusy(true);
    const ok = await run('create_sale', {
      p_payment_method: pay,
      p_items: lines.map((l) => ({ product_id: l.product_id, quantity: parseInt(l.quantity, 10) })),
    }, `Sale completed: ${peso(centsToStr(totalCents))}`);
    setBusy(false);
    if (ok) setLines([]);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Sales</h1>
          <p>A sale is checked line by line first — if any item is short, nothing changes</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>New sale</h2>
          <div className="row" style={{ marginBottom: 12 }}>
            <select className="input" style={{ flex: 1, minWidth: 180 }} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a product…</option>
              {state.products.map((p) => (
                <option key={p.product_id} value={p.product_id} disabled={p.quantity_on_hand <= 0}>
                  {p.product_name} — {peso(p.selling_price)} ({p.quantity_on_hand} on hand)
                </option>
              ))}
            </select>
            <button className="btn" onClick={add} disabled={!inStock.length}>Add</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th className="num">Price</th><th className="num">Qty</th><th className="num">Total</th><th></th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const p = product(l.product_id);
                  const q = parseInt(l.quantity, 10) || 0;
                  const short = p ? q > p.quantity_on_hand : true;
                  return (
                    <tr key={l.product_id}>
                      <td>{p?.product_name}<div className={'small ' + (short ? 'neg' : 'muted')}>{p?.quantity_on_hand} on hand</div></td>
                      <td className="num">{peso(p?.selling_price ?? 0)}</td>
                      <td style={{ width: 90 }}>
                        <input className="input" type="number" min="1" step="1" value={l.quantity}
                          onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                      </td>
                      <td className="num">{peso(centsToStr(toCents(p?.selling_price ?? 0) * q))}</td>
                      <td><button className="btn sm link" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lines.length === 0 && <div className="empty">Add products to start a sale.</div>}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Field label="Payment">
              <div className="chips">
                {(['CASH', 'CARD', 'E-WALLET'] as const).map((m) => (
                  <button key={m} type="button" className={'chip' + (pay === m ? ' active' : '')} onClick={() => setPay(m)}>{m}</button>
                ))}
              </div>
            </Field>
            <span className="spacer" />
            <div style={{ textAlign: 'right' }}>
              <div className="muted small">Total</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{peso(centsToStr(totalCents))}</div>
            </div>
          </div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 8 }}
            disabled={busy || lines.length === 0} onClick={checkout}>
            {busy ? 'Processing…' : 'Complete sale'}
          </button>
        </div>

        <div className="card">
          <h2>Sales history</h2>
          {state.sales.length === 0 && <div className="empty">No sales yet.</div>}
          {state.sales.slice(0, 25).map((s) => (
            <div className="list-item" key={s.sale_id}>
              <div>
                <b>{peso(s.total_amount)}</b> <span className="badge gray">{s.payment_method}</span>
                <div className="muted small">{fmtDate(s.sale_date)} · {s.sold_by_name} · {s.items.length} item(s)</div>
              </div>
              <button className="btn sm ghost" onClick={() => setViewing(s)}>View</button>
            </div>
          ))}
        </div>
      </div>

      {viewing && (
        <Modal title="Sale receipt" onClose={() => setViewing(null)}>
          <p className="small muted">{fmtDate(viewing.sale_date)} · {viewing.sold_by_name} · {viewing.payment_method}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
              <tbody>
                {viewing.items.map((it, i) => (
                  <tr key={i}><td>{it.product_name}</td><td className="num">{it.quantity}</td><td className="num">{peso(it.unit_price)}</td><td className="num">{peso(it.total_price)}</td></tr>
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
