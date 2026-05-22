-- ═══════════════════════════════════════════════════════════════
-- SplitEasy – Full permissions reset for profiles table
-- Run this in Supabase → Database → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Drop ALL existing policies on profiles (whatever they're named)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies where tablename = 'profiles' and schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

-- Step 2: Make sure RLS is enabled
alter table public.profiles enable row level security;

-- Step 3: Recreate policies cleanly
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Step 4: Recreate trigger (ensures name is saved on signup)
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
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Step 5: Verify — you should see 3 rows (select, insert, update)
select policyname, cmd from pg_policies where tablename = 'profiles';
