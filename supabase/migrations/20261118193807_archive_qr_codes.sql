-- Archive QR identities instead of removing them from historical reports.
-- Applies to QR Studio only; no Books production schema or data is changed.
alter table public.qr_studio_codes
  add column archived_at timestamptz,
  add constraint qr_studio_codes_archived_paused check (archived_at is null or status = 'paused');

comment on column public.qr_studio_codes.archived_at is
  'Archived codes retain their IDs, slugs and scan/fulfillment reporting scope. Restore explicitly to paused before activating.';

-- Retire the old browser delete path as well as the new application action.
-- Service-role deletion remains available only for exact operator-owned fixtures.
drop policy "Owners delete their codes" on public.qr_studio_codes;
revoke delete, truncate on public.qr_studio_codes from public, anon, authenticated;
