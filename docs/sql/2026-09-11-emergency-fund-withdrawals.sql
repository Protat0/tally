-- Emergency fund: withdrawals, and an optional wallet on every add or withdrawal (2026-09-11)
--
-- Run in the Supabase SQL editor. Paste and run the whole block at once:
-- Postgres parses the entire batch first, so a partial paste fails with a
-- syntax error on the line after the cut.
--
-- Additive only. Existing fund entries become deposits with no wallet, which is
-- exactly what they were, so nothing already recorded changes meaning.


-- 1. Two new money movement kinds, for money going into or out of the fund
--    through a wallet. The original check constraint was created by hand and
--    its name is not known, so any check on money_moves.kind is dropped first.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'money_moves'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table money_moves drop constraint %I', c.conname);
  end loop;
end $$;

alter table money_moves add constraint money_moves_kind_check
  check (kind in ('earned', 'withdrawn', 'moved', 'debt_out', 'debt_in',
                  'fund_deposit', 'fund_withdrawal'));


-- 2. Fund entries say which way the money went, and where from or to.
--    Amounts stay positive; direction carries the sign.
alter table emergency_fund_entries
  add column if not exists direction text not null default 'deposit'
    check (direction in ('deposit', 'withdrawal')),
  add column if not exists wallet_id uuid references wallets(id) on delete set null,
  add column if not exists move_id   uuid references money_moves(id) on delete set null;
