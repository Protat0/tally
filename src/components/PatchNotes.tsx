'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import BottomSheet from './BottomSheet';
import { IconTile } from './AppIcon';
import { PATCH_NOTES, SEEN_VERSION_KEY, unseenNotes, type PatchNote } from '@/lib/patchNotes';

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function markLatestSeen() {
  const latest = PATCH_NOTES[0];
  if (!latest) return;
  try {
    localStorage.setItem(SEEN_VERSION_KEY, latest.version);
  } catch {
    // Storage blocked: nothing is remembered, so the notes show again next visit.
  }
}

function formatDate(day: string): string {
  // Midday, so no timezone can move the date to the day before.
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

// "What's new" after an update. Mounted only once the account has loaded, so
// it never renders on the server and storage is readable on its first render.
// Whenever there is nothing to show — including after "Got it" — the latest
// version is recorded as seen, so each device decides once per release.
export default function PatchNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<PatchNote[]>(
    () => unseenNotes(readSeen(), PATCH_NOTES, user?.created_at),
  );

  useEffect(() => {
    if (notes.length === 0) markLatestSeen();
  }, [notes.length]);

  if (notes.length === 0) return null;

  const close = () => setNotes([]);

  return (
    <BottomSheet onClose={close}>
      <div className="mb-5 flex items-center gap-3">
        <IconTile icon="sparkles" />
        <div>
          <p className="text-lg font-bold leading-tight tracking-tight">What’s new</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {notes.length === 1
              ? formatDate(notes[0].date)
              : `${notes.length} updates since you last looked`}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {notes.map(n => (
          <section key={n.version}>
            {notes.length > 1 && (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
                {formatDate(n.date)}
              </p>
            )}
            <p className="mb-2 text-[15px] font-semibold">{n.title}</p>
            <ul className="space-y-2">
              {n.items.map(item => (
                <li key={item} className="flex gap-2.5 text-sm leading-snug text-ink-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <button
        onClick={close}
        className="mt-6 w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary hover:bg-primary-hover transition-colors"
      >
        Got it
      </button>
    </BottomSheet>
  );
}
