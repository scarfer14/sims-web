import { useState } from 'react';
import { fmtDate, MOVEMENT_LABEL, useApp } from '../ui';

export default function Movements() {
  const { state } = useApp();
  const [type, setType] = useState('all');
  const [product, setProduct] = useState('all');
  const rows = state.movements.filter((m) => (type === 'all' || m.movement_type === type) && (product === 'all' || m.product_id === product));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Stock Log</h1>
          <p>Every change to stock: who, when, how much and why (latest 500)</p>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <select className="input" style={{ maxWidth: 220 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All movement types</option>
            {Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 260 }} value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All products</option>
            {state.products.map((p) => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Product</th><th>Type</th><th className="num">Change</th><th>By</th><th>Reason</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.stock_movement_id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.created_at)}</td>
                  <td>{m.product_name}</td>
                  <td><span className={'badge ' + (m.quantity_delta > 0 ? 'green' : 'red')}>{MOVEMENT_LABEL[m.movement_type]}</span></td>
                  <td className={'num ' + (m.quantity_delta > 0 ? 'pos' : 'neg')}>{m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}</td>
                  <td>{m.user_name}</td>
                  <td className="muted small">{m.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No movements match.</div>}
        </div>
      </div>
    </>
  );
}
