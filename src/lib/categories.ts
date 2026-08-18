// The built-in expense categories, and how to resolve any category key —
// built-in or user-defined — to something displayable.
//
// This list had grown three near-identical copies (the expense form, the budget
// page, the activity feed), each with its own idea of the icons. New consumers
// import it from here.

export interface CategoryMeta {
  key: string; label: string; icon: string;
  // Tailwind classes for a selectable chip. Custom categories get a neutral one.
  color: string;
}

export const BUILTIN_CATEGORIES: CategoryMeta[] = [
  { key: 'food',      label: 'Food',      icon: '🍜', color: 'bg-orange-500/15 border-orange-500/40' },
  { key: 'transport', label: 'Transport', icon: '🚗', color: 'bg-blue-500/15   border-blue-500/40' },
  { key: 'bills',     label: 'Bills',     icon: '💡', color: 'bg-amber-500/15  border-amber-500/40' },
  { key: 'shopping',  label: 'Shopping',  icon: '🛍️', color: 'bg-pink-500/15   border-pink-500/40' },
  { key: 'health',    label: 'Health',    icon: '💊', color: 'bg-green-500/15  border-green-500/40' },
  { key: 'other',     label: 'Other',     icon: '✦',  color: 'bg-slate-500/15  border-slate-500/40' },
];

const CUSTOM_COLOR = 'bg-slate-500/15 border-slate-500/40';

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
  return found ? { icon: found.icon, label: found.label } : { icon: '✦', label: key };
}
