'use client';

import { ChevronUpIcon, ChevronDownIcon } from './Icons';

interface Props {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Classes for the <input> itself (width, text alignment, etc.). */
  inputClassName?: string;
  /** Classes for the wrapping flex row. */
  className?: string;
}

/**
 * Number input with custom up/down stepper arrows.
 * Native browser spinners are hidden globally (see globals.css).
 */
export default function NumberField({
  value, onChange, step = 1, min, max,
  placeholder = '0', inputClassName = '', className = '',
}: Props) {
  const clamp = (n: number) => {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };

  const bump = (dir: 1 | -1) => onChange(clamp((value || 0) + dir * step));

  return (
    <div className={`flex items-stretch gap-1.5 ${className}`}>
      <input
        type="number"
        inputMode="decimal"
        value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder}
        className={inputClassName}
      />
      <div className="flex flex-col overflow-hidden rounded-lg border border-line shrink-0">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(1)}
          aria-label="Increase"
          className="flex flex-1 items-center justify-center bg-raised px-1.5 text-ink-2 hover:bg-line hover:text-ink active:bg-line-strong transition-colors"
        >
          <ChevronUpIcon className="w-3.5 h-3.5" />
        </button>
        <div className="h-px bg-line" />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(-1)}
          aria-label="Decrease"
          className="flex flex-1 items-center justify-center bg-raised px-1.5 text-ink-2 hover:bg-line hover:text-ink active:bg-line-strong transition-colors"
        >
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
