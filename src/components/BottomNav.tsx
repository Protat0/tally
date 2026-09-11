'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';

const links = [
  { href: '/',             label: 'Dashboard' },
  { href: '/wallets',      label: 'Wallets' },
  { href: '/expenses',     label: 'Budget' },
  { href: '/transactions', label: 'Activity' },
  { href: '/debts',        label: 'Debts' },
  { href: '/settings',     label: 'Settings' },
];

// The mobile bar fits five comfortably. Settings is the rarest destination and
// is reachable from the cog in every page header, so it is the one to drop.
const mobileLinks = links.filter(l => l.href !== '/settings');

export default function BottomNav() {
  const pathname = usePathname();
  const { signOut, user } = useAuth();

  return (
    <>
      {/* ── Mobile: fixed bottom bar. A teal dot marks where you are; the label does the naming. ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 border-t border-line bg-surface px-1.5 pt-2.5 pb-5">
        {mobileLinks.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center gap-1.5 rounded-xl py-1 transition-colors active:bg-raised"
            >
              <span className={`h-[5px] w-[5px] rounded-full ${active ? 'bg-primary' : 'bg-transparent'}`} />
              <span className={`text-[11px] leading-none ${active ? 'font-semibold text-primary-text' : 'text-ink-4'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── Desktop: fixed left sidebar ── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col border-r border-line bg-surface px-4 py-6 z-50">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 pb-[26px]">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-primary">
            <span className="text-base font-bold text-on-primary">T</span>
          </div>
          <span className="text-[22px] font-bold leading-none tracking-tight text-primary-text">Tally</span>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5">
          {links.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-[10px] px-3 py-[11px] text-sm transition-colors ${
                  active
                    ? 'bg-primary-tint font-semibold text-primary-text'
                    : 'font-medium text-ink-2 hover:bg-canvas hover:text-ink'
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-primary' : 'bg-line'}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer: user email + sign out */}
        <div className="mt-auto flex flex-col gap-[7px] border-t border-divider px-3 pt-4">
          {user && (
            <p className="truncate text-[12.5px] text-ink-3">{user.email}</p>
          )}
          <button
            onClick={signOut}
            className="self-start text-[13px] font-semibold text-primary-text hover:text-primary-hover transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
