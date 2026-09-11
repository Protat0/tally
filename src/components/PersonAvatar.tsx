import { initialOf } from '@/lib/icons';

type AvatarTone = 'growth' | 'danger' | 'neutral';
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const toneClass: Record<AvatarTone, string> = {
  growth: 'border-growth-edge bg-growth-tint text-growth-text',
  danger: 'border-danger-edge bg-danger-tint text-danger-text',
  neutral: 'border-line bg-raised text-ink-2',
};

const sizeClass: Record<AvatarSize, string> = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-10 w-10 text-[15px]',
  lg: 'h-14 w-14 text-xl',
};

interface Props {
  name: string;
  /** Green when they owe you, red when you owe them. */
  tone?: AvatarTone;
  size?: AvatarSize;
  className?: string;
}

// People aren't icons. A debt contact is their initial on a tint, the way the
// design draws them. Hidden from screen readers: the name is always beside it.
export default function PersonAvatar({ name, tone = 'neutral', size = 'md', className = '' }: Props) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border font-bold leading-none ${sizeClass[size]} ${toneClass[tone]} ${className}`}
    >
      {initialOf(name)}
    </span>
  );
}
