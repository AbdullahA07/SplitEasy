-- ═══════════════════════════════════════════════════════════════
-- SplitEasy – Database Setup
-- Run this entire file in: Supabase → Database → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Profiles (extends auth.users) ───────────────────────────
create table if not exists public.profiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  name    text not null,
  email   text not null,
  color   text not null default '#3b82f6',
  created_at timestamptz default now()
);

-- ── 2. Groups ───────────────────────────────────────────────────
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  icon       text not null default '👥',
  color      text not null default '#3b82f6',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ── 3. Group members ────────────────────────────────────────────
create table if not exists public.group_members (
  group_id  uuid references public.groups(id) on delete cascade,
  user_id   uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- ── 4. Expenses ─────────────────────────────────────────────────
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  amount     numeric(10,2) not null,
  category   text not null default 'other',
  group_id   uuid references public.groups(id) on delete cascade,
  paid_by    uuid references public.profiles(id) on delete set null,
  date       timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ── 5. Expense splits ────────────────────────────────────────────
create table if not exists public.expense_splits (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid references public.expenses(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  amount     numeric(10,2) not null
);

-- ── 6. Settlements ───────────────────────────────────────────────
create table if not exists public.settlements (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid references public.profiles(id) on delete set null,
  to_user    uuid references public.profiles(id) on delete set null,
  amount     numeric(10,2) not null,
  group_id   uuid references public.groups(id) on delete set null,
  date       timestamptz not null,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses      enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements   enable row level security;

-- Profiles: anyone authenticated can read; only self can update
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id);

-- Groups: only members can see/update; creator can delete
create policy "groups_select" on public.groups for select to authenticated
  using (exists (select 1 from public.group_members where group_id = id and user_id = auth.uid()));
create policy "groups_insert" on public.groups for insert to authenticated
  with check (auth.uid() = created_by);
create policy "groups_update" on public.groups for update to authenticated
  using (exists (select 1 from public.group_members where group_id = id and user_id = auth.uid()));
create policy "groups_delete" on public.groups for delete to authenticated
  using (auth.uid() = created_by);

-- Group members: members can see + add other members
create policy "group_members_select" on public.group_members for select to authenticated
  using (exists (select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()));
create policy "group_members_insert" on public.group_members for insert to authenticated
  with check (
    -- Allow if you're already a member OR if you're adding yourself (joining a group)
    auth.uid() = user_id
    or exists (select 1 from public.group_members where group_id = group_members.group_id and user_id = auth.uid())
  );
create policy "group_members_delete" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.groups where id = group_id and created_by = auth.uid()
  ));

-- Expenses: group members can see/create; creator can delete
create policy "expenses_select" on public.expenses for select to authenticated
  using (exists (select 1 from public.group_members where group_id = expenses.group_id and user_id = auth.uid()));
create policy "expenses_insert" on public.expenses for insert to authenticated
  with check (exists (select 1 from public.group_members where group_id = expenses.group_id and user_id = auth.uid()));
create policy "expenses_delete" on public.expenses for delete to authenticated
  using (auth.uid() = created_by);

-- Expense splits: accessible if you can access the expense
create policy "splits_select" on public.expense_splits for select to authenticated
  using (exists (
    select 1 from public.expenses e
    join public.group_members gm on gm.group_id = e.group_id
    where e.id = expense_id and gm.user_id = auth.uid()
  ));
create policy "splits_insert" on public.expense_splits for insert to authenticated
  with check (exists (
    select 1 from public.expenses e
    join public.group_members gm on gm.group_id = e.group_id
    where e.id = expense_id and gm.user_id = auth.uid()
  ));
create policy "splits_delete" on public.expense_splits for delete to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.created_by = auth.uid()
  ));

-- Settlements: visible to both parties and group members
create policy "settlements_select" on public.settlements for select to authenticated
  using (
    auth.uid() = from_user or auth.uid() = to_user
    or (group_id is not null and exists (
      select 1 from public.group_members where group_id = settlements.group_id and user_id = auth.uid()
    ))
  );
create policy "settlements_insert" on public.settlements for insert to authenticated
  with check (auth.uid() = from_user);

-- ═══════════════════════════════════════════════════════════════
-- Trigger: auto-create profile on sign-up
-- ═══════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    '#' || lpad(to_hex(floor(random() * 16777215)::int), 6, '0')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- Enable real-time for live sync between users
-- ═══════════════════════════════════════════════════════════════
begin;
  -- Add tables to the supabase_realtime publication
  alter publication supabase_realtime add table public.expenses;
  alter publication supabase_realtime add table public.expense_splits;
  alter publication supabase_realtime add table public.settlements;
  alter publication supabase_realtime add table public.group_members;
commit;
