'use client';

import type { Tone } from './ProgressBar';

interface Props {
  value: number;
  max: number;
  tone?: Tone;
  /** Sizing is the caller's job — the arc scales to whatever width it is given. */
  className?: string;
}

const strokeClass: Record<Tone, string> = {
  growth:  'stroke-growth',
  warning: 'stroke-warning',
  danger:  'stroke-danger',
  primary: 'stroke-primary',
};

// A 180° arc: endpoints 80 units apart, radius 40, so exactly a semicircle.
// pathLength normalises it to 100 units, which keeps the dash maths below exact
// and independent of the geometry.
const ARC = 'M 10 50 A 40 40 0 0 1 90 50';

const STROKE = 9;

export default function HalfCircleProgress({ value, max, tone = 'primary', className = 'w-24' }: Props) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className={`relative shrink-0 ${className}`}>
      <svg viewBox="0 0 100 54" className="block w-full overflow-visible">
        <path
          d={ARC}
          className="stroke-raised"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
        {pct > 0 && (
          <path
            d={ARC}
            className={`${strokeClass[tone]} transition-[stroke-dasharray] duration-500`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct} 100`}
            fill="none"
          />
        )}
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center text-sm font-bold text-ink tabular-nums">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
