'use client';

import { useRef, useState } from 'react';

// Drag a list row to the left to reveal its actions. Spread `handlers` and
// `style` onto the sliding surface — the row's content, not the container the
// rail sits behind.
//
// Two guards, mirroring useSwipeToClose:
//   - it only arms below `md`. Above that there is nothing to swipe with, and
//     the rail reveals on hover and focus instead.
//   - it commits to one axis per gesture, so scrolling the feed at a slight
//     angle never drags a row sideways along the way.
//
// The open row is owned by the parent, not by this hook: only one row in a
// list may be open at a time, and a hook per row cannot enforce that.

const RAIL_WIDTH_PX = 128;
const OPEN_THRESHOLD_PX = 48;
const AXIS_LOCK_PX = 6;
const MOBILE_MAX_WIDTH = 768;

export function useSwipeActions(open: boolean, onOpenChange: (open: boolean) => void) {
  const [dragX, setDragX] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'undecided' | 'x' | 'y'>('undecided');

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (window.innerWidth >= MOBILE_MAX_WIDTH) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axis.current = 'undecided';
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;

    // Decided once and then held for the rest of the gesture. Re-deciding every
    // frame would let a mostly-vertical scroll flicker the row sideways.
    if (axis.current === 'undecided') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis.current !== 'x') return;

    // Clamped to the rail: the row never travels further than the buttons
    // behind it, in either direction.
    const from = open ? -RAIL_WIDTH_PX : 0;
    setDragX(Math.max(-RAIL_WIDTH_PX, Math.min(0, from + dx)));
  };

  const onTouchEnd = () => {
    if (!start.current) return;
    const settled = axis.current === 'x' ? dragX < -OPEN_THRESHOLD_PX : open;
    start.current = null;
    axis.current = 'undecided';
    setDragX(0);
    if (settled !== open) onOpenChange(settled);
  };

  // While a finger is down the drag wins; otherwise the row rests wherever the
  // parent says it should be.
  const offset = dragX !== 0 ? dragX : (open ? -RAIL_WIDTH_PX : 0);

  return {
    railWidth: RAIL_WIDTH_PX,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    style: {
      transform: offset ? `translateX(${offset}px)` : undefined,
      // No transition while the finger is down, or the row lags behind it;
      // settling on release should be animated.
      transition: dragX ? 'none' : 'transform 200ms ease-out',
    } as React.CSSProperties,
  };
}
