'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp, fmt } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import BottomSheet from '@/components/BottomSheet';
import { ScrollLock } from '@/components/ModalLock';
import WalletCard from '@/components/WalletCard';
import { WALLET_PRESET_GROUPS, ALL_WALLET_PRESETS } from '@/lib/walletPresets';
import { PlusIcon, WalletIcon, CogIcon, ChevronDownIcon } from '@/components/Icons';

const ICONS = ['💳', '🏦', '💵', '💰', '🪙', '📱', '🏧', '💼'];

export default function WalletsPage() {
  const { wallets, addWallet, deleteWallet, settings } = useApp();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('💳');
  const [newBalance, setNewBalance] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addWallet({ name: newName.trim(), icon: newIcon, balance: parseFloat(newBalance) || 0 });
    setShowAdd(false);
    setNewName('');
    setNewBalance('');
    setNewIcon('💳');
  };

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          <header className="flex items-center justify-between pt-14 pb-5 md:pt-10 md:pb-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest">All Wallets</p>
              <p className="text-2xl font-bold text-white mt-0.5">{fmt(totalBalance, settings.currency)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white active:bg-blue-700 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Add Wallet</span>
              </button>
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
              >
                <CogIcon className="w-5 h-5 text-slate-400" />
              </Link>
            </div>
          </header>

          {wallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 mb-5">
                <WalletIcon className="w-10 h-10 text-slate-600" />
              </div>
              <p className="text-white font-semibold text-lg mb-2">No wallets yet</p>
              <p className="text-sm text-slate-500 max-w-xs mb-6">Add your first wallet to start tracking your balances.</p>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white"
              >
                <PlusIcon className="w-4 h-4" /> Add Wallet
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {wallets.map(wallet => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  onExpense={() => router.push(`/expenses/new?walletId=${wallet.id}`)}
                  // The cash wallet is a fixture of the account: it is the default
                  // funding wallet and the place withdrawals land, so it has no
                  // delete control. Omitting the handler hides the trash entirely.
                  onDelete={
                    wallet.id === settings.cashWalletId
                      ? undefined
                      : () => setConfirmDelete(wallet.id)
                  }
                />
              ))}
            </div>
          )}

        </div>
      </div>

      <BottomNav />

      {/* Add Wallet Sheet */}
      {showAdd && (
        <BottomSheet onClose={() => setShowAdd(false)}>
          <p className="mb-5 text-center font-semibold text-white text-lg">New Wallet</p>

            <p className="mb-2 text-xs text-slate-500">Quick pick</p>
            <div className="relative mb-4">
              <select
                // Derived, not stored: typing a custom name below clears the
                // selection on its own rather than leaving a stale bank shown.
                value={ALL_WALLET_PRESETS.some(p => p.name === newName) ? newName : ''}
                onChange={e => {
                  const found = ALL_WALLET_PRESETS.find(p => p.name === e.target.value);
                  if (found) { setNewName(found.name); setNewIcon(found.icon); }
                }}
                className="w-full min-h-[52px] appearance-none rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3.5 pr-10 text-base text-white outline-none focus:border-blue-500/50"
              >
                <option value="" className="bg-[#111827]">Choose a bank or e-wallet…</option>
                {WALLET_PRESET_GROUPS.map(group => (
                  <optgroup key={group.label} label={group.label} className="bg-[#111827]">
                    {group.presets.map(p => (
                      <option key={p.name} value={p.name} className="bg-[#111827]">
                        {p.icon} {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>

            <p className="mb-2 text-xs text-slate-500">Icon</p>
            <div className="mb-4 flex gap-2 flex-wrap">
              {ICONS.map(ico => (
                <button
                  key={ico}
                  onClick={() => setNewIcon(ico)}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl border transition-colors ${newIcon === ico ? 'border-blue-500 bg-blue-500/15' : 'border-[#1e2d40] bg-white/5'}`}
                >
                  {ico}
                </button>
              ))}
            </div>

            <p className="mb-2 text-xs text-slate-500">Name</p>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. GCash, BPI, Cash"
              className="mb-4 w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500/50 text-sm"
            />

            <p className="mb-2 text-xs text-slate-500">Starting Balance</p>
            {/* text + inputMode rather than type="number": no stepper on any
                platform, and mobile still gets the numeric keypad. */}
            <input
              type="text"
              inputMode="decimal"
              value={newBalance}
              onChange={e => setNewBalance(e.target.value)}
              placeholder="0.00"
              className="mb-5 w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500/50 text-sm"
            />

            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white active:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Add Wallet
            </button>
        </BottomSheet>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmDelete(null)}>
          <ScrollLock />
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-[#111827] border border-[#1e2d40] p-6 text-center"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-white mb-1">Delete wallet?</p>
            <p className="text-sm text-slate-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-300">Cancel</button>
              <button
                onClick={() => { deleteWallet(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
