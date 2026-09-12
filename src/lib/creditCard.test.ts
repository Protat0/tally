import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, closeDateIn, dueDateAfter, minimumDue, buildStatements,
  summarizeCard, chargesInRange, parseCardForm,
  type CardTerms, type CardFormFields,
} from './creditCard.ts';

const terms = (over: Partial<CardTerms> = {}): CardTerms => ({
  creditLimit: 50000, statementDay: 5, dueDay: 25,
  monthlyInterestRate: 3, minPaymentPercent: 3, minPaymentFloor: 500,
  lateFee: null, annualFee: null, annualFeeMonth: null,
  openingBalance: 0, addedOn: '2026-01-10',
  ...over,
});
const tx = (date: string, amount: number) => ({ date, amount });

test('a statement day past the end of a month closes on its last day', () => {
  assert.equal(closeDateIn(2026, 1, 31), '2026-02-28');
  assert.equal(closeDateIn(2028, 1, 31), '2028-02-29');
  assert.equal(closeDateIn(2026, 3, 31), '2026-04-30');
  assert.equal(closeDateIn(2026, 12, 5), '2027-01-05');
  assert.equal(closeDateIn(2026, -1, 31), '2025-12-31');
});

test('a statement is due on the first due day strictly after it closes', () => {
  assert.equal(dueDateAfter('2026-01-05', 25), '2026-01-25');
  assert.equal(dueDateAfter('2026-01-25', 5), '2026-02-05');
  assert.equal(dueDateAfter('2026-01-05', 5), '2026-02-05');
  assert.equal(dueDateAfter('2026-12-20', 10), '2027-01-10');
  assert.equal(dueDateAfter('2026-02-28', 30), '2026-03-30');
});

test('days add across month and year ends', () => {
  assert.equal(addDays('2026-01-25', -7), '2026-01-18');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('the minimum is the percent or the floor, whichever is higher, capped at the balance', () => {
  assert.equal(minimumDue(10000, 3, 500), 500);
  assert.equal(minimumDue(20000, 3, 500), 600);
  assert.equal(minimumDue(300, 3, 500), 300);
  assert.equal(minimumDue(0, 3, 500), 0);
  assert.equal(minimumDue(-50, 3, 500), 0);
});

test('statements run from the latest close on or before the day the card was added', () => {
  const closes = (t: CardTerms, today: string) => buildStatements(t, [], [], today).map(s => s.closesOn);
  assert.deepEqual(closes(terms(), '2026-03-20'), ['2026-01-05', '2026-02-05', '2026-03-05']);
  // Added Jan 3, so the opening statement is the Dec 5 close before it — and by
  // Jan 20 the Jan 5 one has closed too.
  assert.deepEqual(closes(terms({ addedOn: '2026-01-03' }), '2026-01-20'), ['2025-12-05', '2026-01-05']);
  assert.deepEqual(closes(terms({ addedOn: '2026-01-05' }), '2026-01-05'), ['2026-01-05']);
});

test('the opening statement is what was owed when the card was added', () => {
  const [opening] = buildStatements(terms({ openingBalance: 2000 }), [], [], '2026-01-20');
  assert.equal(opening.opening, true);
  assert.equal(opening.balance, 2000);
  assert.equal(opening.dueOn, '2026-01-25');
  assert.equal(opening.minimumDue, 500);
  assert.deepEqual(opening.charges, { interest: 0, lateFee: 0, annualFee: 0 });
});

test('a purchase on the closing day belongs to that statement; the next day, to the next', () => {
  const s = buildStatements(terms(), [tx('2026-02-05', 1000), tx('2026-02-06', 200)], [], '2026-03-10');
  assert.equal(s[1].purchases, 1000);
  assert.equal(s[2].purchases, 200);
});

test('paid in full by the due date means no interest', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-20', 3000)], '2026-03-10');
  assert.equal(s[1].balance, 3000);
  assert.equal(s[1].paidByDue, 3000);
  assert.equal(s[2].charges.interest, 0);
  assert.equal(s[2].balance, 0);
});

test('interest is charged on the part left unpaid by the due date', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-20', 1000)], '2026-03-10');
  assert.equal(s[2].charges.interest, 60);
  assert.equal(s[2].balance, 2060);
});

test('a payment after the due date does not count as paid by due', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-27', 3000)], '2026-03-10');
  assert.equal(s[1].paidByDue, 0);
  assert.equal(s[2].charges.interest, 90);
  assert.equal(s[2].balance, 90);
});

test('the late fee applies only when set and less than the minimum was paid', () => {
  const run = (lateFee: number | null, paid: number) =>
    buildStatements(terms({ lateFee }), [tx('2026-01-20', 3000)], [tx('2026-02-20', paid)], '2026-03-10')[2];
  assert.equal(run(850, 50).charges.lateFee, 850);
  assert.equal(run(850, 500).charges.lateFee, 0);
  assert.equal(run(null, 50).charges.lateFee, 0);
});

test('the annual fee posts in its month, never on the opening statement', () => {
  const t = terms({ annualFee: 3000, annualFeeMonth: 2 });
  const s = buildStatements(t, [], [], '2026-03-10');
  assert.equal(s[1].charges.annualFee, 3000);
  assert.equal(s[1].balance, 3000);
  assert.equal(s[2].charges.annualFee, 0);

  const [opening] = buildStatements(terms({ annualFee: 3000, annualFeeMonth: 2, addedOn: '2026-02-10' }), [], [], '2026-02-20');
  assert.equal(opening.charges.annualFee, 0);
});

test('paying more than is owed leaves a credit with no minimum', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 1000)], [tx('2026-02-20', 1500)], '2026-03-10');
  assert.equal(s[2].balance, -500);
  assert.equal(s[2].minimumDue, 0);
});

// Statement day 28 with due day 30: the statement closing Feb 28 is due Mar 30,
// after the next statement closes on Mar 28. Its charges post on the first close
// on or after Mar 30. The Mar 28 statement is due Mar 30 as well and its balance
// already carries the Feb one's, so interest is charged once, not twice.
test('a due date after the next close posts its charges on the first close on or after it', () => {
  const t = terms({ statementDay: 28, dueDay: 30, addedOn: '2026-01-29' });
  const s = buildStatements(t, [tx('2026-02-10', 2000)], [], '2026-04-30');
  assert.deepEqual(s.map(x => x.closesOn), ['2026-01-28', '2026-02-28', '2026-03-28', '2026-04-28']);
  assert.equal(s[1].dueOn, '2026-03-30');
  assert.equal(s[2].charges.interest, 0);
  assert.equal(s[3].charges.interest, 60);

  const paid = buildStatements(t, [tx('2026-02-10', 2000)], [tx('2026-03-29', 2000)], '2026-04-30');
  assert.equal(paid[3].charges.interest, 0);
  assert.equal(paid[3].balance, 0);
});

test('owed now is the last statement, less payments since, plus purchases since', () => {
  const t = terms({ openingBalance: 2000 });
  const s = summarizeCard(t, [tx('2026-01-15', 500)], [tx('2026-01-18', 300)], '2026-01-20');
  assert.equal(s.last.closesOn, '2026-01-05');
  assert.equal(s.owedNow, 2200);
  assert.equal(s.unbilled, 500);
  assert.equal(s.paidSinceClose, 300);
  assert.equal(s.availableCredit, 47800);
});

test('available credit never goes below zero', () => {
  const s = summarizeCard(terms({ creditLimit: 1000, openingBalance: 1500 }), [], [], '2026-01-20');
  assert.equal(s.availableCredit, 0);
});

test('a statement with nothing owed has no status to chase', () => {
  const s = summarizeCard(terms(), [], [], '2026-01-20');
  assert.deepEqual(s.status, { kind: 'none' });
  assert.equal(s.remind, false);
});

test('a statement is due until paid, with the minimum still to pay', () => {
  const t = terms({ openingBalance: 2000 });
  assert.deepEqual(summarizeCard(t, [], [tx('2026-01-12', 300)], '2026-01-20').status, {
    kind: 'due', unpaid: 1700, dueOn: '2026-01-25', minimumLeft: 200, overdue: false,
  });
  assert.deepEqual(summarizeCard(t, [], [tx('2026-01-12', 2000)], '2026-01-20').status, { kind: 'paid' });
});

test('a reminder starts 7 days before the due date and stays once overdue', () => {
  const t = terms({ openingBalance: 2000 });
  assert.equal(summarizeCard(t, [], [], '2026-01-17').remind, false);
  assert.equal(summarizeCard(t, [], [], '2026-01-18').remind, true);
  const late = summarizeCard(t, [], [], '2026-01-26');
  assert.equal(late.remind, true);
  assert.equal(late.status.kind === 'due' && late.status.overdue, true);
});

// A purchase or payment on the closing day is already inside that statement,
// so it must not count again as activity since the statement closed.
test('transactions dated on the closing day are not counted as since', () => {
  const s = summarizeCard(terms(), [tx('2026-03-05', 500)], [tx('2026-03-05', 300)], '2026-03-10');
  assert.equal(s.last.closesOn, '2026-03-05');
  assert.equal(s.unbilled, 0);
  assert.equal(s.paidSinceClose, 0);
  assert.equal(s.owedNow, 200);
});

test('charges count in the range their statement closes in', () => {
  const { statements } = summarizeCard(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-20', 1000)], '2026-03-10');
  assert.equal(chargesInRange(statements, '2026-03-01', '2026-04-01'), 60);
  assert.equal(chargesInRange(statements, '2026-02-01', '2026-03-01'), 0);
  assert.equal(chargesInRange(statements, '2026-03-05', '2026-03-06'), 60);
  assert.equal(chargesInRange(statements, '2026-02-06', '2026-03-05'), 0);
});

const fields = (over: Partial<CardFormFields> = {}): CardFormFields => ({
  name: 'BPI Gold', creditLimit: '50000', openingBalance: '',
  statementDay: '5', dueDay: '25',
  monthlyInterestRate: '3', minPaymentPercent: '3', minPaymentFloor: '',
  lateFee: '', annualFee: '', annualFeeMonth: '',
  ...over,
});

test('a card form with only the required fields reads blanks as zero or none', () => {
  assert.deepEqual(parseCardForm(fields()), {
    ok: true,
    values: {
      name: 'BPI Gold', creditLimit: 50000, openingBalance: 0,
      statementDay: 5, dueDay: 25,
      monthlyInterestRate: 3, minPaymentPercent: 3, minPaymentFloor: 0,
      lateFee: null, annualFee: null, annualFeeMonth: null,
    },
  });
});

test('optional fees are read when given', () => {
  const r = parseCardForm(fields({ lateFee: '850', annualFee: '3000', annualFeeMonth: '2' }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.values.lateFee, 850);
    assert.equal(r.values.annualFee, 3000);
    assert.equal(r.values.annualFeeMonth, 2);
  }
});

test('a month without an annual fee is ignored', () => {
  const r = parseCardForm(fields({ annualFeeMonth: '6' }));
  assert.equal(r.ok && r.values.annualFeeMonth, null);
});

test('a card form refuses what a card cannot have', () => {
  const bad: Partial<CardFormFields>[] = [
    { name: '  ' },
    { creditLimit: '0' }, { creditLimit: '' }, { creditLimit: 'abc' },
    { openingBalance: '-1' },
    { statementDay: '0' }, { statementDay: '32' }, { statementDay: '2.5' }, { dueDay: '' },
    { monthlyInterestRate: '' }, { monthlyInterestRate: '101' },
    { minPaymentPercent: '-3' }, { minPaymentFloor: '-1' },
    { lateFee: '-5' }, { annualFee: '3000' }, { annualFee: '3000', annualFeeMonth: '13' },
  ];
  for (const b of bad) {
    assert.equal(parseCardForm(fields(b)).ok, false, JSON.stringify(b));
  }
});
