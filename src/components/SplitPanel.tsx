'use client';

import { useApp, fmt, round2 } from './AppContext';

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
  value: SplitResult | null;
  onChange: (next: SplitResult | null) => void;
}

// Controlled, inline: there is no Done button here, so every interaction below
// calls onChange immediately with the new value. State lives in the parent —
// this component only renders `value` and total.
export default function SplitPanel({ total, currency, value, onChange }: Props) {
  const { debtPeople } = useApp();

  const owedTotal = value?.mode === 'wallet'
    ? value.owedToMe.reduce((s, o) => s + o.amount, 0)
    : 0;
  const myShare = round2(total - owedTotal);

  const nameOf = (id: string) => debtPeople.find(p => p.id === id)?.name ?? 'someone';
  const emojiOf = (id: string) => debtPeople.find(p => p.id === id)?.emoji ?? '🧑';

  const setMode = (mode: 'wallet' | 'person') => {
    if (!value) return;
    onChange({
      mode,
      paidByPersonId: mode === 'person' ? value.paidByPersonId : null,
      owedToMe: mode === 'wallet' ? value.owedToMe : [],
    });
  };

  const setPaidBy = (personId: string) => {
    if (!value) return;
    onChange({ ...value, paidByPersonId: personId });
  };

  const addRow = (personId: string) => {
    if (!value || value.owedToMe.some(o => o.personId === personId)) return;
    onChange({ ...value, owedToMe: [...value.owedToMe, { personId, amount: 0 }] });
  };

  const removeRow = (personId: string) => {
    if (!value) return;
    onChange({ ...value, owedToMe: value.owedToMe.filter(o => o.personId !== personId) });
  };

  const setAmount = (personId: string, amount: number) => {
    if (!value) return;
    onChange({
      ...value,
      owedToMe: value.owedToMe.map(o => o.personId === personId ? { ...o, amount } : o),
    });
  };

  const evenly = () => {
    if (!value) return;
    const parts = splitEvenly(total, value.owedToMe.length + 1); // +1 for you
    onChange({
      ...value,
      owedToMe: value.owedToMe.map((o, i) => ({ ...o, amount: parts[i + 1] })),
    });
  };

  return (
    <div className="rounded-xl border border-[#1e2d40] bg-white/5 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white">Split this expense</span>
        <button
          type="button"
          onClick={() => onChange(value ? null : { mode: 'wallet', paidByPersonId: null, owedToMe: [] })}
          aria-pressed={value !== null}
          aria-label="Split this expense"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            value ? 'bg-blue-600' : 'bg-white/10'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {value && (
        <div className="mt-3 border-t border-[#1e2d40] pt-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => setMode('wallet')}
              className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                value.mode === 'wallet'
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-[#1e2d40] bg-white/5 text-slate-400'
              }`}
            >
              I paid
            </button>
            <button
              onClick={() => setMode('person')}
              className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                value.mode === 'person'
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-[#1e2d40] bg-white/5 text-slate-400'
              }`}
            >
              Someone paid
            </button>
          </div>

          {value.mode === 'person' ? (
            <>
              <p className="text-xs text-slate-500 mb-2">Paid by</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {debtPeople.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPaidBy(p.id)}
                    className={`flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      value.paidByPersonId === p.id
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
                No wallet moves. You owe {value.paidByPersonId ? nameOf(value.paidByPersonId) : 'them'} {fmt(total, currency)}.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-2">Owes me</p>
              {value.owedToMe.map(r => (
                <div key={r.personId} className="flex items-center gap-2 mb-2">
                  <span className="shrink-0">{emojiOf(r.personId)}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-white">{nameOf(r.personId)}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={r.amount || ''}
                    onChange={ev => setAmount(r.personId, parseFloat(ev.target.value) || 0)}
                    placeholder="0.00"
                    className="w-24 rounded-lg bg-white/5 border border-[#1e2d40] px-2.5 py-1.5 text-sm text-white text-right outline-none focus:border-blue-500/50"
                  />
                  <button
                    onClick={() => removeRow(r.personId)}
                    className="text-slate-500 px-1"
                    aria-label={`Remove ${nameOf(r.personId)}`}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap gap-2 mt-3 mb-3">
                {debtPeople
                  .filter(p => !value.owedToMe.some(o => o.personId === p.id))
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
                {value.owedToMe.length > 0 && (
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
                  That is more than the total — lower it or the amount above.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
