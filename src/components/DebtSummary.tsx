'use client';

import { fmt } from './AppContext';

interface Props {
  owedToMe: number;
  iOwe: number;
  totalBalance: number;
  currency: string;
}

// Red text can't be read on the teal hero, so money you owe is marked with a
// red dot beside a light figure instead.
function Owing({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-danger" />
      <span className="truncate text-teal-50">{children}</span>
    </span>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] leading-tight text-teal-100">{label}</p>
      <div className="mt-[7px] truncate text-[17px] font-bold leading-none tabular-nums">{children}</div>
    </div>
  );
}

// The three numbers the page exists to answer, before any detail — sitting
// under the cash you actually hold. The divider is deliberate: a balance is
// money in your wallets, a debt is money that isn't. Adding them would be
// wrong, so they never share a row.
export default function DebtSummary({ owedToMe, iOwe, totalBalance, currency }: Props) {
  const net = owedToMe - iOwe;

  return (
    <div className="rounded-2xl bg-primary-deep px-4 pt-5 pb-[18px] elev-hero md:px-6">
      <p className="text-[11px] font-semibold uppercase leading-none tracking-widest text-teal-100">Total balance</p>
      <p className="mt-2.5 text-[32px] font-bold leading-[1.1] tracking-[-0.035em] tabular-nums text-teal-50">
        {fmt(totalBalance, currency)}
      </p>

      <div className="mt-[18px] grid grid-cols-3 gap-2.5 border-t border-white/20 pt-4">
        <Figure label="You’re owed">
          <span className="text-green-200">{fmt(owedToMe, currency)}</span>
        </Figure>
        <Figure label="You owe">
          {iOwe > 0
            ? <Owing>{fmt(iOwe, currency)}</Owing>
            : <span className="text-teal-50">{fmt(0, currency)}</span>}
        </Figure>
        <Figure label="Net">
          {net > 0
            ? <span className="text-green-200">+{fmt(net, currency)}</span>
            : net < 0
              ? <Owing>-{fmt(Math.abs(net), currency)}</Owing>
              : <span className="text-teal-100">{fmt(0, currency)}</span>}
        </Figure>
      </div>

      {net !== 0 && (
        <p className="mt-3 text-xs text-teal-100">
          {net > 0 ? 'Overall, people owe you.' : 'Overall, you owe people.'}
        </p>
      )}
    </div>
  );
}
