'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeftIcon, CogIcon } from './Icons';

interface Props {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

export default function PageHeader({ title, right, onBack }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // Mobile only — the desktop sidebar still carries Settings. And never link a
  // page to itself.
  const showCog = pathname !== '/settings';

  return (
    <header className="flex items-center justify-between gap-3 pt-12 pb-5 md:pt-10 md:pb-6">
      <button
        onClick={onBack ?? (() => router.back())}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
      >
        <ChevronLeftIcon className="w-5 h-5 text-slate-400" />
      </button>
      <h1 className="text-base font-semibold text-white md:text-2xl md:font-bold truncate">{title}</h1>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {right}
        {showCog && (
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
          >
            <CogIcon className="w-5 h-5 text-slate-400" />
          </Link>
        )}
      </div>
    </header>
  );
}
