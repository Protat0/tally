-- Existing wallets get their bank's logo (2026-09-11)
--
-- Wallets made before logos existed still show a generic icon. This gives each
-- one named after a bank or e-wallet preset that brand's logo, for every user.
-- Run it in the Supabase SQL editor, one step at a time. The editor runs as the
-- table owner, so row level security does not limit it to a single account.
--
-- Which wallets change:
--   * the name is a preset's name, or starts with one followed by a space
--     ("BDO", "bdo", "BDO Savings"), ignoring case and outer spaces. When two
--     presets fit ("Maya Bank Savings"), the longer name wins.
--   * and the icon is still a generic one a preset or the old default gave:
--     landmark, smartphone, credit-card, wallet, their old emoji, or none.
--     An icon someone picked on purpose, like a piggy bank, is left alone.
--
-- Generated from src/lib/walletPresets.ts. Cash has no logo, so it is not listed.


-- 1. Copy the wallets that will change, with their current and new icon.
--    Writes only this new table; wallets is untouched.
create table wallet_icon_backup_2026_09_11 as
with presets(name, logo) as (values
    ('GCash', 'gcash'),
    ('Maya', 'maya'),
    ('GrabPay', 'grabpay'),
    ('ShopeePay', 'shopeepay'),
    ('Coins.ph', 'coins-ph'),
    ('BDO', 'bdo'),
    ('BPI', 'bpi'),
    ('Metrobank', 'metrobank'),
    ('Landbank', 'landbank'),
    ('PNB', 'pnb'),
    ('Security Bank', 'security-bank'),
    ('UnionBank', 'unionbank'),
    ('China Bank', 'china-bank'),
    ('RCBC', 'rcbc'),
    ('EastWest', 'eastwest'),
    ('PSBank', 'psbank'),
    ('DBP', 'dbp'),
    ('AUB', 'aub'),
    ('Maybank', 'maybank'),
    ('Bank of Commerce', 'bank-of-commerce'),
    ('HSBC', 'hsbc'),
    ('GoTyme', 'gotyme'),
    ('Tonik', 'tonik'),
    ('MariBank', 'maribank'),
    ('Maya Bank', 'maya'),
    ('UNO Digital', 'uno-digital'),
    ('Netbank', 'netbank'),
    ('CIMB', 'cimb')
),
matches as (
  select distinct on (w.id)
         w.id, w.name, w.icon as old_icon, 'logo:' || p.logo as new_icon
  from wallets w
  join presets p
    on lower(btrim(w.name)) = lower(p.name)
    or lower(btrim(w.name)) like lower(p.name) || ' %'
  where coalesce(w.icon, '') in ('', 'landmark', 'smartphone', 'credit-card', 'wallet', '🏦', '📱', '💳', '🏧')
  order by w.id, length(p.name) desc
)
select id, name, old_icon, new_icon from matches;

-- A table made in the SQL editor starts with row level security off, which
-- would let the public API read it. On with no policies, only the editor can.
alter table wallet_icon_backup_2026_09_11 enable row level security;


-- 2. Preview: exactly the wallets step 3 will change.
select name, old_icon, new_icon, count(*) as wallets
from wallet_icon_backup_2026_09_11
group by name, old_icon, new_icon
order by name;


-- 3. Apply. A wallet whose icon was edited after step 1 is skipped.
update wallets w
set icon = b.new_icon
from wallet_icon_backup_2026_09_11 b
where w.id = b.id
  and coalesce(w.icon, '') = coalesce(b.old_icon, '');


-- 4. Undo, if needed: puts back the old icon on any wallet still showing the
--    logo this gave it.
-- update wallets w
-- set icon = b.old_icon
-- from wallet_icon_backup_2026_09_11 b
-- where w.id = b.id
--   and w.icon = b.new_icon;

-- Once you are happy with the result:
-- drop table wallet_icon_backup_2026_09_11;
