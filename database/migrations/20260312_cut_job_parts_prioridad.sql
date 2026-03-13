begin;

alter table public.cut_job_parts
  add column if not exists prioridad smallint not null default 3;

update public.cut_job_parts
set prioridad = 3
where prioridad is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cut_job_parts_prioridad_chk'
  ) then
    alter table public.cut_job_parts
      add constraint cut_job_parts_prioridad_chk
      check (prioridad between 1 and 9);
  end if;
end $$;

create index if not exists idx_cut_job_parts_job_prioridad
  on public.cut_job_parts (cut_job_id, prioridad);

commit;

