'use client';

import { useState } from 'react';
import { useApp, fmt, ShopeePayment } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { ScrollLock } from '@/components/ModalLock';
import { useSwipeToClose } from '@/components/useSwipeToClose';
import { PlusIcon, BagIcon, AlertIcon, CheckIcon, TrashIcon } from '@/components/Icons';

const STATUS_STYLE: Record<ShopeePayment['status'], string> = {
  paid: 'bg-emerald-500/15 text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-400',
  upcoming: 'bg-slate-500/15 text-slate-400',
};

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

export default function ShopeePage() {
  const {
    shopeeSchedule, shopeeRemainingBalance, shopeeDebtFreeDate,
    shopeeNewPurchaseLock, setShopeeNewPurchaseLock,
    addShopeePayment, updateShopeePayment, deleteShopeePayment,
    settings,
  } = useApp();

  const [showAdd, setShowAdd] = useState(false);
  const swipe = useSwipeToClose(() => setShowAdd(false));
  const [newMonth, setNewMonth] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const handleAdd = () => {
    if (!newMonth || !newAmount) return;
    addShopeePayment({ month: newMonth, amount: parseFloat(newAmount), status: 'upcoming' });
    setShowAdd(false);
    setNewMonth('');
    setNewAmount('');
  };

  const sorted = [...shopeeSchedule].sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-3xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Shopee Pay Later"
            right={
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            }
          />

          <div className="space-y-4">
            {/* Lock warning */}
            {shopeeNewPurchaseLock && (
              <div className="flex items-start gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3.5">
                <AlertIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-400">New purchase lock is active</p>
                  <p className="text-xs text-red-400/70 mt-0.5">Avoid adding new Shopee items until your balance clears.</p>
                </div>
                <button onClick={() => setShopeeNewPurchaseLock(false)} className="text-xs text-red-400/60 shrink-0">
                  Dismiss
                </button>
              </div>
            )}

            {/* Summary card */}
            {shopeeSchedule.length > 0 ? (
              <div className="rounded-2xl bg-gradient-to-br from-[#1a1030] to-[#110d28] border border-purple-800/30 p-6 md:p-8">
                <p className="text-xs text-purple-400/70 uppercase tracking-widest mb-1">Remaining Balance</p>
                <p className="text-4xl md:text-5xl font-bold text-white mb-1">{fmt(shopeeRemainingBalance, settings.currency)}</p>
                {shopeeDebtFreeDate && (
                  <p className="text-xs text-slate-500">
                    Debt-free by <span className="text-purple-400">{formatMonth(shopeeDebtFreeDate)}</span>
                  </p>
                )}
                {!shopeeNewPurchaseLock && shopeeRemainingBalance > 0 && (
                  <button
                    onClick={() => setShopeeNewPurchaseLock(true)}
                    className="mt-4 text-xs text-amber-400/80 underline underline-offset-2"
                  >
                    Enable new purchase lock
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 mb-5">
                  <BagIcon className="w-10 h-10 text-slate-600" />
                </div>
                <p className="text-white font-semibold text-lg mb-2">No schedule set up</p>
                <p className="text-sm text-slate-500 max-w-xs mb-6">Add your monthly Shopee Pay Later instalments.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white"
                >
                  <PlusIcon className="w-4 h-4" /> Add Instalment
                </button>
              </div>
            )}

            {/* Schedule list */}
            {sorted.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 px-1">Payment Schedule</p>
                {sorted.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3.5">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{formatMonth(p.month)}</p>
                      <p className="text-xs text-slate-500">{fmt(p.amount, settings.currency)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[p.status]}`}>
                      {p.status}
                    </span>
                    {p.status !== 'paid' && (
                      <button
                        onClick={() => updateShopeePayment(p.id, { status: 'paid' })}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 active:bg-emerald-500/20"
                      >
                        <CheckIcon className="w-4 h-4 text-emerald-400" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteShopeePayment(p.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full active:bg-white/10"
                    >
                      <TrashIcon className="w-4 h-4 text-slate-600" />
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
            className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-10 md:pb-6"
            onClick={e => e.stopPropagation()}
            style={swipe.style}
            {...swipe.handlers}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            <p className="mb-5 text-center font-semibold text-white text-lg">Add Instalment</p>
            <p className="mb-2 text-xs text-slate-500">Month</p>
            <input
              type="month"
              value={newMonth}
              onChange={e => setNewMonth(e.target.value)}
              className="mb-4 w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white outline-none focus:border-blue-500/50 text-sm [color-scheme:dark]"
              autoFocus
            />
            <p className="mb-2 text-xs text-slate-500">Amount</p>
            <input
              type="number"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              placeholder="0.00"
              className="mb-5 w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500/50 text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={!newMonth || !newAmount}
              className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
