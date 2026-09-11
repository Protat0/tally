// Electricity rules, kept pure: no React, no Supabase.
//
// The shapes below are the fields these rules read. An Appliance has them, so
// one passes in without importing the client-only AppContext here.

export interface PinnableAppliance {
  pinnedToHome: boolean;
}

// The dashboard's order: pinned appliances first, then the rest, each group in
// the order the appliances were added. Returns a new array; the list in
// settings is left as it was.
export function homeOrder<A extends PinnableAppliance>(appliances: A[]): A[] {
  return [
    ...appliances.filter(a => a.pinnedToHome),
    ...appliances.filter(a => !a.pinnedToHome),
  ];
}
