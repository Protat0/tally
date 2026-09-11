// What a bar's fill means. Named by role, not hue: a caller says "this is a
// warning" and the palette decides what a warning looks like.
export type Tone = 'growth' | 'warning' | 'danger' | 'primary';

interface Props {
  value: number;
  max: number;
  tone?: Tone;
  /** sm is the category-card bar; md is everything else. */
  size?: 'sm' | 'md';
  className?: string;
  showLabel?: boolean;
}

const fillClass: Record<Tone, string> = {
  growth:  'bg-growth',
  warning: 'bg-warning',
  danger:  'bg-danger',
  primary: 'bg-primary',
};

const heightClass = { sm: 'h-[7px]', md: 'h-2.5' };

export default function ProgressBar({
  value, max, tone = 'primary', size = 'md', className = '', showLabel = false,
}: Props) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={`w-full ${className}`}>
      <div className={`${heightClass[size]} w-full rounded-full bg-raised overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${fillClass[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-right text-xs text-ink-3">{pct.toFixed(0)}%</p>
      )}
    </div>
  );
}
