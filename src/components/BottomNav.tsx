'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, WalletIcon, TrendingUpIcon, BoltIcon, CogIcon, LogOutIcon } from './Icons';
import { useAuth } from './AuthContext';

const links = [
  { href: '/', label: 'Dashboard', Icon: HomeIcon },
  { href: '/wallets', label: 'Wallets', Icon: WalletIcon },
  { href: '/expenses', label: 'Budget', Icon: TrendingUpIcon },
  { href: '/electric', label: 'Electric', Icon: BoltIcon },
  { href: '/settings', label: 'Settings', Icon: CogIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { signOut, user } = useAuth();

  return (
    <>
      {/* ── Mobile: fixed bottom bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0e1420]/95 backdrop-blur-md border-t border-[#1e2d40]">
        <div className="flex items-center justify-around px-2 py-2 pb-2">
          {links.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-1 flex-col items-center gap-1 py-1 rounded-xl transition-colors active:bg-white/5"
              >
                <Icon className={`w-6 h-6 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className={`text-[10px] font-medium ${active ? 'text-blue-400' : 'text-slate-500'}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Desktop: fixed left sidebar ── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col bg-[#0e1420] border-r border-[#1e2d40] z-50">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 pt-8 pb-7">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-white">T</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Tally</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-0.5">
          {links.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  active
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer: user email + sign out */}
        <div className="px-3 py-4 border-t border-[#1e2d40] space-y-1">
          {user && (
            <p className="px-4 pb-1 text-xs text-slate-600 truncate">{user.email}</p>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOutIcon className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
