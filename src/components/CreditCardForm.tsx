'use client';

import { useState } from 'react';
import { useApp, type CreditCard } from './AppContext';
import WalletPresetPicker, { presetIcon } from './WalletPresetPicker';
import { WALLET_PRESET_GROUPS, type WalletPreset } from '@/lib/walletPresets';
import { parseCardForm, type CardFormFields } from '@/lib/creditCard';
import { ChevronDownIcon } from './Icons';

// Cards come from banks, not from e-wallets.
const CARD_PRESET_GROUPS = WALLET_PRESET_GROUPS.filter(g => g.label !== 'Cash & e-wallets');
const CARD_PRESETS = CARD_PRESET_GROUPS.flatMap(g => g.presets);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const label = 'mb-2 text-xs text-ink-3';
const field = 'w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-sm';

// Editing starts from the card; adding starts blank, with the rates most
// Philippine cards charge already filled in.
const fieldsOf = (card?: CreditCard): CardFormFields => ({
  name: card?.name ?? '',
  creditLimit: card ? String(card.creditLimit) : '',
  openingBalance: card ? String(card.openingBalance) : '',
  statementDay: card ? String(card.statementDay) : '',
  dueDay: card ? String(card.dueDay) : '',
  monthlyInterestRate: card ? String(card.monthlyInterestRate) : '3',
  minPaymentPercent: card ? String(card.minPaymentPercent) : '3',
  minPaymentFloor: card && card.minPaymentFloor ? String(card.minPaymentFloor) : '',
  lateFee: card?.lateFee != null ? String(card.lateFee) : '',
  annualFee: card?.annualFee != null ? String(card.annualFee) : '',
  annualFeeMonth: card?.annualFeeMonth != null ? String(card.annualFeeMonth) : '',
});

interface Props {
  /** The card being edited, or nothing when adding one. */
  card?: CreditCard;
  onDone: () => void;
}

// A card's terms are typed once here; every statement figure is worked out
// from them afterwards, so this is the only place they are entered.
export default function CreditCardForm({ card, onDone }: Props) {
  const { addCreditCard, updateCreditCard, settings } = useApp();
  const [fields, setFields] = useState<CardFormFields>(() => fieldsOf(card));
  const [icon, setIcon] = useState(card?.icon ?? 'credit-card');
  const [showFees, setShowFees] = useState(Boolean(card && (card.lateFee !== null || card.annualFee !== null)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof CardFormFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFields(prev => ({ ...prev, [key]: e.target.value }));

  const preset = CARD_PRESETS.find(p => p.name === fields.name) ?? null;

  const pickPreset = (p: WalletPreset) => {
    setFields(prev => ({ ...prev, name: p.name }));
    setIcon(presetIcon(p));
  };

  const save = async () => {
    const parsed = parseCardForm(fields);
    if (!parsed.ok) { setError(parsed.error); return; }
    setSaving(true);
    const ok = card
      ? await updateCreditCard(card.id, { ...parsed.values, icon })
      : await addCreditCard({ ...parsed.values, icon });
    setSaving(false);
    if (ok) onDone();
    else setError('Couldn’t save the card. Check your connection and try again.');
  };

  // text + inputMode rather than type="number": no stepper on any platform,
  // and mobile still gets the numeric keypad. The same choice the wallet form makes.
  const amountField = (key: keyof CardFormFields, placeholder: string) => (
    <input
      type="text" inputMode="decimal" value={fields[key]} onChange={set(key)}
      placeholder={placeholder} className={field}
    />
  );

  return (
    <>
      <p className={label}>Bank</p>
      <div className="mb-4">
        <WalletPresetPicker
          selected={preset}
          onPick={pickPreset}
          groups={CARD_PRESET_GROUPS}
          title="Which bank?"
          placeholder="Choose a bank"
        />
      </div>

      <p className={label}>Name</p>
      <input
        type="text" value={fields.name} onChange={set('name')}
        placeholder="e.g. BPI Gold" className={`${field} mb-4`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className={label}>Credit limit</p>
          {amountField('creditLimit', '50000')}
        </div>
        <div>
          <p className={label}>Owed right now</p>
          {amountField('openingBalance', '0.00')}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className={label}>Statement day</p>
          <input
            type="text" inputMode="numeric" value={fields.statementDay} onChange={set('statementDay')}
            placeholder="5" className={field}
          />
        </div>
        <div>
          <p className={label}>Due day</p>
          <input
            type="text" inputMode="numeric" value={fields.dueDay} onChange={set('dueDay')}
            placeholder="25" className={field}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className={label}>Interest % a month</p>
          {amountField('monthlyInterestRate', '3')}
        </div>
        <div>
          <p className={label}>Minimum %</p>
          {amountField('minPaymentPercent', '3')}
        </div>
      </div>

      <p className={label}>Minimum at least ({settings.currency})</p>
      <div className="mb-4">{amountField('minPaymentFloor', '500')}</div>

      <button
        onClick={() => setShowFees(v => !v)}
        aria-expanded={showFees}
        className="mb-4 flex w-full items-center justify-between rounded-xl border border-line bg-raised px-3 py-2.5 text-sm text-ink-2"
      >
        <span>Late and annual fees <span className="text-ink-4">(optional)</span></span>
        <ChevronDownIcon className={`h-4 w-4 text-ink-3 transition-transform ${showFees ? 'rotate-180' : ''}`} />
      </button>

      {showFees && (
        <>
          <p className={label}>Late payment fee</p>
          <div className="mb-4">{amountField('lateFee', '850')}</div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <p className={label}>Annual fee</p>
              {amountField('annualFee', '3000')}
            </div>
            <div>
              <p className={label}>Charged in</p>
              <select value={fields.annualFeeMonth} onChange={set('annualFeeMonth')} className={field}>
                <option value="">Month…</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {error && <p className="mb-3 text-xs text-danger-text">{error}</p>}

      <p className="mb-4 text-[11px] text-ink-4">
        Interest is worked out from these terms, so it is an estimate — your
        bank’s own method can differ by a few pesos.
      </p>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary active:bg-primary-hover disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : card ? 'Save card' : 'Add card'}
      </button>
    </>
  );
}
