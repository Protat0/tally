'use client';

import { useState, useMemo } from 'react';
import { useApp, netOf, DebtPerson, DebtEntry } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import DebtSummary from '@/components/DebtSummary';
import DebtPersonSection from '@/components/DebtPersonSection';
import AddDebtSheet from '@/components/AddDebtSheet';
import { PlusIcon, UsersIcon } from '@/components/Icons';

export interface PersonGroup {
  person: DebtPerson;
  open: DebtEntry[];
  settled: DebtEntry[];
  net: number;
}

export default function DebtsPage() {
  const { debtPeople, debtEntries, totalOwedToMe, totalIOwe, settings, deleteDebtPerson } = useApp();
  const { currency } = settings;

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeletePerson, setConfirmDeletePerson] = useState<DebtPerson | null>(null);

  // People with an open balance first, most recently active at the top; fully
  // settled people sink to the bottom.
  const groups = useMemo<PersonGroup[]>(() => {
    const byPerson = debtPeople.map(person => {
      const mine = debtEntries.filter(e => e.personId === person.id);
      const open = mine.filter(e => !e.settledAt);
      const settled = mine.filter(e => e.settledAt);
      return { person, open, settled, net: netOf(open) };
    });

    const lastActivity = (g: PersonGroup) =>
      [...g.open, ...g.settled]
        .reduce((max, e) => (e.date > max ? e.date : max), '');

    return byPerson.sort((a, b) => {
      if ((a.open.length > 0) !== (b.open.length > 0)) return a.open.length > 0 ? -1 : 1;
      return lastActivity(b).localeCompare(lastActivity(a));
    });
  }, [debtPeople, debtEntries]);

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Debt Board"
            right={
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Add debt"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                <PlusIcon className="w-4 h-4 text-white" />
              </button>
            }
          />

          <DebtSummary owedToMe={totalOwedToMe} iOwe={totalIOwe} currency={currency} />

          <div className="mt-6 space-y-4">
            {groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#1e2d40] px-4 py-12 text-center">
                <UsersIcon className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-sm text-slate-500 mb-1">No debts tracked yet.</p>
                <p className="text-xs text-slate-600">
                  Add one when you cover someone&rsquo;s meal — or they cover yours.
                </p>
              </div>
            ) : (
              groups.map(g => (
                <DebtPersonSection
                  key={g.person.id}
                  group={g}
                  currency={currency}
                  onDeletePerson={() => setConfirmDeletePerson(g.person)}
                />
              ))
            )}
          </div>

        </div>
      </div>

      {addOpen && <AddDebtSheet onClose={() => setAddOpen(false)} />}

      {confirmDeletePerson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setConfirmDeletePerson(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-[#111827] border border-[#1e2d40] p-6 text-center"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-3xl mb-3">{confirmDeletePerson.emoji}</p>
            <p className="font-semibold text-white mb-1">
              Delete {confirmDeletePerson.name}?
            </p>
            <p className="text-sm text-slate-500 mb-5">
              Every debt logged with them is deleted too, settled ones included. This
              cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeletePerson(null)}
                className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteDebtPerson(confirmDeletePerson.id);
                  setConfirmDeletePerson(null);
                }}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
