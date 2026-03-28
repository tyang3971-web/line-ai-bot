-- Run in Supabase SQL Editor

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,              -- LINE userId
  amount      numeric not null check (amount > 0),
  category    text not null default '其他',
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- Index for fast user queries
create index if not exists expenses_user_date_idx on expenses (user_id, created_at desc);

-- RLS: only service role can write (bot uses service key)
alter table expenses enable row level security;

create policy "service role full access"
  on expenses using (true) with check (true);
