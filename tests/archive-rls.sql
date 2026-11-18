-- Run as database administrator after archive_qr_codes. All fixtures roll back.
begin;
insert into auth.users(id,aud,role,email) values
('30000000-0000-4000-8000-000000000001','authenticated','authenticated','archive-rls@example.invalid');
insert into public.qr_studio_workspaces(id,name) values
('30000000-0000-4000-8000-000000000002','Archive RLS fixture');
insert into public.qr_studio_codes(id,owner_id,private_workspace_id,slug,name,destination) values
('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000001',null,'archiveown1a','Owner history','https://www.mastrabooks.dev'),
('30000000-0000-4000-8000-000000000012',null,'30000000-0000-4000-8000-000000000002','archivewsp2b','Workspace history','https://www.mastrabooks.dev');
insert into public.qr_studio_scans(code_id) values
('30000000-0000-4000-8000-000000000011'),('30000000-0000-4000-8000-000000000012');

-- The service-backed workspace archives the same identity rather than deleting it.
update public.qr_studio_codes set archived_at=now(),status='paused'
where id='30000000-0000-4000-8000-000000000012';
set local role authenticated;
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  update public.qr_studio_codes set archived_at=now(),status='paused'
  where id='30000000-0000-4000-8000-000000000011';
  if not found then raise exception 'Owner archive was denied'; end if;
  if (select count(*) from public.qr_studio_codes where archived_at is not null and id in ('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000012')) <> 1 then raise exception 'Archive visibility or workspace isolation failed'; end if;
  if (select count(*) from public.qr_studio_scans where code_id='30000000-0000-4000-8000-000000000011') <> 1 then raise exception 'Archive lost scan history'; end if;
  update public.qr_studio_codes set archived_at=null,status='paused'
  where id='30000000-0000-4000-8000-000000000012';
  if found then raise exception 'Owner restored a workspace code'; end if;
  begin
    update public.qr_studio_codes set status='active' where id='30000000-0000-4000-8000-000000000011';
    raise exception 'Archived code activated without restore';
  exception when check_violation then null;
  end;
  begin
    delete from public.qr_studio_codes where id='30000000-0000-4000-8000-000000000011';
    raise exception 'Owner erased a reporting identity';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege(current_user,'public.qr_studio_codes','TRUNCATE') then raise exception 'Browser role retained truncate privilege'; end if;
  update public.qr_studio_codes set archived_at=null,status='paused' where id='30000000-0000-4000-8000-000000000011';
  if not found then raise exception 'Owner restore was denied'; end if;
  if not exists (select 1 from public.qr_studio_codes where id='30000000-0000-4000-8000-000000000011' and slug='archiveown1a' and archived_at is null and status='paused') then raise exception 'Restore changed identity or activated the link'; end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.qr_studio_scans where code_id in ('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000012')) <> 2 then raise exception 'Scan history was removed'; end if;
end $$;
rollback;
select 'Archive RLS checks passed; fixtures rolled back' as result;
