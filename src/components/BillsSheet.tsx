'use client';

import { useState } from 'react';
import { useApp, fmt, Bill, Category } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon } from './Icons';
import { visibleCategories } from '@/lib/categories';
import { dueDateInCycle } from '@/lib/cycle';
import { IconTile } from './AppIcon';

function uid() { return crypto.randomUUID(); }

interface Props {
  onClose: () => void;
  onEditBill: (bill: Bill) => void;
}

// Full recurring-bills management, lifted out of the Budget page so the page
// only has to render a tile summarising it.
export default function BillsSheet({ onClose, onEditBill }: Props) {
  const { settings, updateSettings, markBillPaid, unmarkBillPaid, wallets, currentCycle } = useApp();
  const { bills, currency } = settings;

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [category, setCategory] = useState<Category>('bills');
  // The bill mid-payment, and the wallet it will come out of. Paying is real
  // spending, so it takes a confirm step rather than happening on the tick.
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payWalletId, setPayWalletId] = useState('');
  const [payAmt, setPayAmt] = useState('');
  const [paying, setPaying] = useState(false);

  const startPaying = (billId: string) => {
    const bill = bills.find(b => b.id === billId);
    setPayingId(billId);
    setPayWalletId(settings.cashWalletId ?? '');
    // Pre-filled with the estimate, because most bills are what you expected.
    setPayAmt(bill ? String(bill.amount) : '');
  };

  const confirmPay = async () => {
    const amount = parseFloat(payAmt);
    if (!payingId || !payWalletId || paying || !(amount > 0)) return;
    setPaying(true);
    await markBillPaid(payingId, payWalletId, amount);
    setPaying(false);
    setPayingId(null);
    setPayAmt('');
  };

  const total = bills.reduce((s, b) => s + b.amount, 0);

  const handleAdd = () => {
    if (!name.trim() || !amt) return;
    const bill: Bill = {
      id: uid(), name: name.trim(), amount: parseFloat(amt),
      dueDay: dueDay ? Math.min(Math.max(parseInt(dueDay), 1), 31) : null,
      category,
      paidMonths: [], paidExpenseIds: {},
    };
    updateSettings({ bills: [...bills, bill] });
    setName(''); setAmt(''); setDueDay(''); setCategory('bills'); setAddOpen(false);
  };

  const remove = (id: string) =>
    updateSettings({ bills: bills.filter(b => b.id !== id) });

  const { cycleStartDay } = settings;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Bills without a due day sort last: they cannot be chased, so they should
  // not sit above the ones that can.
  const dueOf = (b: Bill) =>
    b.dueDay === null ? null : dueDateInCycle(b.dueDay, currentCycle, cycleStartDay);

  const sorted = [...bills].sort((a, b) => {
    const da = dueOf(a), db = dueOf(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  const dueLabel = (b: Bill): { text: string; overdue: boolean } | null => {
    const due = dueOf(b);
    if (!due) return null;
    const days = Math.round((due.getTime() - startOfToday.getTime()) / 86_400_000);
    if (days === 0) return { text: 'due today', overdue: false };
    if (days < 0) return { text: `overdue by ${-days} day${days === -1 ? '' : 's'}`, overdue: true };
    return { text: `due in ${days} day${days === 1 ? '' : 's'}`, overdue: false };
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <IconTile icon="receipt-text" />
          <p className="font-semibold text-ink">Recurring Bills</p>
        </div>
        <p className="text-sm font-medium text-ink-2 tabular-nums">
          {fmt(total, currency)}/mo
        </p>
      </div>

      <div className="space-y-2">
        {bills.length === 0 && !addOpen && (
          <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center">
            <p className="text-sm text-ink-3">No recurring bills yet.</p>
          </div>
        )}

        {sorted.map(b => {
          const isPaid = b.paidMonths.includes(currentCycle);
          const isPaying = payingId === b.id;
          return (
            <div
              key={b.id}
              className={`rounded-xl border px-4 py-3 transition-colors ${
                isPaid ? 'bg-growth-tint border-growth-edge'
                  : isPaying ? 'bg-raised border-primary-edge'
                    : 'bg-raised border-line'
              }`}
            >
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isPaid ? 'text-ink-3' : 'text-ink'}`}>{b.name}</p>
                {dueLabel(b) && (
                  <p className={`text-xs ${
                    isPaid ? 'text-ink-4' : dueLabel(b)!.overdue ? 'text-danger-text' : 'text-ink-3'
                  }`}>
                    {dueLabel(b)!.text}
                  </p>
                )}
              </div>
              <p className="text-sm font-medium text-ink-2 shrink-0">{fmt(b.amount, currency)}</p>
              <button
                onClick={() => {
                  if (isPaid) unmarkBillPaid(b.id);
                  else if (isPaying) { setPayingId(null); setPayAmt(''); }
                  else startPaying(b.id);
                }}
                title={isPaid ? 'Mark unpaid' : 'Mark as paid'}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors shrink-0 ${
                  isPaid
                    ? 'bg-growth-tint text-growth-text'
                    : 'bg-raised text-ink-3 hover:text-ink hover:bg-line'
                }`}
              >
                <CheckIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onEditBill(b)} title="Edit bill"
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-line transition-colors shrink-0">
                <PencilIcon className="w-3.5 h-3.5 text-ink-3 hover:text-ink" />
              </button>
              <button onClick={() => remove(b.id)} title="Delete bill"
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-line transition-colors shrink-0">
                <TrashIcon className="w-3.5 h-3.5 text-danger-text/60 hover:text-danger-text" />
              </button>
            </div>

            {isPaying && (
              <div className="mt-3 border-t border-line pt-3">
                {wallets.length === 0 ? (
                  <p className="text-xs text-ink-3">No wallets yet — add one before paying a bill.</p>
                ) : (
                  <>
                    <p className="text-xs text-ink-3 mb-2">Amount paid</p>
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-sm text-ink-3">{currency}</span>
                      <input
                        type="number" inputMode="decimal" value={payAmt}
                        onChange={e => setPayAmt(e.target.value)}
                        step="0.01" min="0" autoFocus
                        className="flex-1 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                      />
                    </div>
                    <p className="text-xs text-ink-3 mb-2">Paid from</p>
                    <WalletPicker value={payWalletId} onChange={setPayWalletId} />
                    <button
                      onClick={confirmPay}
                      disabled={!payWalletId || paying || !(parseFloat(payAmt) > 0)}
                      className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-on-primary disabled:opacity-40"
                    >
                      Log {fmt(parseFloat(payAmt) || 0, currency)} as paid
                    </button>
                  </>
                )}
              </div>
            )}
            </div>
          );
        })}

        {addOpen ? (
          <div className="rounded-xl bg-raised border border-primary-edge p-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Bill name" autoFocus
                className="flex-1 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink placeholder-ink-4 outline-none focus:border-primary"
              />
              <input
                type="number" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)}
                placeholder="Amount"
                className="w-28 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink placeholder-ink-4 outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="number" inputMode="numeric" value={dueDay}
                onChange={e => setDueDay(e.target.value)}
                placeholder="Due day (e.g. 15)" min="1" max="31"
                className="flex-1 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink placeholder-ink-4 outline-none focus:border-primary"
              />
              <select
                value={category}
                onChange={e => setCategory(e.target.value as Category)}
                className="w-32 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              >
                {visibleCategories(settings.customCategories, settings.hiddenCategories).map(c => (
                  <option key={c.key} value={c.key} className="bg-surface">{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!name.trim() || !amt}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-on-primary disabled:opacity-40">
                Save
              </button>
              <button onClick={() => { setAddOpen(false); setName(''); setAmt(''); setDueDay(''); setCategory('bills'); }}
                className="flex-1 rounded-lg bg-raised py-2 text-sm text-ink-2">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-3 text-sm text-primary-text hover:border-primary-edge transition-colors">
            <PlusIcon className="w-4 h-4" /> Add bill
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
