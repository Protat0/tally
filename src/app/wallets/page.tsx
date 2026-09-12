'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp, fmt } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import BottomSheet from '@/components/BottomSheet';
import { ScrollLock } from '@/components/ModalLock';
import WalletCard from '@/components/WalletCard';
import { ALL_WALLET_PRESETS } from '@/lib/walletPresets';
import { PlusIcon, WalletIcon, CogIcon } from '@/components/Icons';
import AppIcon from '@/components/AppIcon';
import WalletPresetPicker, { presetIcon } from '@/components/WalletPresetPicker';
import CreditCardForm from '@/components/CreditCardForm';
import { logoOf, type IconKey } from '@/lib/icons';

const ICONS: IconKey[] = ['credit-card', 'landmark', 'banknote', 'piggy-bank', 'coins', 'smartphone', 'wallet', 'briefcase'];

export default function WalletsPage() {
  const { wallets, addWallet, deleteWallet, settings } = useApp();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<'wallet' | 'card'>('wallet');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<string>('credit-card');
  const [newBalance, setNewBalance] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  // Derived, not stored: typing a custom name clears the matched preset on its
  // own rather than leaving a stale bank shown.
  const preset = ALL_WALLET_PRESETS.find(p => p.name === newName) ?? null;
  // The logo offered beside the drawn icons: the matched preset's, or one
  // already chosen before the name was edited, so it isn't lost silently.
  const logoChoice = preset?.logo ? presetIcon(preset) : logoOf(newIcon) ? newIcon : null;

  // The sheet reopens on Wallet, whichever kind was added last.
  const closeAdd = () => { setShowAdd(false); setAddKind('wallet'); };

  const handleAdd = () => {
    if (!newName.trim()) return;
    addWallet({ name: newName.trim(), icon: newIcon, balance: parseFloat(newBalance) || 0 });
    closeAdd();
    setNewName('');
    setNewBalance('');
    setNewIcon('credit-card');
  };

  return (
    <div className="min-h-screen bg-canvas">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          <header className="flex items-center justify-between pt-14 pb-5 md:pt-10 md:pb-6">
            <div>
              <p className="text-xs text-ink-3 uppercase tracking-widest">All Wallets</p>
              <p className="text-2xl font-bold text-ink mt-0.5">{fmt(totalBalance, settings.currency)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-on-primary active:bg-primary-hover transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Add Wallet</span>
              </button>
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-raised active:bg-line transition-colors md:hidden"
              >
                <CogIcon className="w-5 h-5 text-ink-2" />
              </Link>
            </div>
          </header>

          {wallets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-raised mb-5">
                <WalletIcon className="w-10 h-10 text-ink-4" />
              </div>
              <p className="text-ink font-semibold text-lg mb-2">No wallets yet</p>
              <p className="text-sm text-ink-3 max-w-xs mb-6">Add your first wallet to start tracking your balances.</p>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary"
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
        <BottomSheet onClose={closeAdd}>
          <p className="mb-4 text-center font-semibold text-ink text-lg">
            {addKind === 'card' ? 'New Credit Card' : 'New Wallet'}
          </p>

          {/* Two different things, one sheet: a card is not a wallet, but it is
              added from the same place. */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
            {(['wallet', 'card'] as const).map(k => (
              <button
                key={k}
                onClick={() => setAddKind(k)}
                aria-pressed={addKind === k}
                className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                  addKind === k ? 'bg-surface text-ink elev-knob' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {k === 'wallet' ? 'Wallet' : 'Credit card'}
              </button>
            ))}
          </div>

          {addKind === 'card' ? <CreditCardForm onDone={closeAdd} /> : (
            <>
            <p className="mb-2 text-xs text-ink-3">Quick pick</p>
            <div className="mb-4">
              <WalletPresetPicker
                selected={preset}
                onPick={p => { setNewName(p.name); setNewIcon(presetIcon(p)); }}
              />
            </div>

            <p className="mb-2 text-xs text-ink-3">Icon</p>
            <div className="mb-4 flex gap-2 flex-wrap">
              {/* The bank's logo leads, as one more choice beside the drawn icons. */}
              {logoChoice && (
                <button
                  onClick={() => setNewIcon(logoChoice)}
                  aria-label="Logo"
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border p-1.5 transition-colors ${newIcon === logoChoice ? 'border-primary bg-primary-tint' : 'border-line bg-raised'}`}
                >
                  <AppIcon icon={logoChoice} className="h-full w-full" />
                </button>
              )}
              {ICONS.map(ico => (
                <button
                  key={ico}
                  onClick={() => setNewIcon(ico)}
                  aria-label={ico}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-colors ${newIcon === ico ? 'border-primary bg-primary-tint text-primary-text' : 'border-line bg-raised text-ink-3 hover:text-ink'}`}
                >
                  <AppIcon icon={ico} className="h-5 w-5" />
                </button>
              ))}
            </div>

            <p className="mb-2 text-xs text-ink-3">Name</p>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. GCash, BPI, Cash"
              className="mb-4 w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-sm"
            />

            <p className="mb-2 text-xs text-ink-3">Starting Balance</p>
            {/* text + inputMode rather than type="number": no stepper on any
                platform, and mobile still gets the numeric keypad. */}
            <input
              type="text"
              inputMode="decimal"
              value={newBalance}
              onChange={e => setNewBalance(e.target.value)}
              placeholder="0.00"
              className="mb-5 w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-sm"
            />

            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary active:bg-primary-hover disabled:opacity-40 transition-colors"
            >
              Add Wallet
            </button>
            </>
          )}
        </BottomSheet>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmDelete(null)}>
          <ScrollLock />
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-surface border border-line p-6 text-center"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-ink mb-1">Delete wallet?</p>
            <p className="text-sm text-ink-2 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl bg-raised py-3 text-sm font-medium text-ink-2">Cancel</button>
              <button
                onClick={() => { deleteWallet(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 rounded-xl bg-danger-strong py-3 text-sm font-medium text-white"
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
