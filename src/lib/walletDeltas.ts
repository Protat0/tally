// Wallet balance arithmetic, kept pure: no React, no Supabase, no I/O.
//
// A Deltas map is "how much each wallet's balance should move", never an
// absolute balance. Absolute balances are what made the old recordMove unsafe:
// two of them computed from the same pre-await React state overwrite each
// other, silently losing the difference. Deltas from independent sources can be
// summed, so the whole of an operation commits in one write per wallet.

export type Deltas = Record<string, number>;

// Money is rounded at the centavo every time it is summed. Left alone, float
// dust accumulates into stored balances where nothing displays it but it never
// leaves — and a balance that should be zero stops comparing equal to zero.
export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function expenseDeltas(input: {
  walletId: string | null;
  myShare: number;
  owedToMe: { amount: number }[];
}): Deltas {
  if (!input.walletId) return {};
  const owed = input.owedToMe.reduce((s, o) => s + o.amount, 0);
  return { [input.walletId]: -(input.myShare + owed) };
}

export function negate(d: Deltas): Deltas {
  const out: Deltas = {};
  for (const [id, v] of Object.entries(d)) out[id] = -v;
  return out;
}

export function mergeDeltas(...maps: Deltas[]): Deltas {
  const out: Deltas = {};
  for (const m of maps) {
    for (const [id, v] of Object.entries(m)) out[id] = round2((out[id] ?? 0) + v);
  }
  return out;
}

// What a money move does to wallet balances. Negating this reverses the move,
// which is what both deleting and re-recording one need.
export function moveDeltas(m: {
  kind: string; amount: number; fee: number;
  walletId: string; toWalletId: string | null;
}): Deltas {
  if (m.kind === 'earned')   return { [m.walletId]:  m.amount };
  if (m.kind === 'debt_in')  return { [m.walletId]:  m.amount };
  if (m.kind === 'debt_out') return { [m.walletId]: -m.amount };
  if (m.toWalletId) {
    // Transfers, and withdrawals from the point they started landing in cash.
    return mergeDeltas(
      { [m.walletId]:   -m.amount - m.fee },
      { [m.toWalletId]:  m.amount },
    );
  }
  return { [m.walletId]: -m.amount - m.fee };
}
