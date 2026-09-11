'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeftIcon, CogIcon } from './Icons';

interface Props {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

const roundButton =
  'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-3 ' +
  'hover:border-primary-text hover:text-primary-text transition-colors md:hidden';

export default function PageHeader({ title, right, onBack }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // Mobile only — the desktop sidebar still carries Settings. And never link a
  // page to itself.
  const showCog = pathname !== '/settings';

  return (
    <header className="flex items-center justify-between gap-3 pt-12 pb-5 md:pt-10 md:pb-6">
      <button onClick={onBack ?? (() => router.back())} aria-label="Back" className={roundButton}>
        <ChevronLeftIcon className="w-[18px] h-[18px]" />
      </button>
      <h1 className="truncate text-[19px] font-bold tracking-tight md:text-[22px]">{title}</h1>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {right}
        {showCog && (
          <Link href="/settings" aria-label="Settings" className={roundButton}>
            <CogIcon className="w-[18px] h-[18px]" />
          </Link>
        )}
      </div>
    </header>
  );
}
