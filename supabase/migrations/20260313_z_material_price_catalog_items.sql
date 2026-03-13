begin;

create table if not exists public.material_price_catalog_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  supplier_id uuid not null,
  latest_price_list_id uuid,
  latest_import_id uuid,
  source_filename text,
  nombre text not null,
  descripcion text not null,
  color text,
  precio numeric(14,2) not null default 0,
  currency char(3) not null default 'ARS',
  slug_nombre text not null,
  slug_descripcion text not null,
  slug_color text not null default '',
  unique_slug_key text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  record_date date,
  month smallint,
  year integer,
  period_key char(7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'material_price_catalog_items_profile_id_fkey'
  ) then
    alter table public.material_price_catalog_items
      add constraint material_price_catalog_items_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'material_price_catalog_items_supplier_id_fkey'
  ) then
    alter table public.material_price_catalog_items
      add constraint material_price_catalog_items_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers(id) on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'material_price_catalog_items_latest_price_list_id_fkey'
  ) then
    alter table public.material_price_catalog_items
      add constraint material_price_catalog_items_latest_price_list_id_fkey
      foreign key (latest_price_list_id) references public.material_price_lists(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'material_price_catalog_items_latest_import_id_fkey'
  ) then
    alter table public.material_price_catalog_items
      add constraint material_price_catalog_items_latest_import_id_fkey
      foreign key (latest_import_id) references public.material_price_imports(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'material_price_catalog_items_precio_non_negative'
  ) then
    alter table public.material_price_catalog_items
      add constraint material_price_catalog_items_precio_non_negative
      check (precio >= 0);
  end if;
end $$;

update public.material_price_catalog_items
set record_date = coalesce(record_date, created_at::date)
where record_date is null;

drop trigger if exists trg_material_price_catalog_items_period_fields on public.material_price_catalog_items;
create trigger trg_material_price_catalog_items_period_fields
before insert or update on public.material_price_catalog_items
for each row
execute function public.fn_apply_period_fields();

drop trigger if exists trg_material_price_catalog_items_updated_at on public.material_price_catalog_items;
create trigger trg_material_price_catalog_items_updated_at
before update on public.material_price_catalog_items
for each row
execute function public.fn_set_updated_at_and_by();

update public.material_price_catalog_items
set
  month = extract(month from record_date)::smallint,
  year = extract(year from record_date)::integer,
  period_key = public.fn_period_key_from_date(record_date)
where month is null or year is null or period_key is null;

alter table public.material_price_catalog_items alter column record_date set not null;
alter table public.material_price_catalog_items alter column month set not null;
alter table public.material_price_catalog_items alter column year set not null;
alter table public.material_price_catalog_items alter column period_key set not null;

create unique index if not exists idx_material_price_catalog_items_profile_slug_key
  on public.material_price_catalog_items (profile_id, unique_slug_key);

create index if not exists idx_material_price_catalog_items_profile_supplier
  on public.material_price_catalog_items (profile_id, supplier_id);

create index if not exists idx_material_price_catalog_items_profile_period_key
  on public.material_price_catalog_items (profile_id, period_key);

create index if not exists idx_material_price_catalog_items_profile_record_date
  on public.material_price_catalog_items (profile_id, record_date desc);

alter table public.material_price_catalog_items enable row level security;

drop policy if exists material_price_catalog_items_owner_all on public.material_price_catalog_items;
create policy material_price_catalog_items_owner_all
  on public.material_price_catalog_items
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

commit;
