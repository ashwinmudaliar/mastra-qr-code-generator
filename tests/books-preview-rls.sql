begin;
set local role anon;
do $$ begin
  begin perform 1 from public.qr_books_preview_requests; raise exception 'Anonymous read succeeded'; exception when insufficient_privilege then null; end;
  begin delete from public.qr_books_preview_requests where false; raise exception 'Anonymous delete succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform 1 from public.qr_books_preview_requests; raise exception 'Authenticated read succeeded'; exception when insufficient_privilege then null; end;
  begin update public.qr_books_preview_requests set status='shipped' where false; raise exception 'Authenticated update succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.qr_books_preview_requests(id,submission_id,fingerprint,books,country,city,status) values (gen_random_uuid(),gen_random_uuid(),repeat('a',64),'{"Principles":1,"Patterns":0}','US','Example','approved'); raise exception 'Authenticated insert succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Preview storage denied to browser roles; no records retained' as result;
