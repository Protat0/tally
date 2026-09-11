'use client';

import { useState } from 'react';
import NestedSheet from './NestedSheet';
import { IconTile } from './AppIcon';
import { CheckIcon, ChevronRightIcon } from './Icons';
import { WALLET_PRESET_GROUPS, type WalletPreset } from '@/lib/walletPresets';
import { logoIcon } from '@/lib/icons';

// What choosing a preset stores as the wallet's icon: its logo when it has one.
export const presetIcon = (p: WalletPreset): string => (p.logo ? logoIcon(p.logo) : p.icon);

interface Props {
  /** The preset the wallet's name currently matches, if any. */
  selected: WalletPreset | null;
  onPick: (preset: WalletPreset) => void;
}

// Quick pick for a new wallet: one row in the form, and every bank and
// e-wallet, logo first, in a sheet of its own — a native select can't show
// pictures in its options.
export default function WalletPresetPicker({ selected, onPick }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5 text-left"
      >
        {selected ? (
          <>
            <IconTile icon={presetIcon(selected)} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-sm text-ink-4">Choose a bank or e-wallet</span>
        )}
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-3" />
      </button>

      {open && (
        <NestedSheet onClose={() => setOpen(false)}>
          <p className="text-lg font-semibold text-ink">Bank or e-wallet</p>
          {WALLET_PRESET_GROUPS.map(group => (
            <section key={group.label}>
              <p className="mb-1 mt-4 px-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
                {group.label}
              </p>
              {group.presets.map(p => {
                const isSelected = selected?.name === p.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => { onPick(p); setOpen(false); }}
                    aria-pressed={isSelected}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised"
                  >
                    <IconTile icon={presetIcon(p)} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                    {isSelected && <CheckIcon className="h-4 w-4 shrink-0 text-primary-text" />}
                  </button>
                );
              })}
            </section>
          ))}
        </NestedSheet>
      )}
    </>
  );
}
