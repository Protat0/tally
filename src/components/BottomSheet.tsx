'use client';

import { useModalLock } from './ModalLock';
import { useSwipeToClose } from './useSwipeToClose';

interface Props {
  onClose: () => void;
  children: React.ReactNode;
}

// The app's one sheet chrome: bottom-anchored on mobile, centered on desktop.
// Backdrop click closes; clicks inside do not bubble out to it.
export default function BottomSheet({ onClose, children }: Props) {
  useModalLock();
  const swipe = useSwipeToClose(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-surface md:border md:border-line elev-sheet p-6 pb-8 md:pb-6 max-h-[85vh] overflow-y-auto overflow-x-hidden"
        onClick={e => e.stopPropagation()}
        style={swipe.style}
        {...swipe.handlers}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line md:hidden" />
        {children}
      </div>
    </div>
  );
}
