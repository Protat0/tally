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
      { name: 'Cash',      icon: '💵' },
      { name: 'GCash',     icon: '📱' },
      { name: 'Maya',      icon: '📱' },
      { name: 'GrabPay',   icon: '📱' },
      { name: 'ShopeePay', icon: '📱' },
      { name: 'Coins.ph',  icon: '📱' },
    ],
  },
  {
    label: 'Banks',
    presets: [
      { name: 'BDO',             icon: '🏦' },
      { name: 'BPI',             icon: '🏦' },
      { name: 'Metrobank',       icon: '🏦' },
      { name: 'Landbank',        icon: '🏦' },
      { name: 'PNB',             icon: '🏦' },
      { name: 'Security Bank',   icon: '🏦' },
      { name: 'UnionBank',       icon: '🏦' },
      { name: 'China Bank',      icon: '🏦' },
      { name: 'RCBC',            icon: '🏦' },
      { name: 'EastWest',        icon: '🏦' },
      { name: 'PSBank',          icon: '🏦' },
      { name: 'DBP',             icon: '🏦' },
      { name: 'AUB',             icon: '🏦' },
      { name: 'Maybank',         icon: '🏦' },
      { name: 'Bank of Commerce', icon: '🏦' },
      { name: 'HSBC',            icon: '🏦' },
    ],
  },
  {
    label: 'Digital banks',
    presets: [
      { name: 'GoTyme',      icon: '💳' },
      { name: 'Tonik',       icon: '💳' },
      { name: 'SeaBank',     icon: '💳' },
      { name: 'Maya Bank',   icon: '💳' },
      { name: 'UNO Digital', icon: '💳' },
      { name: 'Netbank',     icon: '💳' },
      { name: 'CIMB',        icon: '💳' },
    ],
  },
];

// Flat lookup, for resolving a chosen name back to its icon.
export const ALL_WALLET_PRESETS: WalletPreset[] =
  WALLET_PRESET_GROUPS.flatMap(g => g.presets);
