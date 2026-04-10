-- ==========================================
-- RLS Policies
-- ==========================================

-- profiles
create policy "users can insert own profile"
on public.profiles for insert to authenticated
with check (profile_id = auth.uid());

create policy "users can read own profile"
on public.profiles for select to authenticated
using (profile_id = auth.uid());

create policy "users can update own profile"
on public.profiles for update to authenticated
using (profile_id = auth.uid());
