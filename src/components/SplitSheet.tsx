'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import BottomSheet from './BottomSheet';

// Split `total` into `n` parts at 2 decimals. Remainder cents go to the earliest
// parts so the parts always sum back to exactly `total`.
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

export interface SplitResult {
  mode: 'wallet' | 'person';
  paidByPersonId: string | null;
  owedToMe: { personId: string; amount: number }[];
}

interface Props {
  total: number;
  currency: string;
  initial: SplitResult | null;
  onClose: () => void;
  onApply: (r: SplitResult) => void;
}

export default function SplitSheet({ total, currency, initial, onClose, onApply }: Props) {
  const { debtPeople } = useApp();

  const [mode, setMode] = useState<'wallet' | 'person'>(initial?.mode ?? 'wallet');
  const [paidBy, setPaidBy] = useState<string | null>(initial?.paidByPersonId ?? null);
  const [rows, setRows] = useState<{ personId: string; amount: string }[]>(
    initial?.owedToMe.map(o => ({ personId: o.personId, amount: String(o.amount) })) ?? [],
  );

  const owedTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const myShare = mode === 'wallet' ? total - owedTotal : total;
  // Over-allocating is the only way to make this incoherent, so it is the only
  // thing blocked. A share of exactly zero is legitimate: you spotted them.
  const valid = mode === 'person'
    ? paidBy !== null
    : rows.length > 0 && rows.every(r => (parseFloat(r.amount) || 0) > 0) && myShare >= 0;

  const addRow = (personId: string) => {
    if (rows.some(r => r.personId === personId)) return;
    setRows(prev => [...prev, { personId, amount: '' }]);
  };

  const evenly = () => {
    const parts = splitEvenly(total, rows.length + 1); // +1 for you
    setRows(prev => prev.map((r, i) => ({ ...r, amount: String(parts[i + 1]) })));
  };

  const nameOf = (id: string) => debtPeople.find(p => p.id === id)?.name ?? 'someone';
  const emojiOf = (id: string) => debtPeople.find(p => p.id === id)?.emoji ?? '🧑';

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-1">Who&apos;s in on this?</p>
      <p className="text-xs text-slate-500 mb-4">{fmt(total, currency)} total</p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setMode('wallet')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            mode === 'wallet'
              ? 'border-blue-500 bg-blue-500/15 text-white'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          I paid
        </button>
        <button
          onClick={() => setMode('person')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            mode === 'person'
              ? 'border-blue-500 bg-blue-500/15 text-white'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          Someone paid
        </button>
      </div>

      {mode === 'person' ? (
        <>
          <p className="text-xs text-slate-500 mb-2">Paid by</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {debtPeople.map(p => (
              <button
                key={p.id}
                onClick={() => setPaidBy(p.id)}
                className={`flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  paidBy === p.id
                    ? 'border-blue-500 bg-blue-500/15 text-white'
                    : 'border-[#1e2d40] bg-white/5 text-slate-400'
                }`}
              >
                <span className="shrink-0">{p.emoji}</span>
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-600">
            No wallet moves. You owe {paidBy ? nameOf(paidBy) : 'them'} {fmt(total, currency)}.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">Owes me</p>
          {rows.map((r, i) => (
            <div key={r.personId} className="flex items-center gap-2 mb-2">
              <span className="shrink-0">{emojiOf(r.personId)}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-white">{nameOf(r.personId)}</span>
              <input
                type="number"
                inputMode="decimal"
                value={r.amount}
                onChange={ev => setRows(prev =>
                  prev.map((x, j) => j === i ? { ...x, amount: ev.target.value } : x))}
                placeholder="0.00"
                className="w-24 rounded-lg bg-white/5 border border-[#1e2d40] px-2.5 py-1.5 text-sm text-white text-right outline-none focus:border-blue-500/50"
              />
              <button
                onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                className="text-slate-500 px-1"
                aria-label={`Remove ${nameOf(r.personId)}`}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 mt-3 mb-3">
            {debtPeople
              .filter(p => !rows.some(r => r.personId === p.id))
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => addRow(p.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#1e2d40] bg-white/5 px-2.5 py-1.5 text-xs text-blue-400"
                >
                  <span>{p.emoji}</span>
                  <span className="truncate">+ {p.name}</span>
                </button>
              ))}
            {rows.length > 0 && (
              <button
                onClick={evenly}
                className="rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1.5 text-xs text-slate-300"
              >
                Split evenly
              </button>
            )}
          </div>

          <div className="flex justify-between border-t border-[#1e2d40] pt-3 text-sm">
            <span className="text-slate-400">Your share</span>
            <span className={`font-semibold tabular-nums ${myShare < 0 ? 'text-red-400' : 'text-white'}`}>
              {fmt(myShare, currency)}
            </span>
          </div>
          {myShare < 0 && (
            <p className="mt-1 text-[11px] text-red-400">
              That is more than the total.
            </p>
          )}
        </>
      )}

      <button
        onClick={() => onApply({
          mode,
          paidByPersonId: mode === 'person' ? paidBy : null,
          owedToMe: mode === 'wallet'
            ? rows.map(r => ({ personId: r.personId, amount: parseFloat(r.amount) || 0 }))
            : [],
        })}
        disabled={!valid}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        Done
      </button>
    </BottomSheet>
  );
}
