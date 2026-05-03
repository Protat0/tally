'use client';

import { useState } from 'react';
import { useApp, fmt, Wallet } from './AppContext';
import { PlusIcon, ArrowUpIcon, ArrowDownIcon, SwitchIcon, TrashIcon } from './Icons';

interface Props {
  wallet: Wallet;
  onExpense?: () => void;
  onDelete?: () => void;
}

interface ActionModal {
  type: 'add' | 'withdraw' | 'transfer';
}

export default function WalletCard({ wallet, onExpense, onDelete }: Props) {
  const { updateWallet, wallets } = useApp();
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [targetId, setTargetId] = useState('');

  const closeModal = () => { setModal(null); setInputVal(''); setTargetId(''); };

  const confirm = () => {
    const amt = parseFloat(inputVal);
    if (isNaN(amt) || amt <= 0) return;
    if (modal?.type === 'add') {
      updateWallet(wallet.id, { balance: wallet.balance + amt });
    } else if (modal?.type === 'withdraw') {
      updateWallet(wallet.id, { balance: wallet.balance - amt });
    } else if (modal?.type === 'transfer' && targetId) {
      const target = wallets.find(w => w.id === targetId);
      if (target) {
        updateWallet(wallet.id, { balance: wallet.balance - amt });
        updateWallet(targetId, { balance: target.balance + amt });
      }
    }
    closeModal();
  };

  const others = wallets.filter(w => w.id !== wallet.id);

  return (
    <>
      <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-xl">
              {wallet.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{wallet.name}</p>
              <p className="text-xs text-slate-500">Balance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-xl font-bold ${wallet.balance < 0 ? 'text-red-400' : 'text-white'}`}>
              {fmt(wallet.balance)}
            </p>
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 transition-colors"
              >
                <TrashIcon className="w-4 h-4 text-red-400" />
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Add', Icon: PlusIcon, action: () => setModal({ type: 'add' }) },
            { label: 'Expense', Icon: ArrowDownIcon, action: onExpense },
            { label: 'Withdraw', Icon: ArrowUpIcon, action: () => setModal({ type: 'withdraw' }) },
            { label: 'Transfer', Icon: SwitchIcon, action: () => setModal({ type: 'transfer' }) },
          ].map(({ label, Icon, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 py-3 transition-colors active:bg-white/10"
            >
              <Icon className="w-5 h-5 text-slate-300" />
              <span className="text-[11px] text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={closeModal}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] rounded-t-3xl bg-[#111827] border-t border-[#1e2d40] p-6 pb-10"
            onClick={e => e.stopPropagation()}
          >
            <p className="mb-4 text-center font-semibold text-white capitalize">
              {modal.type === 'add' ? 'Add Funds' : modal.type === 'withdraw' ? 'Withdraw' : 'Transfer'}
            </p>
            <input
              type="number"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="Amount"
              className="mb-3 w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white placeholder-slate-500 text-center text-2xl font-bold outline-none focus:border-blue-500/50"
              autoFocus
            />
            {modal.type === 'transfer' && (
              <div className="mb-3 space-y-2">
                {others.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">No other wallets to transfer to.</p>
                ) : (
                  others.map(w => (
                    <button
                      key={w.id}
                      onClick={() => setTargetId(w.id)}
                      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${targetId === w.id ? 'border-blue-500 bg-blue-500/10' : 'border-[#1e2d40] bg-white/5'}`}
                    >
                      <span className="text-lg">{w.icon}</span>
                      <span className="text-sm text-white">{w.name}</span>
                      <span className="ml-auto text-sm text-slate-400">{fmt(w.balance)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            <button
              onClick={confirm}
              className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white active:bg-blue-700 transition-colors"
            >
              Confirm
            </button>
            <button onClick={closeModal} className="mt-3 w-full text-center text-sm text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
