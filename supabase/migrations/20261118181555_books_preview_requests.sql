-- Isolated synthetic Books requests only. This migration belongs to QR Studio,
-- never to the production Books database. No recipient/contact/address fields.
create table public.qr_books_preview_requests (
  id uuid primary key,
  submission_id uuid not null unique,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  attribution jsonb,
  books jsonb not null,
  country text not null check (length(country) between 1 and 100),
  city text not null check (length(city) <= 200),
  status text not null check (status in ('received','pending','approved','shipped','delivered','failed','rejected','cancelled','waitlisted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  shipped_at timestamptz,
  delivered_at timestamptz,
  version integer not null default 0 check (version >= 0)
);
alter table public.qr_books_preview_requests enable row level security;
alter table public.qr_books_preview_requests force row level security;
revoke all on public.qr_books_preview_requests from public, anon, authenticated;
grant select, insert, update, delete on public.qr_books_preview_requests to service_role;
comment on table public.qr_books_preview_requests is 'Isolated private preview requests. Simulated fulfillment only; no customer contact data. Access only through the authenticated books-preview-gateway.';
