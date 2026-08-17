'use client';

import { useState } from 'react';
import { useApp, fmt, Bill, currentYYYYMM } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon } from './Icons';

function uid() { return crypto.randomUUID(); }

interface Props {
  onClose: () => void;
  onEditBill: (bill: Bill) => void;
}

// Full recurring-bills management, lifted out of the Budget page so the page
// only has to render a tile summarising it.
export default function BillsSheet({ onClose, onEditBill }: Props) {
  const { settings, updateSettings, markBillPaid, unmarkBillPaid, wallets } = useApp();
  const { bills, currency } = settings;

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  // The bill mid-payment, and the wallet it will come out of. Paying is real
  // spending, so it takes a confirm step rather than happening on the tick.
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payWalletId, setPayWalletId] = useState('');
  const [paying, setPaying] = useState(false);

  const startPaying = (billId: string) => {
    setPayingId(billId);
    setPayWalletId(settings.cashWalletId ?? '');
  };

  const confirmPay = async () => {
    if (!payingId || !payWalletId || paying) return;
    setPaying(true);
    await markBillPaid(payingId, payWalletId);
    setPaying(false);
    setPayingId(null);
  };

  const total = bills.reduce((s, b) => s + b.amount, 0);

  const handleAdd = () => {
    if (!name.trim() || !amt) return;
    const bill: Bill = { id: uid(), name: name.trim(), amount: parseFloat(amt), paidMonths: [], paidExpenseIds: {} };
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
          const isPaying = payingId === b.id;
          return (
            <div
              key={b.id}
              className={`rounded-xl border px-4 py-3 transition-colors ${
                isPaid ? 'bg-emerald-500/5 border-emerald-500/20'
                  : isPaying ? 'bg-white/5 border-blue-500/40'
                    : 'bg-white/5 border-[#1e2d40]'
              }`}
            >
            <div className="flex items-center gap-2">
              <p className={`flex-1 text-sm min-w-0 truncate ${isPaid ? 'text-slate-500' : 'text-white'}`}>
                {b.name}
              </p>
              <p className="text-sm font-medium text-slate-300 shrink-0">{fmt(b.amount, currency)}</p>
              <button
                onClick={() => (isPaid ? unmarkBillPaid(b.id) : isPaying ? setPayingId(null) : startPaying(b.id))}
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

            {isPaying && (
              <div className="mt-3 border-t border-[#1e2d40] pt-3">
                {wallets.length === 0 ? (
                  <p className="text-xs text-slate-500">No wallets yet — add one before paying a bill.</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 mb-2">Paid from</p>
                    <WalletPicker value={payWalletId} onChange={setPayWalletId} />
                    <button
                      onClick={confirmPay}
                      disabled={!payWalletId || paying}
                      className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Log {fmt(b.amount, currency)} as paid
                    </button>
                  </>
                )}
              </div>
            )}
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
