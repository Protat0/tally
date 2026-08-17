'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './AppContext';
import { ScrollLock, useAnyModalOpen } from './ModalLock';
import { useSwipeToClose } from './useSwipeToClose';
import {
  PlusIcon, XIcon, ReceiptIcon, BoltIcon, UsersIcon, ShieldIcon,
  WalletIcon, ArrowDownIcon, TrendingUpIcon,
} from './Icons';

const HIDDEN = ['/auth', '/expenses/new'];

// The action sheet's contents. `href` hands off to the page that owns the flow;
// `opens` raises one of this component's own modals. Ordered by how often the
// thing gets logged, not by where it lives in the nav.
type Action = {
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  chip: string;
  tint: string;
  href?: string;
  opens?: 'electric';
};

const ACTIONS: Action[] = [
  { label: 'Expense',        Icon: ReceiptIcon,     chip: 'bg-blue-500/15',    tint: 'text-blue-400',    href: '/expenses/new' },
  { label: 'Electric usage', Icon: BoltIcon,        chip: 'bg-amber-500/15',   tint: 'text-amber-400',   opens: 'electric' },
  { label: 'Debt',           Icon: UsersIcon,       chip: 'bg-violet-500/15',  tint: 'text-violet-400',  href: '/debts' },
  { label: 'Money in / out', Icon: WalletIcon,      chip: 'bg-emerald-500/15', tint: 'text-emerald-400', href: '/wallets' },
  { label: 'Instalment',     Icon: ArrowDownIcon,   chip: 'bg-purple-500/15',  tint: 'text-purple-400',  href: '/instalments' },
  { label: 'Emergency fund', Icon: ShieldIcon,      chip: 'bg-sky-500/15',     tint: 'text-sky-400',     href: '/emergency-fund' },
  { label: 'Budget',         Icon: TrendingUpIcon,  chip: 'bg-teal-500/15',    tint: 'text-teal-400',    href: '/expenses' },
];

export default function GlobalFAB() {
  const pathname = usePathname();
  const { settings, logApplianceUsage, refundApplianceUsage } = useApp();
  const { appliances } = settings;
  // Any modal anywhere — including this component's own two — covers the FAB.
  const modalOpen = useAnyModalOpen();

  const [open, setOpen]         = useState(false);
  const [electric, setElectric] = useState(false);
  // Adding and removing appliance time ask for exactly the same two answers, so
  // they are one modal with a direction rather than two near-identical sheets.
  const [refunding, setRefunding] = useState(false);
  const [appId, setAppId]       = useState('');
  const [hrs, setHrs]           = useState('');
  const [mins, setMins]         = useState('');

  const closeAll = () => {
    setOpen(false); setElectric(false); setRefunding(false);
    setAppId(''); setHrs(''); setMins('');
  };

  const swipe = useSwipeToClose(closeAll);

  // Every hook must run before this early return, or the hook order changes
  // as you navigate on and off the hidden routes.
  if (HIDDEN.includes(pathname)) return null;

  const totalMinutes = (parseFloat(hrs) || 0) * 60 + (parseFloat(mins) || 0);
  const canLog = !!appId && totalMinutes > 0;

  const handleSubmit = () => {
    if (!canLog) return;
    if (refunding) refundApplianceUsage(appId, totalMinutes);
    else logApplianceUsage(appId, totalMinutes);
    closeAll();
  };

  // One accent for the whole modal, so the direction is legible at a glance.
  const tone = refunding
    ? { ring: 'border-rose-500/50 bg-rose-500/10', icon: 'text-rose-400', focus: 'focus:border-rose-500/50', cta: 'bg-rose-600 hover:bg-rose-500 text-white' }
    : { ring: 'border-amber-500/50 bg-amber-500/10', icon: 'text-amber-400', focus: 'focus:border-amber-500/50', cta: 'bg-amber-500 hover:bg-amber-400 text-black' };

  return (
    <>
      {/* FAB — hidden entirely while a modal is up, so it can't sit on top of a
          sheet or be tapped through one. The action sheet counts as a modal, so
          this also hides the button while its own menu is open. */}
      <div className={`fixed z-50 bottom-20 md:bottom-8 right-4 md:right-8 ${
        modalOpen ? 'hidden' : 'block'
      }`}>
        <button
          onClick={() => setOpen(true)}
          aria-label="Log something"
          className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg bg-blue-600 hover:bg-blue-500 shadow-blue-900/50 transition-colors"
        >
          <PlusIcon className="w-7 h-7 text-white" />
        </button>
      </div>

      {/* Action sheet — every way into the app's data, in one place. Actions
          that write here open their own modal; the rest hand off to the page
          that owns the flow rather than duplicating it. */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={closeAll}>
          <ScrollLock />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
            onClick={e => e.stopPropagation()}
            style={swipe.style}
            {...swipe.handlers}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 md:hidden" />

            <div className="flex items-start justify-between mb-5">
              <p className="font-semibold text-white text-lg">What are you logging?</p>
              <button onClick={closeAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {ACTIONS.map(a => {
                const body = (
                  <>
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.chip}`}>
                      <a.Icon className={`w-5 h-5 ${a.tint}`} />
                    </span>
                    <span className="text-[11px] leading-tight text-center text-slate-300">{a.label}</span>
                  </>
                );
                const cls = 'flex flex-col items-center gap-2 rounded-2xl border border-[#1e2d40] bg-white/5 px-2 py-3.5 transition-colors hover:bg-white/10 active:bg-white/10';
                return a.href ? (
                  <Link key={a.label} href={a.href} onClick={closeAll} className={cls}>{body}</Link>
                ) : (
                  <button
                    key={a.label}
                    onClick={() => { setOpen(false); setElectric(true); }}
                    className={cls}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Electric usage — one sheet, two directions */}
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

            <div className="flex items-start justify-between mb-4">
              <p className="font-semibold text-white text-lg">Electric Usage</p>
              <button onClick={closeAll} className="text-slate-500 hover:text-slate-300 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Direction */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => setRefunding(false)}
                className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  refunding ? 'border-[#1e2d40] bg-white/5 text-slate-400' : 'border-amber-500/50 bg-amber-500/10 text-white'
                }`}
              >
                Add time
              </button>
              <button
                onClick={() => setRefunding(true)}
                className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  refunding ? 'border-rose-500/50 bg-rose-500/10 text-white' : 'border-[#1e2d40] bg-white/5 text-slate-400'
                }`}
              >
                Remove time
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              {refunding
                ? 'Logged too much by mistake? Remove the time manually.'
                : 'Forgot to toggle an appliance? Add the time manually.'}
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
                        appId === a.id ? tone.ring : 'border-[#1e2d40] bg-white/5 hover:bg-white/8'
                      }`}
                    >
                      <BoltIcon className={`w-4 h-4 shrink-0 ${appId === a.id ? tone.icon : 'text-slate-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{a.name}</p>
                        <p className="text-[10px] text-slate-500">{a.wattage}W</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Duration */}
                <p className="text-xs text-slate-500 mb-2">
                  {refunding ? 'How much time to remove?' : 'How long was it on?'}
                </p>
                <div className="flex gap-3 mb-5">
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={hrs}
                      onChange={e => setHrs(e.target.value)}
                      placeholder="0"
                      min="0" max="24"
                      className={`w-full rounded-xl bg-white/5 border border-[#1e2d40] px-3 py-3 text-center text-lg font-semibold text-white placeholder-slate-600 outline-none ${tone.focus}`}
                    />
                    <span className="text-sm text-slate-500 shrink-0">hr</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={mins}
                      onChange={e => setMins(e.target.value)}
                      placeholder="0"
                      min="0" max="59"
                      className={`w-full rounded-xl bg-white/5 border border-[#1e2d40] px-3 py-3 text-center text-lg font-semibold text-white placeholder-slate-600 outline-none ${tone.focus}`}
                    />
                    <span className="text-sm text-slate-500 shrink-0">min</span>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!canLog}
                  className={`w-full rounded-xl py-3.5 font-semibold disabled:opacity-30 transition-colors ${tone.cta}`}
                >
                  {refunding ? 'Remove Usage' : 'Add Usage'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
