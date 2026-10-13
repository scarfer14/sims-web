import { createContext, useContext, type ReactNode } from 'react';
import type { AppState } from './lib/types';
import type { Backend } from './lib/api';

export interface Ctx {
  state: AppState;
  backend: Backend;
  /** Runs an SQL function, refreshes data, shows a toast. Returns true on success. */
  run: (fn: string, args: Record<string, unknown>, success?: string) => Promise<boolean>;
  toast: (msg: string, error?: boolean) => void;
}
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
};

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <h3 className="serif">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, bad, children }: { label: string; hint?: string; bad?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className={'hint' + (bad ? ' bad' : '')}>{hint}</div>}
    </label>
  );
}

export const fmtDate = (s: string) =>
  new Date(s).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const MOVEMENT_LABEL: Record<string, string> = {
  stock_in: 'Stock in', stock_out: 'Stock out', sale: 'Sale', return: 'Return',
  damage: 'Damage', expired: 'Expired', adjustment: 'Adjustment',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = status === 'RECEIVED' ? 'green' : status === 'PENDING' ? 'amber' : 'gray';
  return <span className={'badge ' + cls}>{status}</span>;
}
