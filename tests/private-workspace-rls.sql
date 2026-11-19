-- Run as database administrator after the private-workspace migration.
-- Every fixture and role change is contained in this rolled-back transaction.
begin;
insert into auth.users (id, aud, role, email) values
('10000000-0000-4000-8000-000000000001','authenticated','authenticated','private-workspace-rls@example.invalid');
insert into public.qr_studio_workspaces(id,name) values
('10000000-0000-4000-8000-000000000002','Private workspace RLS fixture');
insert into public.qr_studio_codes(id,owner_id,private_workspace_id,slug,name,destination) values
('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001',null,'privateown1a','Auth owner fixture','https://www.mastrabooks.dev'),
('10000000-0000-4000-8000-000000000012',null,'10000000-0000-4000-8000-000000000002','privatewsp2b','Private workspace fixture','https://www.mastrabooks.dev');
insert into public.qr_studio_scans(code_id) values
('10000000-0000-4000-8000-000000000011'),('10000000-0000-4000-8000-000000000012');
do $$
begin
  begin
    insert into public.qr_studio_codes(slug,name,destination) values ('invalidown3c','No owner','https://www.mastrabooks.dev');
    raise exception 'Ownerless code was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.qr_studio_codes set owner_id='10000000-0000-4000-8000-000000000001' where id='10000000-0000-4000-8000-000000000012';
    raise exception 'Dual-owned code was accepted';
  exception when check_violation then null;
  end;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.qr_studio_codes where id in ('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000012')) <> 1 then raise exception 'Authenticated visibility incorrect'; end if;
  if (select count(*) from public.qr_studio_scans where code_id in ('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000012')) <> 1 then raise exception 'Private workspace scans exposed'; end if;
  update public.qr_studio_codes set name='Own code still editable' where id='10000000-0000-4000-8000-000000000011';
  if not found then raise exception 'Authenticated owner lost update access'; end if;
  update public.qr_studio_codes set name='Unauthorized' where id='10000000-0000-4000-8000-000000000012';
  if found then raise exception 'Private workspace update succeeded'; end if;
  begin
    delete from public.qr_studio_codes where id='10000000-0000-4000-8000-000000000012';
    raise exception 'Browser role retained permanent-delete privilege';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.qr_studio_workspaces;
    raise exception 'Private workspace metadata exposed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.qr_studio_codes(private_workspace_id,slug,name,destination) values ('10000000-0000-4000-8000-000000000002','invalidwsp4d','Unauthorized','https://www.mastrabooks.dev');
    raise exception 'Private workspace insert succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.qr_studio_codes set owner_id=null, private_workspace_id='10000000-0000-4000-8000-000000000002' where id='10000000-0000-4000-8000-000000000011';
    raise exception 'Authenticated owner reassigned a code to a private workspace';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.qr_studio_workspaces;
    raise exception 'Anonymous workspace read succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.qr_studio_codes;
    raise exception 'Anonymous code read succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.qr_studio_scans;
    raise exception 'Anonymous scan read succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'Private workspace RLS checks passed; fixtures rolled back' as result;
