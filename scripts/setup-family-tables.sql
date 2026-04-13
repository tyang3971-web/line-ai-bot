-- Run in Supabase SQL Editor
-- 家庭記帳 Bot 用的資料表

-- 家庭群組
create table if not exists family_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '我的家庭',
  join_code   text unique not null,           -- 6 碼加入碼
  created_by  text not null,                  -- LINE userId
  created_at  timestamptz not null default now()
);

-- 家庭成員
create table if not exists family_members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references family_groups(id),
  user_id     text not null,                  -- LINE userId
  nickname    text not null default '',        -- 顯示名稱
  joined_at   timestamptz not null default now(),
  unique(family_id, user_id)
);

-- 家庭共用帳本
create table if not exists family_expenses (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references family_groups(id),
  user_id     text not null,                  -- 記帳者 LINE userId
  nickname    text not null default '',        -- 記帳者名稱
  amount      numeric not null check (amount > 0),
  category    text not null default '其他',
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- Indexes
create index if not exists family_members_user_idx on family_members (user_id);
create index if not exists family_expenses_family_date_idx on family_expenses (family_id, created_at desc);

-- RLS
alter table family_groups enable row level security;
alter table family_members enable row level security;
alter table family_expenses enable row level security;

create policy "service role full access" on family_groups using (true) with check (true);
create policy "service role full access" on family_members using (true) with check (true);
create policy "service role full access" on family_expenses using (true) with check (true);
