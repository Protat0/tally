-- Credit cards (2026-09-11)
--
-- Run in the Supabase SQL editor. Paste and run the whole block at once:
-- Postgres parses the entire batch first, so a partial paste fails with a
-- syntax error on the line after the cut. Safe to run twice.


-- 1. Cards. Never deleted, only archived, so rows that reference one never dangle.
create table if not exists credit_cards (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  icon                  text not null default 'credit-card',
  credit_limit          numeric not null check (credit_limit > 0),
  statement_day         int not null check (statement_day between 1 and 31),
  due_day               int not null check (due_day between 1 and 31),
  monthly_interest_rate numeric not null check (monthly_interest_rate between 0 and 100),
  min_payment_percent   numeric not null check (min_payment_percent between 0 and 100),
  min_payment_floor     numeric not null default 0 check (min_payment_floor >= 0),
  late_fee              numeric check (late_fee >= 0),
  annual_fee            numeric check (annual_fee >= 0),
  annual_fee_month      int check (annual_fee_month between 1 and 12),
  opening_balance       numeric not null default 0 check (opening_balance >= 0),
  created_at            timestamptz not null default now(),
  archived_at           timestamptz,
  constraint credit_cards_annual_fee_has_month
    check (annual_fee is null or annual_fee_month is not null)
);

alter table credit_cards enable row level security;

drop policy if exists credit_cards_select_own on credit_cards;
drop policy if exists credit_cards_insert_own on credit_cards;
drop policy if exists credit_cards_update_own on credit_cards;
drop policy if exists credit_cards_delete_own on credit_cards;
create policy credit_cards_select_own on credit_cards for select using (auth.uid() = user_id);
create policy credit_cards_insert_own on credit_cards for insert with check (auth.uid() = user_id);
create policy credit_cards_update_own on credit_cards for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy credit_cards_delete_own on credit_cards for delete using (auth.uid() = user_id);


-- 2. A purchase is paid from a wallet or a card, never both.
alter table expenses add column if not exists card_id uuid references credit_cards(id);
alter table expenses drop constraint if exists expenses_one_funding_source;
alter table expenses add constraint expenses_one_funding_source
  check (wallet_id is null or card_id is null);


-- 3. Paying a card: a movement out of a wallet, naming the card.
alter table money_moves add column if not exists card_id uuid references credit_cards(id);

-- The kind check was created by hand and its name is not known, so any check
-- on money_moves.kind is dropped before the full list is added back.
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
                  'fund_deposit', 'fund_withdrawal', 'card_payment'));
