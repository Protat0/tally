'use client';

import Link from 'next/link';

type Tone = 'default' | 'good' | 'warn' | 'bad';

interface Props {
  icon: string;
  label: string;
  value: string;
  status?: string;
  statusTone?: Tone;
  onClick?: () => void;
  href?: string;
}

const toneClass: Record<Tone, string> = {
  default: 'text-slate-500',
  good:    'text-emerald-400',
  warn:    'text-amber-400',
  bad:     'text-red-400',
};

const shell =
  'block w-full rounded-2xl bg-[#111827] border border-[#1e2d40] p-4 text-left ' +
  'hover:border-slate-600 hover:bg-[#141d2e] transition-colors';

// A collapsed section: the one number the user came for, plus a status line.
export default function BudgetTile({
  icon, label, value, status, statusTone = 'default', onClick, href,
}: Props) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base shrink-0">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 truncate">
          {label}
        </p>
      </div>
      <p className="text-lg font-bold text-white tabular-nums truncate">{value}</p>
      {status && <p className={`mt-0.5 text-xs truncate ${toneClass[statusTone]}`}>{status}</p>}
    </>
  );

  if (href) return <Link href={href} className={shell}>{body}</Link>;
  return <button onClick={onClick} className={shell}>{body}</button>;
}
