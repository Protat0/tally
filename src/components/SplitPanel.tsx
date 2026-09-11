'use client';

import { useState } from 'react';
import { useApp, fmt, round2 } from './AppContext';
import PersonAvatar from './PersonAvatar';
import { XIcon } from './Icons';

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
  const { debtPeople, addDebtPerson } = useApp();

  // Someone's first appearance is often the split that created the debt, so a
  // person can be named here rather than sending the user to the debt board and
  // back. Local state: a half-typed name is not part of the split.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState('');
  const [saving, setSaving]     = useState(false);

  const owedTotal = value?.mode === 'wallet'
    ? value.owedToMe.reduce((s, o) => s + o.amount, 0)
    : 0;
  const myShare = round2(total - owedTotal);

  const nameOf = (id: string) => debtPeople.find(p => p.id === id)?.name ?? 'someone';

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

  const cancelCreate = () => { setCreating(false); setNewName(''); };

  // Create, then do the thing the user opened the form to do: name the payer in
  // person mode, or start them owing you in wallet mode.
  const createPerson = async () => {
    const name = newName.trim();
    if (!name || saving || !value) return;
    setSaving(true);
    const id = await addDebtPerson({ name, emoji: '' });
    setSaving(false);
    if (!id) return;
    if (value.mode === 'person') setPaidBy(id);
    else addRow(id);
    cancelCreate();
  };

  // The chip that opens the form, and the form itself. Both people rows show
  // them, so a person can be added from whichever side of the split needs one.
  const newPersonUI = (
    <>
      <button
        onClick={() => (creating ? cancelCreate() : setCreating(true))}
        className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
          creating
            ? 'border-primary bg-primary-tint text-ink'
            : 'border-dashed border-line bg-raised text-primary-text'
        }`}
      >
        + New person
      </button>
      {creating && (
        <div className="mt-1 w-full rounded-xl border border-line bg-raised p-3">
          <div className="flex items-center gap-2">
            <PersonAvatar name={newName} />
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createPerson(); }}
              placeholder="Name"
              autoFocus
              className="flex-1 min-w-0 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary"
            />
            <button
              onClick={createPerson}
              disabled={!newName.trim() || saving}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </>
  );

  const evenly = () => {
    if (!value) return;
    const parts = splitEvenly(total, value.owedToMe.length + 1); // +1 for you
    onChange({
      ...value,
      owedToMe: value.owedToMe.map((o, i) => ({ ...o, amount: parts[i + 1] })),
    });
  };

  return (
    <div className="rounded-xl border border-line bg-raised px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink">Split this expense</span>
        <button
          type="button"
          onClick={() => onChange(value ? null : { mode: 'wallet', paidByPersonId: null, owedToMe: [] })}
          aria-pressed={value !== null}
          aria-label="Split this expense"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            value ? 'bg-primary' : 'bg-line'
          }`}
        >
          {/* `left-0.5` anchors the knob: without a horizontal anchor an absolute
              child starts from its static position, which a button's centred text
              alignment puts mid-track — the knob then reads as "on" at rest and
              slides out of the track when it really is on. */}
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white elev-knob transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {value && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => setMode('wallet')}
              className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                value.mode === 'wallet'
                  ? 'border-primary bg-primary-tint text-ink'
                  : 'border-line bg-raised text-ink-2'
              }`}
            >
              I paid
            </button>
            <button
              onClick={() => setMode('person')}
              className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                value.mode === 'person'
                  ? 'border-primary bg-primary-tint text-ink'
                  : 'border-line bg-raised text-ink-2'
              }`}
            >
              Someone paid
            </button>
          </div>

          {value.mode === 'person' ? (
            <>
              <p className="text-xs text-ink-3 mb-2">Paid by</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {debtPeople.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPaidBy(p.id)}
                    className={`flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      value.paidByPersonId === p.id
                        ? 'border-primary bg-primary-tint text-ink'
                        : 'border-line bg-raised text-ink-2'
                    }`}
                  >
                    <PersonAvatar name={p.name} size="xs" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
                {newPersonUI}
              </div>
              {value.paidByPersonId ? (
                <p className="text-[11px] text-ink-4">
                  No wallet moves. You owe {nameOf(value.paidByPersonId)} {fmt(total, currency)}.
                </p>
              ) : (
                <p className="text-[11px] text-warning-text/80">
                  Pick who paid — this expense needs someone to owe.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-ink-3 mb-2">Owes me</p>
              {value.owedToMe.map(r => (
                <div key={r.personId} className="flex items-center gap-2 mb-2">
                  <PersonAvatar name={nameOf(r.personId)} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-sm text-ink">{nameOf(r.personId)}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={r.amount || ''}
                    onChange={ev => setAmount(r.personId, parseFloat(ev.target.value) || 0)}
                    placeholder="0.00"
                    className="w-24 rounded-lg bg-canvas border border-line px-2.5 py-1.5 text-sm text-ink text-right outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => removeRow(r.personId)}
                    className="text-ink-3 px-1"
                    aria-label={`Remove ${nameOf(r.personId)}`}
                  >
                    <XIcon className="h-4 w-4" />
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
                      className="flex items-center gap-1.5 rounded-lg border border-dashed border-line bg-raised px-2.5 py-1.5 text-xs text-primary-text"
                    >
                      <PersonAvatar name={p.name} size="xs" />
                      <span className="truncate">+ {p.name}</span>
                    </button>
                  ))}
                {newPersonUI}
                {value.owedToMe.length > 0 && (
                  <button
                    onClick={evenly}
                    className="rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs text-ink-2"
                  >
                    Split evenly
                  </button>
                )}
              </div>

              <div className="flex justify-between border-t border-line pt-3 text-sm">
                <span className="text-ink-2">Your share</span>
                <span className={`font-semibold tabular-nums ${myShare < 0 ? 'text-danger-text' : 'text-ink'}`}>
                  {fmt(myShare, currency)}
                </span>
              </div>
              {myShare < 0 && (
                <p className="mt-1 text-[11px] text-danger-text">
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
