'use client';

import { useState } from 'react';
import { useApp, fmt, PendingPayday } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import NumberField from './NumberField';

interface Props {
  payday: PendingPayday;
  onClose: () => void;
}

// Confirms a scheduled payday actually landed. The schedule tells us when to
// ask; only the user can tell us whether the money arrived — payroll slips, gets
// deducted, or comes in short, and a projection that assumed it would be
// misleading in the one direction this app is trying not to be.
export default function PaydaySheet({ payday, onClose }: Props) {
  const { settings, wallets, confirmPayday, dismissPayday, updateSettings } = useApp();
  const { currency, cashflowWalletId } = settings;

  // Prefill from the cashflow wallet so the common case is one tap. Falls back
  // to the only wallet if there is just one — picking from a list of one is busywork.
  const preset = cashflowWalletId ?? (wallets.length === 1 ? wallets[0].id : '');
  const [walletId, setWalletId] = useState(preset);
  const [amount, setAmount] = useState(payday.amount);
  const [busy, setBusy] = useState(false);

  const dateLabel = new Date(`${payday.date}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric',
  });

  const canConfirm = walletId !== '' && amount > 0 && !busy;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    // Confirming through a wallet is a strong signal it's the salary account, so
    // remember it and the next payday needs no wallet tap at all.
    if (cashflowWalletId !== walletId) await updateSettings({ cashflowWalletId: walletId });
    await confirmPayday(payday.date, amount, walletId);
    onClose();
  };

  const handleDismiss = async () => {
    setBusy(true);
    await dismissPayday(payday.date);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-2xl">💰</span>
        <p className="font-semibold text-white">Payday {dateLabel}</p>
      </div>
      <p className="text-xs text-slate-500 mb-5 leading-relaxed">
        Your projection leaves this money out until you confirm it landed.
      </p>

      <p className="text-xs text-slate-500 mb-1.5">Amount received</p>
      <div className="flex items-center gap-2 mb-5">
        <span className="text-sm text-slate-500 shrink-0">{currency}</span>
        <NumberField
          value={amount}
          onChange={setAmount}
          step={500}
          min={0}
          className="flex-1 min-w-0"
          inputClassName="w-full min-w-0 rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50"
        />
      </div>

      {wallets.length === 0 ? (
        <p className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-300">
          Add a wallet first — the money has to land somewhere.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {cashflowWalletId ? 'Landed in' : 'Which wallet did it land in?'}
          </p>
          <WalletPicker value={walletId} onChange={setWalletId} />
        </>
      )}

      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="mt-6 w-full rounded-xl bg-emerald-600 py-3.5 font-semibold text-white active:bg-emerald-700 disabled:opacity-40 transition-colors"
      >
        {busy ? 'Saving…' : `Yes, received ${fmt(amount, currency)}`}
      </button>
      <button
        onClick={handleDismiss}
        disabled={busy}
        className="mt-2 w-full rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-400 active:bg-white/10 disabled:opacity-40 transition-colors"
      >
        Didn&apos;t get it, or already logged it
      </button>
    </BottomSheet>
  );
}
