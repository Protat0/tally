'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './AppContext';
import { ScrollLock, useAnyModalOpen } from './ModalLock';
import { useSwipeToClose } from './useSwipeToClose';
import { PlusIcon, XIcon, ReceiptIcon, BoltIcon } from './Icons';

const HIDDEN = ['/auth', '/expenses/new'];

export default function GlobalFAB() {
  const pathname = usePathname();
  const { settings, logApplianceUsage, refundApplianceUsage } = useApp();
  const { appliances } = settings;
  // Any modal anywhere — including this component's own two — covers the FAB.
  const modalOpen = useAnyModalOpen();

  const [open, setOpen]         = useState(false);
  const [electric, setElectric] = useState(false);
  const [refund, setRefund]     = useState(false);
  const [appId, setAppId]       = useState('');
  const [hrs, setHrs]           = useState('');
  const [mins, setMins]         = useState('');

  const closeAll = () => {
    setOpen(false); setElectric(false); setRefund(false);
    setAppId(''); setHrs(''); setMins('');
  };

  // Both modals close the same way, so one gesture instance serves both —
  // only ever one of them is mounted at a time.
  const swipe = useSwipeToClose(closeAll);

  // Every hook must run before this early return, or the hook order changes
  // as you navigate on and off the hidden routes.
  if (HIDDEN.includes(pathname)) return null;

  const totalMinutes = (parseFloat(hrs) || 0) * 60 + (parseFloat(mins) || 0);
  const canLog = !!appId && totalMinutes > 0;

  const handleLog = () => {
    if (!canLog) return;
    logApplianceUsage(appId, totalMinutes);
    closeAll();
  };

  const handleRefund = () => {
    if (!canLog) return;
    refundApplianceUsage(appId, totalMinutes);
    closeAll();
  };

  return (
    <>
      {/* Backdrop — closes FAB menu on tap */}
      {open && <div className="fixed inset-0 z-40" onClick={closeAll} />}

      {/* FAB stack — hidden entirely while a modal is up, so it can't sit on
          top of a sheet or be tapped through one. */}
      <div className={`fixed z-50 flex-col items-end gap-2.5 bottom-20 md:bottom-8 right-4 md:right-8 ${
        modalOpen ? 'hidden' : 'flex'
      }`}>

        {/* Action pills — slide up when open */}
        {open && (
          <>
            <button
              onClick={() => { setOpen(false); setRefund(true); }}
              className="flex items-center gap-2.5 rounded-full bg-[#0e1420]/95 backdrop-blur border border-[#1e2d40] pl-4 pr-5 py-2.5 shadow-xl"
            >
              <BoltIcon className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-sm font-medium text-white whitespace-nowrap">Refund Electric Usage</span>
            </button>
            <button
              onClick={() => { setOpen(false); setElectric(true); }}
              className="flex items-center gap-2.5 rounded-full bg-[#0e1420]/95 backdrop-blur border border-[#1e2d40] pl-4 pr-5 py-2.5 shadow-xl"
            >
              <BoltIcon className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-white whitespace-nowrap">Log Electric Usage</span>
            </button>
            <Link
              href="/expenses/new"
              onClick={closeAll}
              className="flex items-center gap-2.5 rounded-full bg-[#0e1420]/95 backdrop-blur border border-[#1e2d40] pl-4 pr-5 py-2.5 shadow-xl"
            >
              <ReceiptIcon className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-sm font-medium text-white whitespace-nowrap">Log Expense</span>
            </Link>
          </>
        )}

        {/* Main button */}
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            open
              ? 'bg-white/10 border border-white/10 rotate-45'
              : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/50'
          }`}
        >
          <PlusIcon className="w-7 h-7 text-white" />
        </button>
      </div>

      {/* Refund electric usage modal */}
      {refund && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          onClick={closeAll}
        >
          <ScrollLock />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
            onClick={e => e.stopPropagation()}
            style={swipe.style}
            {...swipe.handlers}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 md:hidden" />

            <div className="flex items-start justify-between mb-1">
              <p className="font-semibold text-white text-lg">Refund Electric Usage</p>
              <button onClick={closeAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Logged too much by mistake? Remove the time manually.
            </p>

            {appliances.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-slate-500 mb-3">No appliances set up yet.</p>
                <Link href="/expenses#electric" onClick={closeAll}
                  className="text-sm text-blue-400 underline underline-offset-2">
                  Set up appliances →
                </Link>
              </div>
            ) : (
              <>
                {/* Appliance picker */}
                <p className="text-xs text-slate-500 mb-2">Which appliance?</p>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {appliances.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setAppId(a.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        appId === a.id
                          ? 'border-rose-500/50 bg-rose-500/10'
                          : 'border-[#1e2d40] bg-white/5 hover:bg-white/8'
                      }`}
                    >
                      <BoltIcon className={`w-4 h-4 shrink-0 ${appId === a.id ? 'text-rose-400' : 'text-slate-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{a.name}</p>
                        <p className="text-[10px] text-slate-500">{a.wattage}W</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Duration */}
                <p className="text-xs text-slate-500 mb-2">How much time to remove?</p>
                <div className="flex gap-3 mb-5">
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      value={hrs}
                      onChange={e => setHrs(e.target.value)}
                      placeholder="0"
                      min="0" max="24"
                      className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-3 py-3 text-center text-lg font-semibold text-white placeholder-slate-600 outline-none focus:border-rose-500/50"
                    />
                    <span className="text-sm text-slate-500 shrink-0">hr</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      value={mins}
                      onChange={e => setMins(e.target.value)}
                      placeholder="0"
                      min="0" max="59"
                      className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-3 py-3 text-center text-lg font-semibold text-white placeholder-slate-600 outline-none focus:border-rose-500/50"
                    />
                    <span className="text-sm text-slate-500 shrink-0">min</span>
                  </div>
                </div>

                <button
                  onClick={handleRefund}
                  disabled={!canLog}
                  className="w-full rounded-xl bg-rose-600 py-3.5 font-semibold text-white disabled:opacity-30 hover:bg-rose-500 transition-colors"
                >
                  Remove Usage
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Electric usage modal */}
      {electric && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          onClick={closeAll}
        >
          <ScrollLock />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
            onClick={e => e.stopPropagation()}
            style={swipe.style}
            {...swipe.handlers}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 md:hidden" />

            <div className="flex items-start justify-between mb-1">
              <p className="font-semibold text-white text-lg">Log Electric Usage</p>
              <button onClick={closeAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Forgot to toggle an appliance? Add the time manually.
            </p>

            {appliances.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-slate-500 mb-3">No appliances set up yet.</p>
                <Link href="/expenses#electric" onClick={closeAll}
                  className="text-sm text-blue-400 underline underline-offset-2">
                  Set up appliances →
                </Link>
              </div>
            ) : (
              <>
                {/* Appliance picker */}
                <p className="text-xs text-slate-500 mb-2">Which appliance?</p>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {appliances.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setAppId(a.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        appId === a.id
                          ? 'border-amber-500/50 bg-amber-500/10'
                          : 'border-[#1e2d40] bg-white/5 hover:bg-white/8'
                      }`}
                    >
                      <BoltIcon className={`w-4 h-4 shrink-0 ${appId === a.id ? 'text-amber-400' : 'text-slate-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{a.name}</p>
                        <p className="text-[10px] text-slate-500">{a.wattage}W</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Duration */}
                <p className="text-xs text-slate-500 mb-2">How long was it on?</p>
                <div className="flex gap-3 mb-5">
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      value={hrs}
                      onChange={e => setHrs(e.target.value)}
                      placeholder="0"
                      min="0" max="24"
                      className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-3 py-3 text-center text-lg font-semibold text-white placeholder-slate-600 outline-none focus:border-amber-500/50"
                    />
                    <span className="text-sm text-slate-500 shrink-0">hr</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      value={mins}
                      onChange={e => setMins(e.target.value)}
                      placeholder="0"
                      min="0" max="59"
                      className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-3 py-3 text-center text-lg font-semibold text-white placeholder-slate-600 outline-none focus:border-amber-500/50"
                    />
                    <span className="text-sm text-slate-500 shrink-0">min</span>
                  </div>
                </div>

                <button
                  onClick={handleLog}
                  disabled={!canLog}
                  className="w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-black disabled:opacity-30 hover:bg-amber-400 transition-colors"
                >
                  Add Usage
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
