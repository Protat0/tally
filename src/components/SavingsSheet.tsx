'use client';

import { useApp } from './AppContext';
import BottomSheet from './BottomSheet';

interface Props {
  onClose: () => void;
}

export default function SavingsSheet({ onClose }: Props) {
  const { settings, updateSettings } = useApp();
  const { monthlySavingsTarget, currency } = settings;

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🌱</span>
        <p className="font-semibold text-white">Monthly Savings</p>
      </div>
      <p className="text-xs text-slate-500 mb-1">Amount to set aside each month</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">{currency}</span>
        <input
          type="number"
          inputMode="decimal"
          value={monthlySavingsTarget || ''}
          onChange={e => updateSettings({ monthlySavingsTarget: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          autoFocus
          className="flex-1 rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50"
        />
      </div>
      <button onClick={onClose}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white">
        Done
      </button>
    </BottomSheet>
  );
}
