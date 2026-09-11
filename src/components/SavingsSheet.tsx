'use client';

import { useApp } from './AppContext';
import BottomSheet from './BottomSheet';
import { IconTile } from './AppIcon';

interface Props {
  onClose: () => void;
}

export default function SavingsSheet({ onClose }: Props) {
  const { settings, updateSettings } = useApp();
  const { monthlySavingsTarget, currency } = settings;

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <IconTile icon="piggy-bank" tone="growth" />
        <p className="font-semibold text-ink">Monthly Savings</p>
      </div>
      <p className="text-xs text-ink-3 mb-1">Amount to set aside each month</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-ink-3">{currency}</span>
        <input
          type="number"
          inputMode="decimal"
          value={monthlySavingsTarget || ''}
          onChange={e => updateSettings({ monthlySavingsTarget: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          autoFocus
          className="flex-1 rounded-xl bg-canvas border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary"
        />
      </div>
      <button onClick={onClose}
        className="mt-5 w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary">
        Done
      </button>
    </BottomSheet>
  );
}
