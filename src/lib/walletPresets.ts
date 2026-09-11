// Common Philippine wallets and banks, offered as one-tap presets when adding
// a wallet. Tapping one fills the name and a matching icon; both stay editable.
//
// Deliberately excludes brands that no longer exist as consumer banks:
// Robinsons Bank (merged into BPI, 2024), UCPB (into Landbank, 2022) and
// Citibank's consumer arm (into UnionBank, 2022).

export interface WalletPreset {
  name: string;
  icon: string;
}

export const WALLET_PRESET_GROUPS: { label: string; presets: WalletPreset[] }[] = [
  {
    label: 'Cash & e-wallets',
    presets: [
      { name: 'Cash',      icon: 'banknote' },
      { name: 'GCash',     icon: 'smartphone' },
      { name: 'Maya',      icon: 'smartphone' },
      { name: 'GrabPay',   icon: 'smartphone' },
      { name: 'ShopeePay', icon: 'smartphone' },
      { name: 'Coins.ph',  icon: 'smartphone' },
    ],
  },
  {
    label: 'Banks',
    presets: [
      { name: 'BDO',             icon: 'landmark' },
      { name: 'BPI',             icon: 'landmark' },
      { name: 'Metrobank',       icon: 'landmark' },
      { name: 'Landbank',        icon: 'landmark' },
      { name: 'PNB',             icon: 'landmark' },
      { name: 'Security Bank',   icon: 'landmark' },
      { name: 'UnionBank',       icon: 'landmark' },
      { name: 'China Bank',      icon: 'landmark' },
      { name: 'RCBC',            icon: 'landmark' },
      { name: 'EastWest',        icon: 'landmark' },
      { name: 'PSBank',          icon: 'landmark' },
      { name: 'DBP',             icon: 'landmark' },
      { name: 'AUB',             icon: 'landmark' },
      { name: 'Maybank',         icon: 'landmark' },
      { name: 'Bank of Commerce', icon: 'landmark' },
      { name: 'HSBC',            icon: 'landmark' },
    ],
  },
  {
    label: 'Digital banks',
    presets: [
      { name: 'GoTyme',      icon: 'credit-card' },
      { name: 'Tonik',       icon: 'credit-card' },
      { name: 'SeaBank',     icon: 'credit-card' },
      { name: 'Maya Bank',   icon: 'credit-card' },
      { name: 'UNO Digital', icon: 'credit-card' },
      { name: 'Netbank',     icon: 'credit-card' },
      { name: 'CIMB',        icon: 'credit-card' },
    ],
  },
];

// Flat lookup, for resolving a chosen name back to its icon.
export const ALL_WALLET_PRESETS: WalletPreset[] =
  WALLET_PRESET_GROUPS.flatMap(g => g.presets);
