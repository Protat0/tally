// Emergency fund arithmetic, kept pure: no React, no Supabase.
//
// Entries carry positive amounts and a direction, so a withdrawal never needs a
// negative number in the table. The shapes below are the fields these rules
// read; an EmergencyFundEntry has them.

export type FundDirection = 'deposit' | 'withdrawal';

export interface FundEntryLike {
  id: string;
  direction: FundDirection;
  amount: number;
}

// Rounded at the centavo, as wallet balances are (see round2 in walletDeltas):
// summed floats leave dust, and a fund that should be empty must equal zero.
const cents = (n: number): number => Math.round(n * 100) / 100;

export function fundBalance(entries: Pick<FundEntryLike, 'direction' | 'amount'>[]): number {
  return cents(entries.reduce((s, e) => s + (e.direction === 'deposit' ? e.amount : -e.amount), 0));
}

// A withdrawal can be any positive amount up to everything the fund holds.
export function canWithdraw(balance: number, amount: number): boolean {
  return amount > 0 && cents(amount) <= cents(balance);
}

// Whether removing an entry leaves the fund at or above zero. Removing a
// withdrawal always does; removing a deposit does not once the withdrawals
// that remain would add up to more than the deposits that remain.
export function canDeleteEntry(entries: FundEntryLike[], id: string): boolean {
  if (!entries.some(e => e.id === id)) return false;
  return fundBalance(entries.filter(e => e.id !== id)) >= 0;
}

// The average of the most recent `count` deposits, taking entries newest first
// as they are kept; null when there are none. Withdrawals are left out: this
// estimates how fast the fund grows.
export function averageDeposit(
  entries: Pick<FundEntryLike, 'direction' | 'amount'>[],
  count: number,
): number | null {
  const recent = entries.filter(e => e.direction === 'deposit').slice(0, count);
  if (recent.length === 0) return null;
  return recent.reduce((s, e) => s + e.amount, 0) / recent.length;
}
