-- Run as the database administrator after the migration. No test data is retained.
begin;
insert into auth.users (id, aud, role, email) values
('00000000-0000-4000-8000-000000000001','authenticated','authenticated','qr-rls-a@example.invalid'),
('00000000-0000-4000-8000-000000000002','authenticated','authenticated','qr-rls-b@example.invalid');
insert into public.qr_studio_codes(id,owner_id,slug,name,destination) values
('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','rlstest0001a','RLS A','https://www.mastrabooks.dev'),
('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','rlstest0002b','RLS B','https://www.mastrabooks.dev');
insert into public.qr_studio_scans(code_id) values ('00000000-0000-4000-8000-000000000011'),('00000000-0000-4000-8000-000000000012');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.qr_studio_codes) <> 1 then raise exception 'RLS code isolation failed'; end if;
  if (select count(*) from public.qr_studio_scans) <> 1 then raise exception 'RLS scan isolation failed'; end if;
  update public.qr_studio_codes set name='Unauthorized change' where id='00000000-0000-4000-8000-000000000012';
  if found then raise exception 'RLS unauthorized update succeeded'; end if;
  begin
    update public.qr_studio_codes set owner_id='00000000-0000-4000-8000-000000000002' where id='00000000-0000-4000-8000-000000000011';
    raise exception 'Owner reassignment succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.qr_studio_scans(code_id) values ('00000000-0000-4000-8000-000000000011');
    raise exception 'Authenticated user forged a scan directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.qr_studio_codes;
    raise exception 'Anonymous code read succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.qr_studio_scans;
    raise exception 'Anonymous analytics read succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'QR Studio RLS checks passed; test data rolled back' as result;
