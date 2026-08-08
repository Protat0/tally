'use client';

type Color = 'green' | 'amber' | 'red' | 'blue';

interface Props {
  value: number;
  max: number;
  color?: Color;
  /** Sizing is the caller's job — the arc scales to whatever width it is given. */
  className?: string;
}

const strokeMap: Record<Color, string> = {
  green: 'stroke-emerald-500',
  amber: 'stroke-amber-500',
  red:   'stroke-red-500',
  blue:  'stroke-blue-500',
};

// A 180° arc: endpoints 80 units apart, radius 40, so exactly a semicircle.
// pathLength normalises it to 100 units, which keeps the dash maths below exact
// and independent of the geometry.
const ARC = 'M 10 50 A 40 40 0 0 1 90 50';

const STROKE = 9;

export default function HalfCircleProgress({ value, max, color = 'blue', className = 'w-24' }: Props) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className={`relative shrink-0 ${className}`}>
      <svg viewBox="0 0 100 54" className="block w-full overflow-visible">
        <path
          d={ARC}
          className="stroke-white/10"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
        {pct > 0 && (
          <path
            d={ARC}
            className={`${strokeMap[color]} transition-[stroke-dasharray] duration-500`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct} 100`}
            fill="none"
          />
        )}
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center text-sm font-bold text-white tabular-nums">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
