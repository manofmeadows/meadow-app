-- ═══════════════════════════════════════════
-- MEADOW COSMETICS – Tietokanta
-- Aja tämä Supabase SQL Editorissa
-- ═══════════════════════════════════════════

-- 1. Raaka-aineet
create table ingredients (
  id bigserial primary key,
  name text not null,
  per_jar numeric not null default 0,
  unit text not null default 'g',
  supplier text,
  lead_days integer not null default 7,
  min_order numeric not null default 0,
  color text default '#999999',
  stock numeric not null default 0,
  created_at timestamptz default now()
);

-- 2. Tuotantoloki
create table productions (
  id bigserial primary key,
  production_date date not null default current_date,
  jars integer not null,
  maker text,
  consumed jsonb,
  created_at timestamptz default now()
);

-- 3. Tilausloki
create table orders (
  id bigserial primary key,
  order_date date not null default current_date,
  ingredient_name text not null,
  ingredient_id bigint references ingredients(id),
  supplier text,
  amount numeric not null,
  unit text,
  price numeric default 0,
  estimated_delivery date,
  delivered_at date,
  created_at timestamptz default now()
);

-- 4. Asetukset (yksi rivi)
create table settings (
  id bigserial primary key,
  weekly_rate integer not null default 70,
  safety_weeks integer not null default 3,
  jars_in_warehouse integer not null default 0,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════
-- Salli kaikki operaatiot (yksinkertainen setup)
-- Tuotantosovelluksessa voit tiukentaa myöhemmin
-- ═══════════════════════════════════════════

alter table ingredients enable row level security;
alter table productions enable row level security;
alter table orders enable row level security;
alter table settings enable row level security;

create policy "Allow all on ingredients" on ingredients for all using (true) with check (true);
create policy "Allow all on productions" on productions for all using (true) with check (true);
create policy "Allow all on orders" on orders for all using (true) with check (true);
create policy "Allow all on settings" on settings for all using (true) with check (true);

-- ═══════════════════════════════════════════
-- Ota realtime käyttöön (synkkaus laitteiden välillä)
-- ═══════════════════════════════════════════

alter publication supabase_realtime add table ingredients;
alter publication supabase_realtime add table productions;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table settings;
