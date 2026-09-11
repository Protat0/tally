'use client';

import { useState } from 'react';
import { useApp, type DebtPerson } from './AppContext';
import NestedSheet from './NestedSheet';
import PersonAvatar from './PersonAvatar';
import { CheckIcon, ChevronRightIcon, PlusIcon, SearchIcon } from './Icons';
import { groupPeople, searchPeople, canAddPerson } from '@/lib/people';

// How many recently used people are listed above everyone else.
const RECENT_COUNT = 5;

// Who owes you in a split can be several people; who paid, or who a debt is
// with, is one. `multiple` picks which, and the value types follow it.
type Props = { title?: string } & (
  | { multiple: true; selected: string[]; onChange: (ids: string[]) => void }
  | { multiple?: false; selected: string | null; onChange: (id: string) => void }
);

// Choosing debt contacts. In the form it is one row; the people themselves are
// listed in a sheet of their own, so however many there are, the form stays short.
export default function PersonPicker(props: Props) {
  const { debtPeople } = useApp();
  const [open, setOpen] = useState(false);

  const nameOf = (id: string) => debtPeople.find(p => p.id === id)?.name ?? 'someone';

  return (
    <>
      {props.multiple ? (
        // The people already chosen are rows in the form, so this only opens the list.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-line bg-raised px-3 py-2.5 text-sm text-primary-text"
        >
          <PlusIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">
            {props.selected.length > 0 ? 'Add or remove people' : 'Choose people'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm"
        >
          {props.selected ? (
            <>
              <PersonAvatar name={nameOf(props.selected)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-left text-ink">{nameOf(props.selected)}</span>
            </>
          ) : (
            <span className="flex-1 text-left text-ink-4">Choose a person</span>
          )}
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-3" />
        </button>
      )}

      {open && <PeopleSheet {...props} onDone={() => setOpen(false)} />}
    </>
  );
}

// Mounted fresh on each open, so the search always starts empty. A nested
// sheet, since the forms that open it are sheets and full-screen overlays.
function PeopleSheet(props: Props & { onDone: () => void }) {
  const { debtPeople, debtEntries, addDebtPerson } = useApp();
  const [query, setQuery]   = useState('');
  const [saving, setSaving] = useState(false);

  const title = props.title ?? (props.multiple ? 'Who owes you?' : 'Choose a person');
  const selectedIds = props.multiple ? props.selected : props.selected ? [props.selected] : [];
  const isSelected = (id: string) => selectedIds.includes(id);

  const { recent, rest } = groupPeople(debtPeople, debtEntries, RECENT_COUNT);
  const searching = query.trim().length > 0;
  const matches = searchPeople([...recent, ...rest], query);
  const canAdd = canAddPerson(debtPeople, query);
  // Headings only help when there are two groups to tell apart.
  const headed = recent.length > 0 && rest.length > 0;

  // Several people: tap to tick or untick, then Done. One person: the tap is the choice.
  const pick = (id: string) => {
    if (props.multiple) {
      props.onChange(isSelected(id)
        ? props.selected.filter(s => s !== id)
        : [...props.selected, id]);
    } else {
      props.onChange(id);
      props.onDone();
    }
  };

  const create = async () => {
    if (!canAdd || saving) return;
    setSaving(true);
    const id = await addDebtPerson({ name: query.trim(), emoji: '' });
    setSaving(false);
    if (!id) return;
    setQuery('');
    pick(id);
  };

  const row = (p: DebtPerson) => (
    <button
      key={p.id}
      type="button"
      role={props.multiple ? 'checkbox' : 'radio'}
      aria-checked={isSelected(p.id)}
      onClick={() => pick(p.id)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-raised"
    >
      <PersonAvatar name={p.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
          props.multiple ? 'rounded-md' : 'rounded-full'
        } ${isSelected(p.id) ? 'border-primary bg-primary text-on-primary' : 'border-line'}`}
      >
        {isSelected(p.id) && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );

  const heading = (text: string) => (
    <p className="mb-1 mt-3 px-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">{text}</p>
  );

  return (
    <NestedSheet onClose={props.onDone}>
      <p className="mb-4 text-lg font-semibold text-ink">{title}</p>

      {/* Stays in reach while a long list scrolls beneath it. */}
      <div className="sticky top-0 z-10 -mx-6 bg-surface px-6 py-2">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-primary">
          <SearchIcon className="h-4 w-4 shrink-0 text-ink-4" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create(); }}
            placeholder={debtPeople.length > 0 ? 'Search or add a name' : 'Add a name'}
            // Only when there is nobody to pick: a keyboard over the list gets in the way.
            autoFocus={debtPeople.length === 0}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink placeholder-ink-5 outline-none"
          />
        </div>
      </div>

      <div role={props.multiple ? 'group' : 'radiogroup'} aria-label={title}>
        {canAdd && (
          <button
            type="button"
            onClick={create}
            disabled={saving}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm text-primary-text hover:bg-raised disabled:opacity-40"
          >
            <PersonAvatar name={query} size="sm" />
            <span className="min-w-0 flex-1 truncate">
              {saving ? 'Adding…' : `Add “${query.trim()}”`}
            </span>
            <PlusIcon className="h-4 w-4 shrink-0" />
          </button>
        )}

        {searching ? matches.map(row) : (
          <>
            {headed && heading('Recent')}
            {recent.map(row)}
            {headed && heading('Everyone')}
            {rest.map(row)}
          </>
        )}

        {debtPeople.length === 0 && !searching && (
          <p className="px-2 py-6 text-center text-sm text-ink-4">
            No one yet. Type a name to add someone.
          </p>
        )}
      </div>

      {props.multiple && (
        <button
          type="button"
          onClick={props.onDone}
          className="mt-4 w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary hover:bg-primary-hover transition-colors"
        >
          Done{props.selected.length > 0 ? ` · ${props.selected.length} selected` : ''}
        </button>
      )}
    </NestedSheet>
  );
}
