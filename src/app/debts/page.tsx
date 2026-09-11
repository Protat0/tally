'use client';

import { useState, useMemo } from 'react';
import { useApp, DebtPerson, DebtEntry } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import DebtSummary from '@/components/DebtSummary';
import DebtPersonSection from '@/components/DebtPersonSection';
import AddDebtSheet from '@/components/AddDebtSheet';
import { ScrollLock } from '@/components/ModalLock';
import { ChevronDownIcon, UsersIcon } from '@/components/Icons';
import PersonAvatar from '@/components/PersonAvatar';
import { groupDebts, type PersonDebts } from '@/lib/debtGroups';

export type PersonGroup = PersonDebts<DebtPerson, DebtEntry>;

export default function DebtsPage() {
  const {
    debtPeople, debtEntries, totalOwedToMe, totalIOwe,
    totalBalance, settings, deleteDebtPerson,
  } = useApp();
  const { currency } = settings;

  const [addOpen, setAddOpen] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [confirmDeletePerson, setConfirmDeletePerson] = useState<DebtPerson | null>(null);

  // Only people with something still open are listed. Everyone else — settled
  // up, or never in a debt — waits under one collapsed row. Worked out from the
  // entries rather than stored, so a new debt brings a person straight back.
  const { active, settled } = useMemo(
    () => groupDebts(debtPeople, debtEntries),
    [debtPeople, debtEntries],
  );

  const section = (g: PersonGroup) => (
    <DebtPersonSection
      key={g.person.id}
      group={g}
      currency={currency}
      onDeletePerson={() => setConfirmDeletePerson(g.person)}
    />
  );

  return (
    <div className="min-h-screen bg-canvas">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Debts"
            right={
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Add debt"
                className="px-1 text-[13px] font-semibold text-primary-text hover:text-primary-hover transition-colors"
              >
                Add
              </button>
            }
          />

          <DebtSummary
            owedToMe={totalOwedToMe}
            iOwe={totalIOwe}
            totalBalance={totalBalance}
            currency={currency}
          />

          <div className="mt-3 space-y-3">
            {debtPeople.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center">
                <UsersIcon className="w-8 h-8 text-ink-5 mx-auto mb-2" />
                <p className="text-sm text-ink-3 mb-1">No debts tracked yet.</p>
                <p className="text-xs text-ink-4">
                  Add one when you cover someone&rsquo;s meal — or they cover yours.
                </p>
              </div>
            ) : (
              <>
                <p className="px-0.5 pt-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
                  By person
                </p>

                {active.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
                    <p className="text-sm text-ink-3 mb-1">All settled up.</p>
                    <p className="text-xs text-ink-4">Nobody owes you, and you owe nobody.</p>
                  </div>
                ) : active.map(section)}

                {settled.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowSettled(v => !v)}
                      aria-expanded={showSettled}
                      className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2 hover:text-ink transition-colors"
                    >
                      <span>
                        Settled up · {settled.length} {settled.length === 1 ? 'person' : 'people'}
                      </span>
                      <ChevronDownIcon
                        className={`h-4 w-4 text-ink-3 transition-transform ${showSettled ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showSettled && settled.map(section)}
                  </>
                )}
              </>
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
          <ScrollLock />
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-surface border border-line p-6 text-center"
            onClick={e => e.stopPropagation()}
          >
            <PersonAvatar name={confirmDeletePerson.name} size="lg" className="mx-auto mb-3" />
            <p className="font-semibold text-ink mb-1">
              Delete {confirmDeletePerson.name}?
            </p>
            <p className="text-sm text-ink-3 mb-5">
              Every debt logged with them is deleted too, settled ones included. This
              cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeletePerson(null)}
                className="flex-1 rounded-xl bg-raised py-3 text-sm font-medium text-ink-2 hover:bg-line transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteDebtPerson(confirmDeletePerson.id);
                  setConfirmDeletePerson(null);
                }}
                className="flex-1 rounded-xl bg-danger-strong py-3 text-sm font-semibold text-white hover:bg-danger transition-colors"
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
