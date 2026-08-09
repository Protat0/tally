'use client';

import { useRef, useState } from 'react';

// Drag a bottom sheet down to dismiss it. Spread `handlers` and `style` onto
// the sheet panel itself — the element that scrolls, not the backdrop.
//
// Two guards keep the gesture from fighting the content:
//   - it only arms below `md`, where sheets are bottom-anchored; above that
//     they are centred dialogs and sliding them down makes no sense.
//   - it only arms when the panel is scrolled to the very top, so swiping
//     down inside a long sheet scrolls it back up first, as expected.

const CLOSE_THRESHOLD_PX = 110;
const MOBILE_MAX_WIDTH = 768;

export function useSwipeToClose(onClose: () => void) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (window.innerWidth >= MOBILE_MAX_WIDTH) return;
    if (e.currentTarget.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    // Downward only: an upward drag is the user reaching for content above.
    setDragY(delta > 0 ? delta : 0);
  };

  const onTouchEnd = () => {
    if (startY.current === null) return;
    const shouldClose = dragY > CLOSE_THRESHOLD_PX;
    startY.current = null;
    setDragY(0);
    if (shouldClose) onClose();
  };

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    style: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      // No transition while the finger is down, or the sheet lags behind it;
      // springing back on release should be animated.
      transition: dragY ? 'none' : 'transform 200ms ease-out',
    } as React.CSSProperties,
  };
}
