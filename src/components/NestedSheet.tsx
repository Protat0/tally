'use client';

import { createPortal } from 'react-dom';
import BottomSheet from './BottomSheet';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

interface Props {
  onClose: () => void;
  children: React.ReactNode;
}

// A sheet opened from inside another sheet or a full-screen form.
//
// Portalled to <body>, so no ancestor's layout can trap or clip it. React still
// bubbles events from a portal to the components that rendered it, so touches
// and clicks stop at the wrapper — otherwise swiping this sheet down would drag
// the sheet beneath it too.
export default function NestedSheet({ onClose, children }: Props) {
  return createPortal(
    <div onClick={stop} onTouchStart={stop} onTouchMove={stop} onTouchEnd={stop}>
      <BottomSheet onClose={onClose}>{children}</BottomSheet>
    </div>,
    document.body,
  );
}
