'use client';

import { useState } from 'react';
import { useApp, round2, Category, IncomeSource, INCOME_SOURCES } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import SplitPanel, { SplitResult } from './SplitPanel';
import { visibleCategories } from '@/lib/categories';
import type { RowSource } from './ActivityRow';

// The date input works in calendar days; the rows store instants.
const toYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Midday, as AddDebtSheet already dates a hand-entered row: a bare midnight in
// PH converts to the previous day in UTC, which backdates the entry by one.
const fromYmd = (ymd: string) => new Date(`${ymd}T12:00:00`).toISOString();

const label = 'text-xs text-slate-500 uppercase tracking-widest mb-1.5';
const field = 'w-full rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50';

interface Props {
  source: RowSource;
  onClose: () => void;
}

export default function EditEntrySheet({ source, onClose }: Props) {
  const {
    expenses, moneyMoves, debtEntries, settings,
    updateExpense, updateMoneyMove, updateDebtEntry,
  } = useApp();

  const expense = source.kind === 'expense' ? expenses.find(e => e.id === source.id) : undefined;
  const move    = source.kind === 'move'    ? moneyMoves.find(m => m.id === source.id) : undefined;
  const entry   = source.kind === 'debt'    ? debtEntries.find(d => d.id === source.entryId) : undefined;

  // The split as it stands, rebuilt from the debt rows the expense produced.
  const linked = expense ? debtEntries.filter(d => d.expenseId === expense.id) : [];
  const owedRows = linked.filter(d => d.direction === 'owed_to_me');

  // What the user originally typed: their share plus everything owed back.
  const originalTotal = expense
    ? (expense.walletId ? round2(expense.amount + owedRows.reduce((s, d) => s + d.amount, 0)) : expense.amount)
    : (move?.amount ?? entry?.amount ?? 0);

  const [amount,   setAmount]   = useState(String(originalTotal));
  const [category, setCategory] = useState<Category>(expense?.category ?? 'other');
  const [walletId, setWalletId] = useState(expense?.walletId ?? move?.walletId ?? entry?.walletId ?? '');
  const [toWallet, setToWallet] = useState(move?.toWalletId ?? '');
  const [fee,      setFee]      = useState(String(move?.fee ?? 0));
  const [srcKind,  setSrcKind]  = useState<IncomeSource>(move?.source ?? 'other');
  const [note,     setNote]     = useState(expense?.note ?? move?.note ?? entry?.note ?? '');
  const [date,     setDate]     = useState(toYmd(expense?.date ?? move?.date ?? entry?.date ?? new Date().toISOString()));
  const [split,    setSplit]    = useState<SplitResult | null>(
    linked.length === 0 ? null
      : linked[0].direction === 'i_owe'
        ? { mode: 'person', paidByPersonId: linked[0].personId, owedToMe: [] }
        : { mode: 'wallet', paidByPersonId: null, owedToMe: owedRows.map(d => ({ personId: d.personId, amount: d.amount })) },
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const originalDate = expense?.date ?? move?.date ?? entry?.date ?? '';
  // A settle-up has no per-row edit — its amount is a net several rows share —
  // so the sheet is never opened for one and resolves to nothing here.
  const row = expense ?? move ?? entry;
  if (!row) return null;

  const typed = parseFloat(amount) || 0;
  const owedTotal = split?.mode === 'wallet'
    ? split.owedToMe.reduce((s, o) => s + o.amount, 0)
    : 0;
  const myShare = round2(typed - owedTotal);
  const isTransfer = Boolean(move && move.toWalletId);
  const needsWallet = source.kind !== 'expense' || !split || split.mode === 'wallet';

  const canSave =
    typed > 0
    && (!needsWallet || walletId !== '')
    && (source.kind !== 'expense' || split?.mode !== 'person' || split.paidByPersonId !== null)
    // A share of zero would mean the expense should not exist; updateExpense
    // refuses it, so the button refuses it first with a reason on screen.
    && (source.kind !== 'expense' || myShare > 0)
    && (!isTransfer || toWallet !== '');

  // Only send a date when it actually moved, so an untouched row keeps the
  // time of day it was logged at rather than snapping to midday.
  const dateArg = date === toYmd(originalDate) ? undefined : fromYmd(date);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);

    let ok = false;
    if (source.kind === 'expense') {
      ok = await updateExpense(source.id, {
        amount: typed, category, note: note.trim(),
        walletId: split?.mode === 'person' ? null : walletId,
        paidByPersonId: split?.mode === 'person' ? split.paidByPersonId : null,
        owedToMe: split?.mode === 'wallet' ? split.owedToMe.filter(o => o.amount > 0) : [],
        date: dateArg,
      });
    } else if (source.kind === 'move') {
      ok = await updateMoneyMove(source.id, {
        amount: typed, walletId,
        toWalletId: isTransfer ? toWallet : undefined,
        fee: parseFloat(fee) || 0,
        source: move?.kind === 'earned' ? srcKind : undefined,
        note: note.trim(), date: dateArg,
      });
    } else if (source.kind === 'debt') {
      ok = await updateDebtEntry(source.entryId, {
        amount: typed, note: note.trim(), date: dateArg,
        walletId: walletId || null,
      });
    }

    setSaving(false);
    if (ok) onClose();
    else setError(
      'This entry is settled through a wallet. Reverse the settle-up on the debt board first, then edit it.',
    );
  };

  const categories = visibleCategories(settings.customCategories, settings.hiddenCategories);

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white mb-5">
        {source.kind === 'expense' ? 'Edit expense' : source.kind === 'move' ? 'Edit entry' : 'Edit debt'}
      </p>

      {/* ── Amount ── */}
      <div className="mb-4">
        <p className={label}>Amount</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-slate-500 shrink-0">{settings.currency}</span>
          <input
            type="number" inputMode="decimal" min="0" step="0.01"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full bg-transparent text-3xl font-bold text-white placeholder-slate-700 tabular-nums outline-none border-0 p-0"
          />
        </div>
      </div>

      {/* ── Category, expenses only ── */}
      {source.kind === 'expense' && (
        <div className="mb-4">
          <p className={label}>Category</p>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <button key={c.key} onClick={() => setCategory(c.key)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  category === c.key ? `${c.color} text-white` : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
                }`}>
                <span>{c.icon}</span><span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Income source ── */}
      {move?.kind === 'earned' && (
        <div className="mb-4">
          <p className={label}>Source</p>
          <div className="flex flex-wrap gap-2">
            {INCOME_SOURCES.map(s => (
              <button key={s.key} onClick={() => setSrcKind(s.key)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  srcKind === s.key ? 'border-emerald-500 bg-emerald-500/15 text-white' : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
                }`}>
                <span>{s.icon}</span><span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Wallet ── */}
      {needsWallet && (
        <div className="mb-4">
          <p className={label}>{isTransfer ? 'From wallet' : 'Wallet'}</p>
          <WalletPicker value={walletId} onChange={setWalletId} />
        </div>
      )}

      {isTransfer && (
        <div className="mb-4">
          <p className={label}>To wallet</p>
          <WalletPicker value={toWallet} onChange={setToWallet} />
        </div>
      )}

      {/* ── Fee, only where one can be charged ── */}
      {move && (move.kind === 'moved' || move.kind === 'withdrawn') && (
        <div className="mb-4">
          <p className={label}>Fee</p>
          <input type="number" inputMode="decimal" min="0" step="0.01"
            value={fee} onChange={e => setFee(e.target.value)} className={field} />
        </div>
      )}

      {/* ── Split ── */}
      {source.kind === 'expense' && (
        <div className="mb-4">
          <SplitPanel total={typed} currency={settings.currency} value={split} onChange={setSplit} />
        </div>
      )}

      {/* ── Note and date ── */}
      <div className="mb-4">
        <p className={label}>Note</p>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="Optional" className={field} />
      </div>

      <div className="mb-5">
        <p className={label}>Date</p>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className={`${field} [color-scheme:dark]`} />
      </div>

      {source.kind === 'expense' && myShare <= 0 && typed > 0 && (
        <p className="mb-3 text-xs text-amber-400">
          {owedTotal > typed
            ? 'More is owed back to you than was paid out.'
            : 'None of this is yours, so there is no expense left to keep — delete it and log the debt on its own instead.'}
        </p>
      )}

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onClose}
          className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors">
          Cancel
        </button>
        <button onClick={save} disabled={!canSave || saving}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </BottomSheet>
  );
}
