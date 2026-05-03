interface Props {
  value: number;
  max: number;
  color?: 'green' | 'amber' | 'red' | 'blue';
  className?: string;
  showLabel?: boolean;
}

const colorMap = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
};

export default function ProgressBar({ value, max, color = 'blue', className = '', showLabel = false }: Props) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={`w-full ${className}`}>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-right text-xs text-slate-500">{pct.toFixed(0)}%</p>
      )}
    </div>
  );
}
