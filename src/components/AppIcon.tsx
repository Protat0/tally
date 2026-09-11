import {
  ArrowLeftRight, Banknote, BookOpen, Briefcase, Car, Coffee, Coins, CreditCard,
  Dumbbell, Gamepad2, Gift, Handshake, House, Landmark, Laptop, Lightbulb, Music,
  PawPrint, PiggyBank, Pill, Plane, Popcorn, ReceiptText, Shapes, ShieldCheck,
  Shirt, ShoppingBag, ShowerHead, Smartphone, Sparkles, Sprout, Target, Undo2,
  UtensilsCrossed, Wallet, Zap,
  type LucideIcon, type LucideProps,
} from 'lucide-react';
import { resolveIconKey, type IconKey } from '@/lib/icons';

// Record<IconKey, LucideIcon> makes the compiler insist every key has a
// drawing: add a key to ICON_KEYS and forget it here, and the build fails.
const ICONS: Record<IconKey, LucideIcon> = {
  'utensils-crossed': UtensilsCrossed,
  'car': Car,
  'receipt-text': ReceiptText,
  'lightbulb': Lightbulb,
  'zap': Zap,
  'shopping-bag': ShoppingBag,
  'pill': Pill,
  'shapes': Shapes,
  'target': Target,
  'paw-print': PawPrint,
  'gamepad-2': Gamepad2,
  'book-open': BookOpen,
  'coffee': Coffee,
  'house': House,
  'smartphone': Smartphone,
  'piggy-bank': PiggyBank,
  'sprout': Sprout,
  'gift': Gift,
  'plane': Plane,
  'popcorn': Popcorn,
  'dumbbell': Dumbbell,
  'shower-head': ShowerHead,
  'shirt': Shirt,
  'music': Music,
  'credit-card': CreditCard,
  'landmark': Landmark,
  'banknote': Banknote,
  'coins': Coins,
  'wallet': Wallet,
  'briefcase': Briefcase,
  'laptop': Laptop,
  'undo-2': Undo2,
  'sparkles': Sparkles,
  'handshake': Handshake,
  'arrow-left-right': ArrowLeftRight,
  'shield-check': ShieldCheck,
};

interface AppIconProps extends Omit<LucideProps, 'ref'> {
  /** An icon key, or an emoji saved before icons replaced them. */
  icon: string;
  /** Drawn when `icon` is empty or not recognised. */
  fallback?: IconKey;
}

// An icon that comes from data — a wallet, a category, an income source. It
// is decorative: the name beside it is what a screen reader should announce.
export default function AppIcon({ icon, fallback = 'shapes', ...rest }: AppIconProps) {
  const Icon = ICONS[resolveIconKey(icon, fallback)];
  return <Icon aria-hidden {...rest} />;
}

type TileSize = 'sm' | 'md' | 'lg';
type TileTone = 'primary' | 'growth';

const TILE: Record<TileSize, { box: string; glyph: string }> = {
  sm: { box: 'h-[26px] w-[26px] rounded-lg', glyph: 'h-[15px] w-[15px]' },
  md: { box: 'h-10 w-10 rounded-xl', glyph: 'h-5 w-5' },
  lg: { box: 'h-14 w-14 rounded-2xl', glyph: 'h-7 w-7' },
};

// Teal marks the thing itself; green only where the tile stands for money
// coming in.
const TONE: Record<TileTone, string> = {
  primary: 'border-primary-edge bg-primary-tint text-primary-text',
  growth: 'border-growth-edge bg-growth-tint text-growth-text',
};

interface IconTileProps {
  icon: string;
  fallback?: IconKey;
  size?: TileSize;
  tone?: TileTone;
  className?: string;
}

// The icon on its tinted square — how a category, wallet or sheet shows what
// it is about.
export function IconTile({ icon, fallback, size = 'md', tone = 'primary', className = '' }: IconTileProps) {
  return (
    <span className={`flex shrink-0 items-center justify-center border ${TILE[size].box} ${TONE[tone]} ${className}`}>
      <AppIcon icon={icon} fallback={fallback} className={TILE[size].glyph} />
    </span>
  );
}
