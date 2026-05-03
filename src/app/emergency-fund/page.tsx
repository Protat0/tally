'use client';

import { useState } from 'react';
import { useApp, fmt } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { PlusIcon, ShieldIcon } from '@/components/Icons';

function ArcProgress({ value, max }: { value: number; max: number }) {
  const r = 80;
  const cx = 100;
  const cy = 100;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const startAngle = -220;
  const sweep = 260;
  const endAngle = startAngle + sweep * pct;

  const toRad = (a: number) => (a * Math.PI) / 180;
  const arcPath = (angle: number) =>
    `${cx + r * Math.cos(toRad(angle))},${cy + r * Math.sin(toRad(angle))}`;

  const describeArc = (start: number, end: number) => {
    const s = arcPath(start);
    const e = arcPath(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s} A ${r} ${r} 0 ${large} 1 ${e}`;
  };

  return (
    <svg viewBox="0 0 200 200" className="w-48 h-48">
      <path d={describeArc(startAngle, startAngle + sweep)} fill="none" stroke="#1e2d40" strokeWidth="14" strokeLinecap="round" />
      {pct > 0 && (
        <path d={describeArc(startAngle, endAngle)} fill="none" stroke="#10b981" strokeWidth="14" strokeLinecap="round" className="transition-all duration-700" />
      )}
      <text x="50%" y="48%" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" dominantBaseline="middle">
        {(pct * 100).toFixed(0)}%
      </text>
      <text x="50%" y="60%" textAnchor="middle" fill="#64748b" fontSize="8" dominantBaseline="middle">
        of goal
      </text>
    </svg>
  );
}

function milestones(target: number): number[] {
  if (target <= 0) return [];
  return [0.25, 0.5, 0.75, 1].map(f => target * f);
}

export default function EmergencyFundPage() {
  const { emergencyFund, settings, addEmergencyFundEntry } = useApp();
  const { currentAmount, entries } = emergencyFund;
  const target = settings.emergencyFundTarget;
  const { currency } = settings;

  const [showAdd, setShowAdd] = useState(false);
  const [inputAmt, setInputAmt] = useState('');
  const [inputNote, setInputNote] = useState('');

  const handleAdd = () => {
    const amt = parseFloat(inputAmt);
    if (isNaN(amt) || amt <= 0) return;
    addEmergencyFundEntry({ amount: amt, note: inputNote.trim() });
    setShowAdd(false);
    setInputAmt('');
    setInputNote('');
  };

  const projected = (() => {
    if (target <= 0 || currentAmount >= target) return null;
    const recent = entries.slice(0, 6);
    if (recent.length === 0) return null;
    const avg = recent.reduce((s, e) => s + e.amount, 0) / recent.length;
    if (avg <= 0) return null;
    const months = Math.ceil((target - currentAmount) / avg);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  })();

  const marks = milestones(target);

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-3xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Emergency Fund"
            right={
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            }
          />

          {target <= 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 mb-5">
                <ShieldIcon className="w-10 h-10 text-slate-600" />
              </div>
              <p className="text-white font-semibold text-lg mb-2">No target set</p>
              <p className="text-sm text-slate-500 max-w-xs">Set an emergency fund goal in Settings to start tracking.</p>
            </div>
          ) : (
            <div className="md:grid md:grid-cols-2 md:gap-6">
              {/* Progress + stats */}
              <div>
                <div className="flex flex-col items-center pt-2 md:pt-0 mb-6">
                  <ArcProgress value={currentAmount} max={target} />
                  <div className="mt-3 text-center">
                    <p className="text-3xl font-bold text-white">{fmt(currentAmount, currency)}</p>
                    <p className="text-sm text-slate-500">of {fmt(target, currency)} goal</p>
                    {projected && (
                      <p className="mt-1 text-xs text-emerald-400">Projected full by {projected}</p>
                    )}
                  </div>
                </div>

                {/* Milestones */}
                <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-4">
                  <p className="text-xs text-slate-500 mb-3">Milestones</p>
                  <div className="space-y-2.5">
                    {marks.map((m, i) => {
                      const labels = ['25%', '50%', '75%', '100%'];
                      const reached = currentAmount >= m;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className={`h-4 w-4 rounded-full border-2 shrink-0 ${reached ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`} />
                          <p className={`flex-1 text-sm ${reached ? 'text-white' : 'text-slate-500'}`}>
                            {labels[i]} — {fmt(m, currency)}
                          </p>
                          {reached && <span className="text-xs text-emerald-400">✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Contribution log */}
              <div>
                <p className="text-xs text-slate-500 mb-2 px-1">Contribution History</p>
                {entries.length === 0 ? (
                  <div className="rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-8 text-center">
                    <p className="text-sm text-slate-500">No contributions yet.</p>
                    <button
                      onClick={() => setShowAdd(true)}
                      className="mt-3 text-sm text-emerald-400 underline underline-offset-2"
                    >
                      Add first contribution
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entries.map(e => (
                      <div key={e.id} className="flex items-center gap-3 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3.5">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{fmt(e.amount, currency)}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(e.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {e.note ? ` · ${e.note}` : ''}
                          </p>
                        </div>
                        <span className="text-emerald-400 text-sm font-semibold">+{fmt(e.amount, currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Add contribution sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowAdd(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-10 md:pb-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            <p className="mb-5 text-center font-semibold text-white text-lg">Add Contribution</p>
            <p className="mb-2 text-xs text-slate-500">Amount</p>
            <input
              type="number"
              value={inputAmt}
              onChange={e => setInputAmt(e.target.value)}
              placeholder="0.00"
              className="mb-4 w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 text-center text-2xl font-bold"
              autoFocus
            />
            <p className="mb-2 text-xs text-slate-500">Note <span className="text-slate-600">(optional)</span></p>
            <input
              type="text"
              value={inputNote}
              onChange={e => setInputNote(e.target.value)}
              placeholder="e.g. April savings"
              className="mb-5 w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 text-sm"
            />
            <button onClick={handleAdd} disabled={!inputAmt} className="w-full rounded-xl bg-emerald-600 py-3.5 font-semibold text-white disabled:opacity-40">
              Add Contribution
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
