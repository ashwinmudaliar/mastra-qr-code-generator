-- The private review workspace owns codes without creating an Auth account.
-- Ordinary authenticated users keep their existing owner-scoped RLS access.
create table public.qr_studio_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
alter table public.qr_studio_workspaces enable row level security;
revoke all on public.qr_studio_workspaces from public, anon, authenticated;
grant all on public.qr_studio_workspaces to service_role;

alter table public.qr_studio_codes alter column owner_id drop not null;
alter table public.qr_studio_codes
  add column private_workspace_id uuid references public.qr_studio_workspaces(id) on delete cascade,
  add constraint qr_studio_codes_one_owner check (num_nonnulls(owner_id, private_workspace_id) = 1);
create index qr_studio_codes_workspace_created_idx
  on public.qr_studio_codes(private_workspace_id, created_at desc, id);

-- No browser-facing policies are added for workspace data. Existing policies
-- require a non-null matching auth.uid(), so private codes/scans stay invisible.
comment on table public.qr_studio_workspaces is
  'Private preview workspaces; only the server-authenticated workspace gateway may access these rows. No browser grants or policies.';
