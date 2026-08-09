'use client';

import { useState } from 'react';
import { useApp, fmt, Bill, currentYYYYMM } from './AppContext';
import BottomSheet from './BottomSheet';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon } from './Icons';

function uid() { return crypto.randomUUID(); }

interface Props {
  onClose: () => void;
  onEditBill: (bill: Bill) => void;
}

// Full recurring-bills management, lifted out of the Budget page so the page
// only has to render a tile summarising it.
export default function BillsSheet({ onClose, onEditBill }: Props) {
  const { settings, updateSettings, toggleBillPaid } = useApp();
  const { bills, currency } = settings;

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');

  const total = bills.reduce((s, b) => s + b.amount, 0);

  const handleAdd = () => {
    if (!name.trim() || !amt) return;
    const bill: Bill = { id: uid(), name: name.trim(), amount: parseFloat(amt), paidMonths: [] };
    updateSettings({ bills: [...bills, bill] });
    setName(''); setAmt(''); setAddOpen(false);
  };

  const remove = (id: string) =>
    updateSettings({ bills: bills.filter(b => b.id !== id) });

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💡</span>
          <p className="font-semibold text-white">Recurring Bills</p>
        </div>
        <p className="text-sm font-medium text-slate-400 tabular-nums">
          {fmt(total, currency)}/mo
        </p>
      </div>

      <div className="space-y-2">
        {bills.length === 0 && !addOpen && (
          <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-5 text-center">
            <p className="text-sm text-slate-500">No recurring bills yet.</p>
          </div>
        )}

        {bills.map(b => {
          const isPaid = b.paidMonths.includes(currentYYYYMM());
          return (
            <div
              key={b.id}
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors ${
                isPaid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-[#1e2d40]'
              }`}
            >
              <p className={`flex-1 text-sm min-w-0 truncate ${isPaid ? 'text-slate-500' : 'text-white'}`}>
                {b.name}
              </p>
              <p className="text-sm font-medium text-slate-300 shrink-0">{fmt(b.amount, currency)}</p>
              <button
                onClick={() => toggleBillPaid(b.id)}
                title={isPaid ? 'Mark unpaid' : 'Mark as paid'}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors shrink-0 ${
                  isPaid
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/10'
                }`}
              >
                <CheckIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onEditBill(b)} title="Edit bill"
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                <PencilIcon className="w-3.5 h-3.5 text-slate-500 hover:text-slate-200" />
              </button>
              <button onClick={() => remove(b.id)} title="Delete bill"
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                <TrashIcon className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
              </button>
            </div>
          );
        })}

        {addOpen ? (
          <div className="rounded-xl bg-[#1a2332] border border-blue-500/30 p-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Bill name" autoFocus
                className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
              />
              <input
                type="number" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)}
                placeholder="Amount"
                className="w-28 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!name.trim() || !amt}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40">
                Save
              </button>
              <button onClick={() => { setAddOpen(false); setName(''); setAmt(''); }}
                className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#1e2d40] py-3 text-sm text-blue-400 hover:border-blue-500/40 transition-colors">
            <PlusIcon className="w-4 h-4" /> Add bill
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
