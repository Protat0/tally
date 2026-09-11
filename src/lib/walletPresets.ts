// Common Philippine wallets and banks, offered as one-tap presets when adding
// a wallet. Tapping one fills the name and the brand's logo; both stay editable.
//
// Deliberately excludes brands that no longer exist as consumer banks:
// Robinsons Bank (merged into BPI, 2024), UCPB (into Landbank, 2022) and
// Citibank's consumer arm (into UnionBank, 2022). SeaBank Philippines now
// trades as MariBank — its app and site both carry the MariBank mark — so it
// is offered under that name.

import type { IconKey, LogoKey } from './icons';

export interface WalletPreset {
  name: string;
  /** The drawn icon, for anywhere a logo can't be shown. */
  icon: IconKey;
  /** The brand's logo. Cash is not a brand, so it has none. */
  logo?: LogoKey;
}

export const WALLET_PRESET_GROUPS: { label: string; presets: WalletPreset[] }[] = [
  {
    label: 'Cash & e-wallets',
    presets: [
      { name: 'Cash',      icon: 'banknote' },
      { name: 'GCash',     icon: 'smartphone', logo: 'gcash' },
      { name: 'Maya',      icon: 'smartphone', logo: 'maya' },
      { name: 'GrabPay',   icon: 'smartphone', logo: 'grabpay' },
      { name: 'ShopeePay', icon: 'smartphone', logo: 'shopeepay' },
      { name: 'Coins.ph',  icon: 'smartphone', logo: 'coins-ph' },
    ],
  },
  {
    label: 'Banks',
    presets: [
      { name: 'BDO',              icon: 'landmark', logo: 'bdo' },
      { name: 'BPI',              icon: 'landmark', logo: 'bpi' },
      { name: 'Metrobank',        icon: 'landmark', logo: 'metrobank' },
      { name: 'Landbank',         icon: 'landmark', logo: 'landbank' },
      { name: 'PNB',              icon: 'landmark', logo: 'pnb' },
      { name: 'Security Bank',    icon: 'landmark', logo: 'security-bank' },
      { name: 'UnionBank',        icon: 'landmark', logo: 'unionbank' },
      { name: 'China Bank',       icon: 'landmark', logo: 'china-bank' },
      { name: 'RCBC',             icon: 'landmark', logo: 'rcbc' },
      { name: 'EastWest',         icon: 'landmark', logo: 'eastwest' },
      { name: 'PSBank',           icon: 'landmark', logo: 'psbank' },
      { name: 'DBP',              icon: 'landmark', logo: 'dbp' },
      { name: 'AUB',              icon: 'landmark', logo: 'aub' },
      { name: 'Maybank',          icon: 'landmark', logo: 'maybank' },
      { name: 'Bank of Commerce', icon: 'landmark', logo: 'bank-of-commerce' },
      { name: 'HSBC',             icon: 'landmark', logo: 'hsbc' },
    ],
  },
  {
    label: 'Digital banks',
    presets: [
      { name: 'GoTyme',      icon: 'credit-card', logo: 'gotyme' },
      { name: 'Tonik',       icon: 'credit-card', logo: 'tonik' },
      { name: 'MariBank',    icon: 'credit-card', logo: 'maribank' },
      { name: 'Maya Bank',   icon: 'credit-card', logo: 'maya' },
      { name: 'UNO Digital', icon: 'credit-card', logo: 'uno-digital' },
      { name: 'Netbank',     icon: 'credit-card', logo: 'netbank' },
      { name: 'CIMB',        icon: 'credit-card', logo: 'cimb' },
    ],
  },
];

// Flat lookup, for resolving a chosen name back to its preset.
export const ALL_WALLET_PRESETS: WalletPreset[] =
  WALLET_PRESET_GROUPS.flatMap(g => g.presets);
