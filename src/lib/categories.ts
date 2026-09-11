// The built-in expense categories, and how to resolve any category key —
// built-in or user-defined — to something displayable.
//
// This list had grown three near-identical copies (the expense form, the budget
// page, the activity feed), each with its own idea of the icons. New consumers
// import it from here.

export interface CategoryMeta {
  key: string; label: string; icon: string;
  // Tailwind classes for a selected chip.
  color: string;
}

// One chip color for every category. Teal marks the selection; hue is kept for
// what the money is doing, so a category can't borrow amber or red.
const CHIP = 'bg-primary-tint border-primary-edge';

export const BUILTIN_CATEGORIES: CategoryMeta[] = [
  { key: 'food',      label: 'Food',      icon: 'utensils-crossed', color: CHIP },
  { key: 'transport', label: 'Transport', icon: 'car', color: CHIP },
  { key: 'bills',     label: 'Bills',     icon: 'receipt-text', color: CHIP },
  { key: 'electric',  label: 'Electric',  icon: 'zap', color: CHIP },
  { key: 'shopping',  label: 'Shopping',  icon: 'shopping-bag', color: CHIP },
  { key: 'health',    label: 'Health',    icon: 'pill', color: CHIP },
  { key: 'other',     label: 'Other',     icon: 'shapes', color: CHIP },
];

const CUSTOM_COLOR = CHIP;

// Built-ins plus the user's own, minus any they have hidden on the Budget page.
export function visibleCategories(
  custom: { key: string; label: string; icon: string }[],
  hidden: string[],
): CategoryMeta[] {
  return [
    ...BUILTIN_CATEGORIES,
    ...custom.map(c => ({ ...c, color: CUSTOM_COLOR })),
  ].filter(c => !hidden.includes(c.key));
}

// A category key as it should be shown. Falls back to the key itself so an
// expense logged under a category the user later deleted still reads sensibly
// rather than going blank.
export function categoryMeta(
  key: string,
  custom: { key: string; label: string; icon: string }[],
): { icon: string; label: string } {
  const found = custom.find(c => c.key === key)
    ?? BUILTIN_CATEGORIES.find(c => c.key === key);
  return found ? { icon: found.icon, label: found.label } : { icon: 'shapes', label: key };
}
