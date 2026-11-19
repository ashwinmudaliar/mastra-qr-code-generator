-- QR Studio has its own tables and does not alter existing book fulfillment data.
create table public.qr_studio_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]{12}$'),
  name text not null check (char_length(name) between 1 and 120),
  destination text not null check (char_length(destination) <= 4096 and destination ~ '^https?://'),
  event text not null default '' check (char_length(event) <= 160),
  book text not null default '' check (char_length(book) <= 160),
  placement text not null default '' check (char_length(placement) <= 160),
  status text not null default 'active' check (status in ('active','paused')),
  expires_at timestamptz,
  design jsonb not null default '{}'::jsonb check (octet_length(design::text) <= 1500000),
  utm jsonb not null default '{"enabled":true,"source":"event","medium":"qr","campaign":"","content":""}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index qr_studio_codes_owner_created_idx on public.qr_studio_codes(owner_id, created_at desc);
create table public.qr_studio_scans (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.qr_studio_codes(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  country text not null default 'Unknown' check (char_length(country) <= 120),
  region text not null default 'Unknown' check (char_length(region) <= 120),
  city text not null default 'Unknown' check (char_length(city) <= 120),
  device text not null default 'Other' check (device in ('Mobile','Tablet','Desktop','Other'))
);
create index qr_studio_scans_code_time_idx on public.qr_studio_scans(code_id, scanned_at desc);
alter table public.qr_studio_codes enable row level security;
alter table public.qr_studio_scans enable row level security;
revoke all on public.qr_studio_codes, public.qr_studio_scans from anon;
grant select, insert, update, delete on public.qr_studio_codes to authenticated;
grant select on public.qr_studio_scans to authenticated;
revoke insert, update, delete on public.qr_studio_scans from authenticated;
grant all on public.qr_studio_codes, public.qr_studio_scans to service_role;
create policy "Owners read their codes" on public.qr_studio_codes for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners create their codes" on public.qr_studio_codes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners update their codes" on public.qr_studio_codes for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners delete their codes" on public.qr_studio_codes for delete to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners read their scans" on public.qr_studio_scans for select to authenticated using (exists (select 1 from public.qr_studio_codes c where c.id = code_id and c.owner_id = (select auth.uid())));
