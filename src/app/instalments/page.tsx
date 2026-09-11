'use client';

import { useState } from 'react';
import { useApp, fmt, InstalmentPayment } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { ScrollLock } from '@/components/ModalLock';
import { useSwipeToClose } from '@/components/useSwipeToClose';
import { PlusIcon, BagIcon, AlertIcon, CheckIcon, TrashIcon } from '@/components/Icons';

const STATUS_STYLE: Record<InstalmentPayment['status'], string> = {
  paid: 'bg-growth-tint text-growth-text',
  pending: 'bg-warning-tint text-warning-text',
  upcoming: 'bg-raised text-ink-2',
};

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

export default function InstalmentsPage() {
  const {
    instalmentSchedule, instalmentRemainingBalance, instalmentDebtFreeDate,
    instalmentNewPurchaseLock, setInstalmentNewPurchaseLock,
    addInstalmentPayment, updateInstalmentPayment, deleteInstalmentPayment,
    settings,
  } = useApp();

  const [showAdd, setShowAdd] = useState(false);
  const swipe = useSwipeToClose(() => setShowAdd(false));
  const [newMonth, setNewMonth] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const handleAdd = () => {
    if (!newMonth || !newAmount) return;
    addInstalmentPayment({ month: newMonth, amount: parseFloat(newAmount), status: 'upcoming' });
    setShowAdd(false);
    setNewMonth('');
    setNewAmount('');
  };

  const sorted = [...instalmentSchedule].sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="min-h-screen bg-canvas">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-3xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Instalments"
            right={
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            }
          />

          <div className="space-y-4">
            {/* Lock warning */}
            {instalmentNewPurchaseLock && (
              <div className="flex items-start gap-3 rounded-2xl bg-danger-tint border border-danger-edge px-4 py-3.5">
                <AlertIcon className="w-5 h-5 text-danger-text shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-danger-text">New purchase lock is active</p>
                  <p className="text-xs text-danger-text/70 mt-0.5">Avoid adding new instalment purchases until your balance clears.</p>
                </div>
                <button onClick={() => setInstalmentNewPurchaseLock(false)} className="text-xs text-danger-text/60 shrink-0">
                  Dismiss
                </button>
              </div>
            )}

            {/* Summary card */}
            {instalmentSchedule.length > 0 ? (
              <div className="rounded-2xl bg-surface border border-line p-6 md:p-8">
                <p className="text-xs text-primary-text/70 uppercase tracking-widest mb-1">Remaining Balance</p>
                <p className="text-4xl md:text-5xl font-bold text-ink mb-1">{fmt(instalmentRemainingBalance, settings.currency)}</p>
                {instalmentDebtFreeDate && (
                  <p className="text-xs text-ink-3">
                    Debt-free by <span className="text-primary-text">{formatMonth(instalmentDebtFreeDate)}</span>
                  </p>
                )}
                {!instalmentNewPurchaseLock && instalmentRemainingBalance > 0 && (
                  <button
                    onClick={() => setInstalmentNewPurchaseLock(true)}
                    className="mt-4 text-xs text-warning-text/80 underline underline-offset-2"
                  >
                    Enable new purchase lock
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-raised mb-5">
                  <BagIcon className="w-10 h-10 text-ink-4" />
                </div>
                <p className="text-ink font-semibold text-lg mb-2">No schedule set up</p>
                <p className="text-sm text-ink-3 max-w-xs mb-6">Add your monthly instalment payments.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary"
                >
                  <PlusIcon className="w-4 h-4" /> Add Instalment
                </button>
              </div>
            )}

            {/* Schedule list */}
            {sorted.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-ink-3 px-1">Payment Schedule</p>
                {sorted.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl bg-surface border border-line px-4 py-3.5">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink">{formatMonth(p.month)}</p>
                      <p className="text-xs text-ink-3">{fmt(p.amount, settings.currency)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[p.status]}`}>
                      {p.status}
                    </span>
                    {p.status !== 'paid' && (
                      <button
                        onClick={() => updateInstalmentPayment(p.id, { status: 'paid' })}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-growth-tint active:bg-growth-tint"
                      >
                        <CheckIcon className="w-4 h-4 text-growth-text" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteInstalmentPayment(p.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full active:bg-line"
                    >
                      <TrashIcon className="w-4 h-4 text-ink-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Add sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowAdd(false)}>
          <ScrollLock />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-surface border border-line p-6 pb-10 md:pb-6"
            onClick={e => e.stopPropagation()}
            style={swipe.style}
            {...swipe.handlers}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line md:hidden" />
            <p className="mb-5 text-center font-semibold text-ink text-lg">Add Instalment</p>
            <p className="mb-2 text-xs text-ink-3">Month</p>
            <input
              type="month"
              value={newMonth}
              onChange={e => setNewMonth(e.target.value)}
              className="mb-4 w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink outline-none focus:border-primary text-sm [color-scheme:dark]"
              autoFocus
            />
            <p className="mb-2 text-xs text-ink-3">Amount</p>
            <input
              type="number"
              inputMode="decimal"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              placeholder="0.00"
              className="mb-5 w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={!newMonth || !newAmount}
              className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
