import { computeReports, movementTotals, peso } from '../lib/reports';
import { fmtDate, MOVEMENT_LABEL, useApp } from '../ui';

export default function Dashboard() {
  const { state } = useApp();
  const r = computeReports(state);
  const totals = movementTotals(state, 30);
  const maxTotal = Math.max(1, ...Object.values(totals));
  const healthy = state.products.length ? Math.round(((state.products.length - r.lowStock.length) / state.products.length) * 100) : 100;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Good day, {state.me.name.split(' ')[0]}</h1>
          <p>Overview of products, sales, alerts and inventory health</p>
        </div>
      </div>

      <div className="grid kpis">
        <div className="card kpi"><div className="icon">▦</div><div className="label">Total products</div><div className="value">{state.products.length}</div></div>
        <div className="card kpi"><div className="icon">₱</div><div className="label">Sales revenue</div><div className="value">{peso(r.salesTotal)}</div></div>
        <div className="card kpi"><div className="icon">!</div><div className="label">Low-stock alerts</div><div className="value" style={{ color: r.lowStock.length ? 'var(--red)' : undefined }}>{r.lowStock.length}</div></div>
        <div className="card kpi"><div className="icon">Σ</div><div className="label">Stock value (at cost)</div><div className="value">{peso(r.stockValueCost)}</div></div>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Low-stock products <span className="badge red">{r.lowStock.length}</span></h2>
          {r.lowStock.length === 0 ? (
            <div className="empty">Everything is above its reorder level.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>SKU</th><th className="num">On hand</th><th className="num">Reorder at</th></tr></thead>
                <tbody>
                  {r.lowStock.map((p) => (
                    <tr key={p.product_id}>
                      <td>{p.product_name}</td><td className="muted small">{p.sku}</td>
                      <td className="num neg">{p.quantity_on_hand}</td><td className="num">{p.reorder_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Inventory health</h2>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">Products above reorder level</span><b>{healthy}%</b>
          </div>
          <div className="health" style={{ margin: '8px 0 14px' }}><div style={{ width: healthy + '%' }} /></div>
          <div className="list-item"><span>Units on hand</span><b>{r.units}</b></div>
          <div className="list-item"><span>Stock value (retail)</span><b>{peso(r.stockValueRetail)}</b></div>
          <div className="list-item"><span>Pending purchase orders</span><b>{r.pendingPOs}</b></div>
          <div className="list-item"><span>Active suppliers</span><b>{state.suppliers.filter((s) => s.is_active).length}</b></div>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Recent stock movements</h2>
          {state.movements.length === 0 && <div className="empty">No movements yet.</div>}
          {state.movements.slice(0, 6).map((m) => (
            <div className="list-item" key={m.stock_movement_id}>
              <div>
                <div>{m.product_name}</div>
                <div className="muted small">{MOVEMENT_LABEL[m.movement_type]} · {m.user_name} · {fmtDate(m.created_at)}</div>
              </div>
              <span className={m.quantity_delta > 0 ? 'pos' : 'neg'}>{m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}</span>
            </div>
          ))}
        </div>
        <div className="card dark">
          <h2>Units moved · last 30 days</h2>
          <div className="bars">
            {Object.keys(MOVEMENT_LABEL).map((t) => (
              <div className="bar-row" key={t}>
                <span>{MOVEMENT_LABEL[t]}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: ((totals[t] ?? 0) / maxTotal) * 100 + '%' }} /></div>
                <span style={{ textAlign: 'right' }}>{totals[t] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
