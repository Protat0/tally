'use client';

import Link from 'next/link';
import AppIcon from './AppIcon';
import type { IconKey } from '@/lib/icons';

type Tone = 'default' | 'good' | 'warn' | 'bad';

interface Props {
  icon: IconKey;
  label: string;
  value: string;
  status?: string;
  statusTone?: Tone;
  onClick?: () => void;
  href?: string;
}

const toneClass: Record<Tone, string> = {
  default: 'text-ink-3',
  good:    'text-growth-text',
  warn:    'text-warning-text',
  bad:     'text-danger-text',
};

const shell =
  'block w-full rounded-2xl bg-surface border border-line p-4 text-left ' +
  'hover:border-line-strong hover:bg-raised transition-colors';

// A collapsed section: the one number the user came for, plus a status line.
export default function BudgetTile({
  icon, label, value, status, statusTone = 'default', onClick, href,
}: Props) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <AppIcon icon={icon} className="h-4 w-4 shrink-0 text-primary-text" />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 truncate">
          {label}
        </p>
      </div>
      <p className="text-lg font-bold text-ink tabular-nums truncate">{value}</p>
      {status && <p className={`mt-0.5 text-xs truncate ${toneClass[statusTone]}`}>{status}</p>}
    </>
  );

  if (href) return <Link href={href} className={shell}>{body}</Link>;
  return <button onClick={onClick} className={shell}>{body}</button>;
}
