'use client';

import { useState } from 'react';
import { useApp, fmt, Wallet, IncomeSource, INCOME_SOURCES } from './AppContext';
import { ScrollLock } from './ModalLock';
import { useSwipeToClose } from './useSwipeToClose';
import { PlusIcon, ArrowUpIcon, ArrowDownIcon, SwitchIcon, TrashIcon } from './Icons';
import AppIcon, { IconTile } from './AppIcon';

interface Props {
  wallet: Wallet;
  onExpense?: () => void;
  onDelete?: () => void;
}

interface ActionModal {
  type: 'add' | 'withdraw' | 'transfer';
}

const fieldLabel = 'text-[11px] font-semibold uppercase leading-none tracking-widest text-ink-3';
const fieldInput =
  'w-full rounded-xl border border-line bg-canvas px-3.5 py-[13px] text-sm text-ink placeholder-ink-5 outline-none ' +
  'focus:border-primary-text focus:bg-surface focus:ring-[3px] focus:ring-primary-hover/25 transition-colors';

export default function WalletCard({ wallet, onExpense, onDelete }: Props) {
  const { wallets, addIncome, addWithdrawal, addTransfer, settings } = useApp();
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [targetId, setTargetId] = useState('');
  const [note, setNote] = useState('');
  const [feeVal, setFeeVal] = useState('');
  const [source, setSource] = useState<IncomeSource>('salary');

  const closeModal = () => {
    setModal(null); setInputVal(''); setTargetId(''); setNote(''); setFeeVal(''); setSource('salary');
  };

  const swipe = useSwipeToClose(closeModal);

  const confirm = () => {
    const amt = parseFloat(inputVal);
    if (isNaN(amt) || amt <= 0) return;
    const trimmed = note.trim();
    // Blank, junk or negative all mean no fee. It is charged on top of the
    // amount, so a stray minus must never quietly credit the wallet.
    const parsedFee = parseFloat(feeVal);
    const fee = isNaN(parsedFee) || parsedFee <= 0 ? 0 : parsedFee;
    if (modal?.type === 'add') {
      addIncome({ walletId: wallet.id, amount: amt, source, note: trimmed });
    } else if (modal?.type === 'withdraw') {
      addWithdrawal({ walletId: wallet.id, amount: amt, note: trimmed, fee });
    } else if (modal?.type === 'transfer') {
      if (!targetId) return;
      addTransfer({ fromWalletId: wallet.id, toWalletId: targetId, amount: amt, note: trimmed, fee });
    }
    closeModal();
  };

  const amount = parseFloat(inputVal);
  const canConfirm = !isNaN(amount) && amount > 0 && (modal?.type !== 'transfer' || Boolean(targetId));

  const others = wallets.filter(w => w.id !== wallet.id);

  // Withdrawing means moving money into the cash wallet, so it is meaningless on
  // the cash wallet itself and impossible while there is no cash wallet at all.
  // Transfer still covers both cases.
  const cashWallet = wallets.find(w => w.id === settings.cashWalletId) ?? null;
  const canWithdraw = cashWallet !== null && cashWallet.id !== wallet.id;

  const actions = [
    { label: 'Add', Icon: PlusIcon, action: () => setModal({ type: 'add' as const }) },
    { label: 'Expense', Icon: ArrowDownIcon, action: onExpense },
    ...(canWithdraw
      ? [{ label: 'Withdraw', Icon: ArrowUpIcon, action: () => setModal({ type: 'withdraw' as const }) }]
      : []),
    { label: 'Transfer', Icon: SwitchIcon, action: () => setModal({ type: 'transfer' as const }) },
  ];

  const title = modal?.type === 'add' ? 'Add funds' : modal?.type === 'withdraw' ? 'Withdraw' : 'Transfer';
  // Once the amount is real, the button says exactly what it is about to do.
  const sourceLabel = INCOME_SOURCES.find(s => s.key === source)?.label ?? '';
  const amountStr = fmt(amount, settings.currency);
  const ctaLabel = !canConfirm
    ? title
    : modal?.type === 'add'
      ? `Add ${amountStr} from ${sourceLabel}`
      : `${title} ${amountStr}`;

  return (
    <>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <IconTile icon={wallet.icon} fallback="wallet" />
            <div>
              <p className="text-sm font-medium">{wallet.name}</p>
              <p className="text-xs text-ink-3">Balance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-xl font-bold tabular-nums ${wallet.balance < 0 ? 'text-danger-text' : ''}`}>
              {fmt(wallet.balance)}
            </p>
            {onDelete && (
              <button
                onClick={onDelete}
                aria-label={`Delete ${wallet.name}`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-tint hover:bg-danger-edge transition-colors"
              >
                <TrashIcon className="w-4 h-4 text-danger-text" />
              </button>
            )}
          </div>
        </div>
        <div className={`grid gap-2 ${canWithdraw ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {actions.map(({ label, Icon, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-canvas py-3 transition-colors hover:border-line-strong active:bg-raised"
            >
              <Icon className="w-5 h-5 text-primary-text" />
              <span className="text-[11px] text-ink-2">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={closeModal}>
          <ScrollLock />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative flex w-full max-w-[430px] flex-col gap-5 rounded-t-3xl bg-surface px-5 pt-3 pb-8 elev-sheet"
            onClick={e => e.stopPropagation()}
            style={swipe.style}
            {...swipe.handlers}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line" />

            <div className="text-center">
              <p className="text-lg font-bold leading-none tracking-tight">{title}</p>
              {modal.type === 'withdraw' && cashWallet && (
                <p className="mt-2 text-xs text-ink-4">
                  Moves into {cashWallet.name} — you still have the money.
                </p>
              )}
            </div>

            {/* The amount is the point of the sheet, so it is the biggest thing on it. */}
            <div className="flex flex-col items-center gap-1.5 pt-2 pb-1">
              <div className="flex items-center justify-center gap-0.5">
                <span className="text-[30px] font-semibold leading-none text-ink-4">{settings.currency}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  placeholder="0.00"
                  aria-label="Amount"
                  className="w-[230px] bg-transparent p-0 text-center text-[46px] font-bold leading-[1.1] tracking-[-0.04em] tabular-nums text-ink placeholder-ink-5 outline-none"
                  autoFocus
                />
              </div>
              <div className="h-0.5 w-[200px] rounded-full bg-primary" />
              <p className="mt-1 text-[12.5px] text-ink-4">
                {modal.type === 'add' ? 'Goes to' : 'From'} {wallet.name}
              </p>
            </div>

            {modal.type === 'add' && (
              <div className="flex flex-col gap-2.5">
                <p className={fieldLabel}>Source</p>
                <div className="flex flex-wrap gap-2">
                  {INCOME_SOURCES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setSource(s.key)}
                      className={`flex items-center gap-[7px] rounded-full border px-3.5 py-2.5 text-[13.5px] font-semibold leading-none transition-colors ${
                        source === s.key
                          ? 'border-primary bg-primary-tint text-primary-text'
                          : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                      }`}
                    >
                      <AppIcon icon={s.icon} className="h-4 w-4" />{s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modal.type === 'transfer' && (
              <div className="flex flex-col gap-2.5">
                <p className={fieldLabel}>To</p>
                {others.length === 0 ? (
                  <p className="text-center text-sm text-ink-3">No other wallets to transfer to.</p>
                ) : (
                  <div className="space-y-2">
                    {others.map(w => (
                      <button
                        key={w.id}
                        onClick={() => setTargetId(w.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                          targetId === w.id ? 'border-primary bg-primary-tint' : 'border-line bg-canvas hover:border-line-strong'
                        }`}
                      >
                        <IconTile icon={w.icon} fallback="wallet" size="sm" />
                        <span className="text-sm">{w.name}</span>
                        <span className="ml-auto text-sm tabular-nums text-ink-3">{fmt(w.balance)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(modal.type === 'withdraw' || modal.type === 'transfer') && (
              <div className="flex flex-col gap-2">
                <p className={fieldLabel}>Fee</p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={feeVal}
                  onChange={e => setFeeVal(e.target.value)}
                  placeholder="Optional"
                  className={fieldInput}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <p className={fieldLabel}>Note</p>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional"
                className={fieldInput}
              />
            </div>

            <div className="flex flex-col items-center gap-3 pt-0.5">
              <button
                onClick={confirm}
                disabled={!canConfirm}
                className="w-full rounded-[14px] bg-primary py-4 text-[15.5px] font-semibold leading-none text-on-primary hover:bg-primary-hover disabled:opacity-40 disabled:hover:bg-primary transition-colors"
              >
                {ctaLabel}
              </button>
              <button
                onClick={closeModal}
                className="text-[13.5px] font-semibold text-ink-3 hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
