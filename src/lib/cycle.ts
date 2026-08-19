// Budget cycle arithmetic, kept pure: no React, no Supabase, no I/O.
//
// A cycle is a budgeting period that need not start on the 1st. It is keyed by
// the YYYY-MM of the calendar month its START date falls in — the same string
// shape already stored in bills.paid_months, appliances.last_reset_month and
// instalments.month, so moving the app onto cycles needs no schema change on
// any of them. With a start day of 15, the cycle keyed '2026-08' runs from
// Aug 15 up to but not including Sep 15.
//
// Every boundary is LOCAL time. isoDay in AppContext explains why: toISOString()
// converts to UTC first, which in PH (UTC+8) reports the previous day for
// anything before 08:00. A bill paid at 00:30 on the 15th belongs to the cycle
// that just opened, not the one that just closed.

export type CycleKey = string; // 'YYYY-MM', one-based month

// `month` is zero-based here, as in the Date constructor.
//
// A start day of 31 still has to land in a 30-day month, so it clamps to that
// month's end — the same rule paydaysInCycle already applies to paydays.
export function clampDay(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

// Midnight local on the day the cycle opening in this calendar month begins.
function startOfCycleIn(year: number, month: number, startDay: number): Date {
  return new Date(year, month, clampDay(year, month, startDay));
}

function keyOf(year: number, month: number): CycleKey {
  const norm = new Date(year, month, 1); // normalises month -1 and 12
  return `${norm.getFullYear()}-${String(norm.getMonth() + 1).padStart(2, '0')}`;
}

function partsOf(key: CycleKey): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function cycleKeyOf(date: Date, startDay: number): CycleKey {
  const y = date.getFullYear();
  const m = date.getMonth();
  // Compared at day resolution so the time of day cannot straddle the boundary.
  const day = new Date(y, m, date.getDate());
  return day < startOfCycleIn(y, m, startDay) ? keyOf(y, m - 1) : keyOf(y, m);
}

export function currentCycleKey(startDay: number): CycleKey {
  return cycleKeyOf(new Date(), startDay);
}

// Half-open: [start, end). The end is the next cycle's start, so consecutive
// cycles tile the calendar with no gap and no overlap.
export function cycleRange(key: CycleKey, startDay: number): { start: Date; end: Date } {
  const { year, month } = partsOf(key);
  return {
    start: startOfCycleIn(year, month, startDay),
    end: startOfCycleIn(year, month + 1, startDay),
  };
}

export function shiftCycleKey(key: CycleKey, by: number): CycleKey {
  const { year, month } = partsOf(key);
  return keyOf(year, month + by);
}

export function cycleLabel(key: CycleKey, startDay: number): string {
  const { start, end } = cycleRange(key, startDay);
  if (startDay === 1) {
    return start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  }
  // The range is half-open, so the last day the user sees is the day before it ends.
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-PH', opts)} – ${last.toLocaleDateString('en-PH', opts)}`;
}

// A cycle spans at most two calendar months, and a given day-of-month falls in
// exactly one of them: if it has already passed when the cycle opens, it must
// be the occurrence in the following month.
export function dueDateInCycle(dueDay: number, key: CycleKey, startDay: number): Date {
  const { start, end } = cycleRange(key, startDay);
  const first = new Date(
    start.getFullYear(), start.getMonth(),
    clampDay(start.getFullYear(), start.getMonth(), dueDay),
  );
  if (first >= start) return first;
  return new Date(
    end.getFullYear(), end.getMonth(),
    clampDay(end.getFullYear(), end.getMonth(), dueDay),
  );
}

// Every one of these days-of-month, as concrete dates inside the cycle,
// ascending. Deduped: 30 and 31 collapse onto the same date in a short month.
export function datesInCycle(days: number[], key: CycleKey, startDay: number): Date[] {
  const seen = new Map<number, Date>();
  for (const d of days) {
    const date = dueDateInCycle(d, key, startDay);
    seen.set(date.getTime(), date);
  }
  return [...seen.values()].sort((a, b) => a.getTime() - b.getTime());
}

const DAY_MS = 86_400_000;

export function daysInCycle(key: CycleKey, startDay: number): number {
  const { start, end } = cycleRange(key, startDay);
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

// Inclusive of today, matching the `today.getDate()` this replaces: on the
// cycle's opening day, one day has elapsed.
export function daysElapsedInCycle(key: CycleKey, startDay: number, now: Date = new Date()): number {
  const { start } = cycleRange(key, startDay);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1;
}

export interface TickedBill {
  id: string;
  paidMonths: string[];
  paidExpenseIds: Record<string, string>;
}

// Changing the cycle start day silently reinterprets every stored tick: the
// string '2026-08' stops meaning "August" and starts meaning "Aug 15 – Sep 14".
// The payment's own date is the only reliable evidence of which cycle it
// belongs to, so each tick is re-keyed from the expense it created.
//
// Ticks with no usable expense date keep their original key. Two entries from
// the same loop landing on the same new key is possible in principle; the later
// month wins, which is deterministic and matches "the most recent payment for
// this period". But when a real tick (from paidMonths) and an orphan repair
// (from paidExpenseIds) collide, the real tick wins — orphan repairs fill gaps
// only, never replace legitimate data.
export function rekeyBillTicks<T extends TickedBill>(
  bills: T[],
  expenseDates: Record<string, string>,
  newStartDay: number,
): T[] {
  return bills.map(bill => {
    const paidExpenseIds: Record<string, string> = {};
    const keys = new Set<string>();

    for (const month of [...bill.paidMonths].sort()) {
      const expenseId = bill.paidExpenseIds[month];
      const iso = expenseId ? expenseDates[expenseId] : undefined;
      const key = iso ? cycleKeyOf(new Date(iso), newStartDay) : month;

      keys.add(key);
      if (expenseId) paidExpenseIds[key] = expenseId;
    }

    // A tick recorded in paidExpenseIds but absent from paidMonths would be
    // dropped by the loop above, stranding the expense it points at.
    for (const [month, expenseId] of Object.entries(bill.paidExpenseIds)) {
      if (bill.paidMonths.includes(month)) continue;
      const iso = expenseDates[expenseId];
      const key = iso ? cycleKeyOf(new Date(iso), newStartDay) : month;
      keys.add(key);
      if (!paidExpenseIds[key]) paidExpenseIds[key] = expenseId;
    }

    return { ...bill, paidMonths: [...keys].sort(), paidExpenseIds };
  });
}
