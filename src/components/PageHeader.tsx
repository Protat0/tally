'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from './Icons';

interface Props {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

export default function PageHeader({ title, right, onBack }: Props) {
  const router = useRouter();
  return (
    <header className="flex items-center justify-between pt-12 pb-5 md:pt-10 md:pb-6">
      <button
        onClick={onBack ?? (() => router.back())}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
      >
        <ChevronLeftIcon className="w-5 h-5 text-slate-400" />
      </button>
      <h1 className="text-base font-semibold text-white md:text-2xl md:font-bold ml-0 md:ml-0">{title}</h1>
      <div className="w-9 flex justify-end">{right ?? null}</div>
    </header>
  );
}
