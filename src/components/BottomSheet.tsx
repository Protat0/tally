'use client';

interface Props {
  onClose: () => void;
  children: React.ReactNode;
}

// The app's one sheet chrome: bottom-anchored on mobile, centered on desktop.
// Backdrop click closes; clicks inside do not bubble out to it.
export default function BottomSheet({ onClose, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
        {children}
      </div>
    </div>
  );
}
