'use client';

import CategoryCard from './CategoryCard';
import { PlusIcon } from './Icons';

interface CatMeta { key: string; label: string; icon: string }

interface Props {
  categories: CatMeta[];
  amountFor: (key: string) => number;
  budgets: Partial<Record<string, number>>;
  currency: string;
  /** Pencil — opens the budget editor. */
  onSelect: (key: string) => void;
  /** Card body — opens the category's details. */
  onOpen: (key: string) => void;
  onAdd: () => void;
}

export default function CategoryGrid({
  categories, amountFor, budgets, currency, onSelect, onOpen, onAdd,
}: Props) {
  return (
    <div>
      <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Categories
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map(c => (
          <CategoryCard
            key={c.key}
            icon={c.icon}
            label={c.label}
            spent={amountFor(c.key)}
            budget={budgets[c.key] ?? 0}
            currency={currency}
            onEdit={() => onSelect(c.key)}
            onOpen={() => onOpen(c.key)}
          />
        ))}
        <button
          onClick={onAdd}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#1e2d40] p-4 text-slate-500 hover:border-blue-500/40 hover:text-blue-400 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="text-xs font-medium">Add</span>
        </button>
      </div>
    </div>
  );
}
