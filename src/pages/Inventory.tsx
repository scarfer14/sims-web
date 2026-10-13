import { useState } from 'react';
import { ean13Valid, isLowStock, peso } from '../lib/reports';
import type { Category, MovementType, Product } from '../lib/types';
import { Field, Modal, MOVEMENT_LABEL, useApp } from '../ui';

export default function Inventory() {
  const { state, run } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [moving, setMoving] = useState<Product | null>(null);
  const [cats, setCats] = useState(false);

  const term = q.trim().toLowerCase();
  const rows = state.products.filter(
    (p) =>
      (cat === 'all' || p.category_id === cat) &&
      (!lowOnly || isLowStock(p)) &&
      (!term || [p.product_name, p.sku, p.barcode ?? '', p.category_name].some((s) => s.toLowerCase().includes(term))),
  );

  const del = (p: Product) => {
    if (confirm(`Delete ${p.product_name}?`)) run('delete_product', { p_id: p.product_id }, 'Product deleted.');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Inventory</h1>
          <p>{state.products.length} products in {state.categories.length} categories</p>
        </div>
        <div className="row">
          <button className="btn light" onClick={() => setCats(true)}>Categories</button>
          <button className="btn" onClick={() => setEditing('new')} disabled={!state.categories.length}>+ Add product</button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="input search" placeholder="Search products, SKU or barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="row small"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
        </div>
        <div className="chips" style={{ marginBottom: 14 }}>
          <button className={'chip' + (cat === 'all' ? ' active' : '')} onClick={() => setCat('all')}>All</button>
          {state.categories.map((c) => (
            <button key={c.category_id} className={'chip' + (cat === c.category_id ? ' active' : '')} onClick={() => setCat(c.category_id)}>
              {c.category_name}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Product</th><th>Category</th><th>SKU / Barcode</th><th className="num">Cost</th><th className="num">Price</th><th className="num">On hand</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.product_id}>
                  <td><b>{p.product_name}</b><div className="muted small">{p.unit_measurement}</div></td>
                  <td>{p.category_name}</td>
                  <td className="small">{p.sku}<div className="muted">{p.barcode ?? '—'}</div></td>
                  <td className="num">{peso(p.cost_price)}</td>
                  <td className="num">{peso(p.selling_price)}</td>
                  <td className="num"><b>{p.quantity_on_hand}</b></td>
                  <td>{isLowStock(p) ? <span className="badge red">Low (≤{p.reorder_level})</span> : <span className="badge green">In stock</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setMoving(p)}>Stock</button>{' '}
                    <button className="btn sm ghost" onClick={() => setEditing(p)}>Edit</button>{' '}
                    <button className="btn sm link" onClick={() => del(p)} disabled={p.has_movements}
                      title={p.has_movements ? 'Has stock movements — cannot be deleted' : 'Delete'}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No products match.</div>}
        </div>
      </div>

      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {moving && <MovementForm product={moving} onClose={() => setMoving(null)} />}
      {cats && <CategoryManager onClose={() => setCats(false)} />}
    </>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { state, run } = useApp();
  const [f, setF] = useState({
    name: product?.product_name ?? '',
    category: product?.category_id ?? state.categories[0]?.category_id ?? '',
    description: product?.description ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    unit: product?.unit_measurement ?? 'PCS',
    cost: product ? String(product.cost_price) : '',
    price: product ? String(product.selling_price) : '',
    reorder: product ? String(product.reorder_level) : '5',
    initial: '0',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const badBarcode = f.barcode.trim() !== '' && !ean13Valid(f.barcode.trim());

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run('save_product', {
      p_id: product?.product_id ?? null, p_category_id: f.category, p_product_name: f.name, p_description: f.description,
      p_sku: f.sku, p_barcode: f.barcode, p_unit: f.unit, p_cost_price: Number(f.cost), p_selling_price: Number(f.price),
      p_reorder_level: parseInt(f.reorder, 10), p_initial_qty: product ? 0 : parseInt(f.initial || '0', 10),
    }, product ? 'Product updated.' : 'Product added.');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Product name"><input className="input" value={f.name} onChange={set('name')} required maxLength={150} /></Field>
        <div className="form-grid">
          <Field label="Category">
            <select className="input" value={f.category} onChange={set('category')}>
              {state.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </select>
          </Field>
          <Field label="Unit">
            <select className="input" value={f.unit} onChange={set('unit')}>
              <option value="PCS">PCS (pieces)</option><option value="KG">KG</option><option value="L">L</option>
            </select>
          </Field>
          <Field label="SKU" hint={product ? undefined : 'Leave blank to generate SMS-XXXXXXXX'}>
            <input className="input" value={f.sku} onChange={set('sku')} maxLength={50} />
          </Field>
          <Field label="Barcode (EAN-13, optional)" hint={badBarcode ? 'Not a valid EAN-13 (check digit fails)' : undefined} bad={badBarcode}>
            <input className="input" value={f.barcode} onChange={set('barcode')} inputMode="numeric" maxLength={13} />
          </Field>
          <Field label="Cost price (₱)"><input className="input" type="number" min="0" step="0.01" value={f.cost} onChange={set('cost')} required /></Field>
          <Field label="Selling price (₱)"><input className="input" type="number" min="0" step="0.01" value={f.price} onChange={set('price')} required /></Field>
          <Field label="Reorder level" hint="Flagged as low stock at or below this"><input className="input" type="number" min="0" step="1" value={f.reorder} onChange={set('reorder')} required /></Field>
          {!product && (
            <Field label="Initial stock" hint="Recorded as a stock-in movement"><input className="input" type="number" min="0" step="1" value={f.initial} onChange={set('initial')} /></Field>
          )}
        </div>
        <Field label="Description"><textarea className="input" rows={2} value={f.description} onChange={set('description')} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || badBarcode}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

const MANUAL_TYPES: MovementType[] = ['stock_in', 'stock_out', 'return', 'damage', 'expired', 'adjustment'];

function MovementForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const { run } = useApp();
  const [type, setType] = useState<MovementType>('stock_in');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const n = parseInt(qty || '0', 10) || 0;
  const delta = type === 'adjustment' ? n : ['stock_in', 'return'].includes(type) ? Math.abs(n) : -Math.abs(n);
  const after = product.quantity_on_hand + delta;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run('record_movement', { p_product_id: product.product_id, p_movement_type: type, p_quantity: n, p_reason: reason },
      `${MOVEMENT_LABEL[type]} recorded for ${product.product_name}.`);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Stock movement · ${product.product_name}`} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Movement type">
          <div className="chips">
            {MANUAL_TYPES.map((t) => (
              <button type="button" key={t} className={'chip' + (t === type ? ' active' : '')} onClick={() => setType(t)}>{MOVEMENT_LABEL[t]}</button>
            ))}
          </div>
        </Field>
        <div className="form-grid">
          <Field label={type === 'adjustment' ? 'Change (use − to reduce)' : 'Quantity'}>
            <input className="input" type="number" step="1" min={type === 'adjustment' ? undefined : 1} value={qty} onChange={(e) => setQty(e.target.value)} required />
          </Field>
          <Field label="On hand after">
            <div className="input" style={{ background: '#faf6f3' }}>
              {product.quantity_on_hand} → <b className={after < 0 ? 'neg' : ''}>{after}</b>
            </div>
          </Field>
        </div>
        <Field label={'Reason' + (type === 'adjustment' ? ' (required)' : ' (optional)')}>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required={type === 'adjustment'} placeholder="e.g. Delivery from supplier, recount, broken bottle" />
        </Field>
        <p className="muted small">Sales are recorded on the Sales page so their totals stay correct.</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || n === 0}>{busy ? 'Saving…' : 'Record movement'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryManager({ onClose }: { onClose: () => void }) {
  const { state, run } = useApp();
  const [edit, setEdit] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const start = (c: Category | null) => {
    setEdit(c);
    setName(c?.category_name ?? '');
    setDesc(c?.description ?? '');
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('save_category', { p_id: edit?.category_id ?? null, p_name: name, p_description: desc }, edit ? 'Category updated.' : 'Category added.')) start(null);
  };

  return (
    <Modal title="Categories" onClose={onClose}>
      {state.categories.map((c) => {
        const count = state.products.filter((p) => p.category_id === c.category_id).length;
        return (
          <div className="list-item" key={c.category_id}>
            <div><b>{c.category_name}</b><div className="muted small">{c.description ?? '—'} · {count} products</div></div>
            <div className="row">
              <button className="btn sm ghost" onClick={() => start(c)}>Edit</button>
              <button className="btn sm link" disabled={count > 0} title={count > 0 ? 'Has products' : 'Delete'}
                onClick={() => confirm(`Delete ${c.category_name}?`) && run('delete_category', { p_id: c.category_id }, 'Category deleted.')}>Delete</button>
            </div>
          </div>
        );
      })}
      <form onSubmit={save} style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <b className="small">{edit ? `Edit "${edit.category_name}"` : 'New category'}</b>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></Field>
          <Field label="Description"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        </div>
        <div className="modal-actions">
          {edit && <button type="button" className="btn ghost" onClick={() => start(null)}>Cancel edit</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn">{edit ? 'Save' : 'Add category'}</button>
        </div>
      </form>
    </Modal>
  );
}
