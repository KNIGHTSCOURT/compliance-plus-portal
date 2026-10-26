-- Compliance Plus — Supabase database.
-- Staff see and edit everything. Client logins can only read their own
-- client's records and photos. Nobody can make themselves staff: staff are
-- listed in staff_emails, and client access is granted by the invite-user
-- Edge Function.

-- ---------- People ----------
create table if not exists public.staff_emails (
  email text primary key
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  role text not null default 'pending' check (role in ('staff', 'client', 'pending')),
  client_id text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id, lower(new.email),
    case when exists (select 1 from public.staff_emails s where s.email = lower(new.email)) then 'staff' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff');
$$;

create or replace function public.my_client_id()
returns text language sql stable security definer set search_path = '' as $$
  select client_id from public.profiles where id = auth.uid() and role = 'client';
$$;

alter table public.staff_emails enable row level security;
alter table public.profiles enable row level security;

create policy "staff manage staff list" on public.staff_emails
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "read own profile or staff reads all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "staff update profiles" on public.profiles
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------- Business data ----------
-- One row per record from the portal: coll is clients / sites / items /
-- inspections / assessments / photos / settings. data holds the record.
create table if not exists public.records (
  coll text not null,
  id text not null,
  client_id text,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid default auth.uid(),
  primary key (coll, id)
);
create index if not exists records_updated_at on public.records (updated_at);
create index if not exists records_client on public.records (client_id);

create or replace function public.touch_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_record();

alter table public.records enable row level security;

create policy "staff read all records" on public.records
  for select to authenticated using (public.is_staff());
create policy "clients read their records" on public.records
  for select to authenticated using (
    not deleted and (
      (client_id is not null and client_id = public.my_client_id())
      or (coll = 'settings' and public.my_client_id() is not null)
    )
  );
create policy "staff insert records" on public.records
  for insert to authenticated with check (public.is_staff());
create policy "staff update records" on public.records
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------- Photos ----------
-- Stored as photos/<client id>/<photo id>.jpg
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "staff manage photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'photos' and public.is_staff())
  with check (bucket_id = 'photos' and public.is_staff());
create policy "clients read their photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_client_id());
