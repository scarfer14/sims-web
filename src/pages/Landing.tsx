import { MODE } from '../lib/api';

export default function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="landing">
      <header>
        <div className="brand"><span className="brand-mark">S</span>SIMS</div>
        <button className="btn light" onClick={onSignIn}>Staff sign in</button>
      </header>
      <section className="hero">
        <div>
          <div className="big serif">INVENTORY</div>
          <span className="tag">SUPERMARKET INVENTORY MANAGEMENT SYSTEM</span>
          <h2 className="serif">Eat well. Spend less.</h2>
          <p>
            SIMS keeps every product, stock level, supplier order and sale in one place. Every change to stock is
            logged against the staff member who made it, stock can never go below zero, and prices are stored as exact
            decimals — so the count in the system matches the count on the shelf.
          </p>
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn" onClick={onSignIn}>Open the terminal →</button>
          </div>
        </div>
        <div className="perf">
          <h3 className="serif" style={{ fontSize: 22, marginBottom: 8 }}>What SIMS tracks</h3>
          <div className="line"><span>Products & categories</span><span className="badge red">SKU · EAN-13</span></div>
          <div className="line"><span>Stock on hand</span><span className="badge red">= sum of movements</span></div>
          <div className="line"><span>Stock movements</span><span className="badge red">7 types, full audit</span></div>
          <div className="line"><span>Suppliers & purchase orders</span><span className="badge red">receive → stock in</span></div>
          <div className="line"><span>Sales</span><span className="badge red">all-or-nothing</span></div>
          <div className="line"><span>Reports</span><span className="badge red">low stock · value</span></div>
        </div>
      </section>
      <footer>
        <span>SIMS by FORZA · CCPGLANG · National University Manila</span>
        <span>{MODE === 'demo' ? 'Demo mode — data is saved in this browser' : 'Connected to Supabase'}</span>
      </footer>
    </div>
  );
}
