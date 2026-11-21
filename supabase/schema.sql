-- KENZ Customer Service schema
-- Run this whole file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Customer',
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  room_code text not null unique,
  subject text not null default 'Customer support',
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  constraint message_has_content check (length(trim(body)) > 0 or image_url is not null)
);

create index if not exists rooms_owner_idx on public.rooms(owner_id);
create index if not exists rooms_updated_idx on public.rooms(updated_at desc);
create index if not exists messages_room_created_idx on public.messages(room_id, created_at);

-- Create profile on first verified auth signup. Username is collected in auth metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, username, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), 'Customer'),
    new.phone
  )
  on conflict (id) do update
    set phone = excluded.phone,
        username = coalesce(nullif(excluded.username,''), profiles.username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of phone on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_room_updated_at()
returns trigger language plpgsql as $$
begin
  update public.rooms set updated_at = now() where id = new.room_id;
  return new;
end;
$$;
drop trigger if exists on_message_created on public.messages;
create trigger on_message_created after insert on public.messages
for each row execute procedure public.touch_room_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profile read self or admin" on public.profiles;
create policy "profile read self or admin" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profile insert self" on public.profiles;
create policy "profile insert self" on public.profiles
for insert to authenticated with check (id = auth.uid() and role = 'customer');
drop policy if exists "profile update self" on public.profiles;
create policy "profile update self" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'customer');

drop policy if exists "room read owner or admin" on public.rooms;
create policy "room read owner or admin" on public.rooms
for select to authenticated using (owner_id = auth.uid() or public.is_admin());
drop policy if exists "room create self" on public.rooms;
create policy "room create self" on public.rooms
for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "room update admin" on public.rooms;
create policy "room update admin" on public.rooms
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "message read room member" on public.messages;
create policy "message read room member" on public.messages
for select to authenticated using (
  exists(select 1 from public.rooms r where r.id = room_id and (r.owner_id = auth.uid() or public.is_admin()))
);
drop policy if exists "message send room member" on public.messages;
create policy "message send room member" on public.messages
for insert to authenticated with check (
  sender_id = auth.uid()
  and exists(select 1 from public.rooms r where r.id = room_id and r.status = 'open' and (r.owner_id = auth.uid() or public.is_admin()))
);

-- Storage bucket for images. Public read URLs are used for simple deployment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos','chat-photos',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "chat photos upload authenticated" on storage.objects;
create policy "chat photos upload authenticated" on storage.objects
for insert to authenticated with check (bucket_id = 'chat-photos');
drop policy if exists "chat photos read public" on storage.objects;
create policy "chat photos read public" on storage.objects
for select to public using (bucket_id = 'chat-photos');

-- IMPORTANT: After your own account has signed in once, promote it to admin:
-- update public.profiles set role = 'admin' where phone = '+6281234567890';
-- Run that statement manually in SQL Editor. Never expose a service_role key in frontend code.
