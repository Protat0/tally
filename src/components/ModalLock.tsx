'use client';

import { useEffect, useSyncExternalStore } from 'react';

// Tracks how many modals are currently mounted, so that:
//   1. the page behind a modal cannot be scrolled away from it, and
//   2. the floating action button can get out of the way.
//
// Counted rather than boolean because modals stack — a sheet can open a
// confirm dialog on top of itself, and the first one closing must not
// unlock the page while the second is still up.

let openCount = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const getSnapshot = () => openCount > 0;
// The server never has a modal open; without this the first client render
// would mismatch and React would warn.
const getServerSnapshot = () => false;

let restoreOverflow = '';

export function useModalLock() {
  useEffect(() => {
    openCount += 1;
    if (openCount === 1) {
      restoreOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    emit();

    return () => {
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = restoreOverflow;
      emit();
    };
  }, []);
}

// Drop this inside a modal's conditional JSX block. It renders nothing; it
// exists purely to give the hook a mount/unmount boundary that matches the
// modal's own lifetime, which inline JSX has no way to provide.
export function ScrollLock() {
  useModalLock();
  return null;
}

export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
