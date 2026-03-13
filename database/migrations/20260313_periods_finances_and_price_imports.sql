begin;

create or replace function public.fn_period_key_from_date(input_date date)
returns text
language sql
immutable
as $$
  select to_char(input_date, 'YYYY-MM');
$$;

create or replace function public.fn_apply_period_fields()
returns trigger
language plpgsql
as $$
declare
  inherited_record_date date;
begin
  if new.record_date is null then
    if tg_table_name = 'clients' then
      new.record_date := coalesce(new.record_date, old.record_date, new.fecha_alta, current_date);
    elsif tg_table_name = 'settings' then
      new.record_date := coalesce(new.record_date, old.record_date, new.created_at::date, current_date);
    elsif tg_table_name = 'suppliers' then
      new.record_date := coalesce(new.record_date, old.record_date, new.created_at::date, current_date);
    elsif tg_table_name = 'materials' then
      new.record_date := coalesce(new.record_date, old.record_date, new.created_at::date, current_date);
    elsif tg_table_name = 'material_price_history' then
      new.record_date := coalesce(new.record_date, old.record_date, new.effective_from::date, current_date);
    elsif tg_table_name = 'custom_projects' then
      new.record_date := coalesce(new.record_date, old.record_date, new.fecha, current_date);
    elsif tg_table_name = 'custom_project_materials' then
      select record_date into inherited_record_date from public.custom_projects where id = new.custom_project_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'custom_project_labor' then
      select record_date into inherited_record_date from public.custom_projects where id = new.custom_project_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'ecommerce_products' then
      new.record_date := coalesce(new.record_date, old.record_date, new.created_at::date, current_date);
    elsif tg_table_name = 'ecommerce_product_materials' then
      select record_date into inherited_record_date from public.ecommerce_products where id = new.ecommerce_product_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'ecommerce_product_processes' then
      select record_date into inherited_record_date from public.ecommerce_products where id = new.ecommerce_product_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'cut_jobs' then
      new.record_date := coalesce(new.record_date, old.record_date, new.created_at::date, current_date);
    elsif tg_table_name = 'cut_job_parts' then
      select record_date into inherited_record_date from public.cut_jobs where id = new.cut_job_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'cut_job_layouts' then
      select record_date into inherited_record_date from public.cut_jobs where id = new.cut_job_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'purchases' then
      new.record_date := coalesce(new.record_date, old.record_date, new.fecha_emision, current_date);
    elsif tg_table_name = 'purchase_items' then
      select record_date into inherited_record_date from public.purchases where id = new.purchase_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'budgets' then
      new.record_date := coalesce(new.record_date, old.record_date, new.fecha_emision, current_date);
    elsif tg_table_name = 'budget_items' then
      select record_date into inherited_record_date from public.budgets where id = new.budget_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    elsif tg_table_name = 'jobs_board' then
      new.record_date := coalesce(new.record_date, old.record_date, new.fecha_inicio, new.fecha_prometida, new.created_at::date, current_date);
    elsif tg_table_name = 'attachments' then
      new.record_date := coalesce(new.record_date, old.record_date, new.created_at::date, current_date);
    elsif tg_table_name = 'categories' then
      new.record_date := coalesce(new.record_date, old.record_date, new.created_at::date, current_date);
    elsif tg_table_name = 'financial_transactions' then
      new.record_date := coalesce(new.record_date, old.record_date, current_date);
    elsif tg_table_name = 'material_price_lists' then
      new.record_date := coalesce(new.record_date, old.record_date, new.effective_date, current_date);
    elsif tg_table_name = 'material_price_imports' then
      new.record_date := coalesce(new.record_date, old.record_date, new.effective_date, new.started_at::date, current_date);
    elsif tg_table_name = 'material_price_import_rows' then
      select record_date into inherited_record_date from public.material_price_imports where id = new.import_id;
      new.record_date := coalesce(new.record_date, old.record_date, inherited_record_date, current_date);
    else
      new.record_date := coalesce(new.record_date, old.record_date, current_date);
    end if;
  end if;

  new.month := extract(month from new.record_date)::smallint;
  new.year := extract(year from new.record_date)::integer;
  new.period_key := public.fn_period_key_from_date(new.record_date);
  return new;
end;
$$;

do $$
declare
  period_tables text[] := array[
    'settings','clients','suppliers','materials','material_price_history',
    'custom_projects','custom_project_materials','custom_project_labor',
    'ecommerce_products','ecommerce_product_materials','ecommerce_product_processes',
    'cut_jobs','cut_job_parts','cut_job_layouts','purchases','purchase_items',
    'budgets','budget_items','jobs_board','attachments'
  ];
  table_name text;
begin
  foreach table_name in array period_tables loop
    execute format('alter table public.%I add column if not exists record_date date', table_name);
    execute format('alter table public.%I add column if not exists month smallint', table_name);
    execute format('alter table public.%I add column if not exists year integer', table_name);
    execute format('alter table public.%I add column if not exists period_key char(7)', table_name);
  end loop;
end $$;

alter table public.settings add column if not exists business_name text;
alter table public.settings add column if not exists business_legal_name text;
alter table public.settings add column if not exists tax_id text;
alter table public.settings add column if not exists phone text;
alter table public.settings add column if not exists email text;
alter table public.settings add column if not exists address text;
alter table public.settings add column if not exists city text;
alter table public.settings add column if not exists province text;
alter table public.settings add column if not exists base_currency char(3) not null default 'ARS';
alter table public.settings add column if not exists default_income_tax_pct numeric(8,4) not null default 0;
alter table public.settings add column if not exists default_vat_pct numeric(8,4) not null default 0;
alter table public.settings add column if not exists default_profit_pct numeric(8,4) not null default 30;
alter table public.settings add column if not exists indirect_costs_notes text;

alter table public.suppliers add column if not exists codigo text;
alter table public.suppliers add column if not exists contacto text;
alter table public.suppliers add column if not exists cuit text;
alter table public.suppliers add column if not exists condicion_iva text;
alter table public.suppliers add column if not exists observaciones text;
alter table public.suppliers add column if not exists is_primary boolean not null default false;

alter table public.purchases add column if not exists financial_sync_status text not null default 'pending';
alter table public.purchases add column if not exists financial_transaction_id uuid;

alter table public.budgets add column if not exists financial_sync_status text not null default 'pending';
alter table public.budgets add column if not exists financial_transaction_id uuid;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  domain text not null default 'finance',
  direction text not null default 'both',
  parent_id uuid,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
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

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  type text not null,
  category_id uuid,
  subcategory text,
  description text not null,
  amount numeric(14,2) not null default 0,
  currency char(3) not null default 'ARS',
  exchange_rate_to_base numeric(14,6) not null default 1,
  amount_base numeric(14,2) not null default 0,
  payment_method text,
  status text not null default 'pending',
  record_date date,
  month smallint,
  year integer,
  period_key char(7),
  client_id uuid,
  supplier_id uuid,
  custom_project_id uuid,
  budget_id uuid,
  job_id uuid,
  purchase_id uuid,
  source_module text,
  source_type text,
  source_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

create table if not exists public.material_price_lists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  supplier_id uuid not null,
  name text not null,
  source_filename text,
  checksum text,
  effective_date date not null default current_date,
  currency char(3) not null default 'ARS',
  status text not null default 'draft',
  notes text,
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

create table if not exists public.material_price_imports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  price_list_id uuid not null,
  supplier_id uuid not null,
  strategy text not null default 'update_matched_only',
  column_mapping jsonb not null default '{}'::jsonb,
  detected_columns jsonb not null default '[]'::jsonb,
  summary_total_rows integer not null default 0,
  summary_inserted integer not null default 0,
  summary_updated integer not null default 0,
  summary_ignored integer not null default 0,
  summary_failed integer not null default 0,
  imported_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rolled_back_at timestamptz,
  rollback_of_import_id uuid,
  status text not null default 'running',
  source_filename text,
  effective_date date not null default current_date,
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

create table if not exists public.material_price_import_rows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  import_id uuid not null,
  row_number integer not null,
  action text not null default 'ignored',
  match_type text not null default 'none',
  matched_material_id uuid,
  raw_row jsonb not null default '{}'::jsonb,
  normalized_row jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  previous_material_snapshot jsonb,
  result_material_snapshot jsonb,
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
  if not exists (select 1 from pg_constraint where conname = 'categories_profile_id_fkey') then alter table public.categories add constraint categories_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_id_fkey') then alter table public.categories add constraint categories_parent_id_fkey foreign key (parent_id) references public.categories(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_profile_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_category_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_client_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_supplier_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_custom_project_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_custom_project_id_fkey foreign key (custom_project_id) references public.custom_projects(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_budget_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_budget_id_fkey foreign key (budget_id) references public.budgets(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_job_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_job_id_fkey foreign key (job_id) references public.jobs_board(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_purchase_id_fkey') then alter table public.financial_transactions add constraint financial_transactions_purchase_id_fkey foreign key (purchase_id) references public.purchases(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_lists_profile_id_fkey') then alter table public.material_price_lists add constraint material_price_lists_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_lists_supplier_id_fkey') then alter table public.material_price_lists add constraint material_price_lists_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete restrict not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_imports_profile_id_fkey') then alter table public.material_price_imports add constraint material_price_imports_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_imports_price_list_id_fkey') then alter table public.material_price_imports add constraint material_price_imports_price_list_id_fkey foreign key (price_list_id) references public.material_price_lists(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_imports_supplier_id_fkey') then alter table public.material_price_imports add constraint material_price_imports_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id) on delete restrict not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_imports_rollback_of_import_id_fkey') then alter table public.material_price_imports add constraint material_price_imports_rollback_of_import_id_fkey foreign key (rollback_of_import_id) references public.material_price_imports(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_import_rows_profile_id_fkey') then alter table public.material_price_import_rows add constraint material_price_import_rows_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_import_rows_import_id_fkey') then alter table public.material_price_import_rows add constraint material_price_import_rows_import_id_fkey foreign key (import_id) references public.material_price_imports(id) on delete cascade not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'material_price_import_rows_matched_material_id_fkey') then alter table public.material_price_import_rows add constraint material_price_import_rows_matched_material_id_fkey foreign key (matched_material_id) references public.materials(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'purchases_financial_transaction_id_fkey') then alter table public.purchases add constraint purchases_financial_transaction_id_fkey foreign key (financial_transaction_id) references public.financial_transactions(id) on delete set null not valid; end if;
  if not exists (select 1 from pg_constraint where conname = 'budgets_financial_transaction_id_fkey') then alter table public.budgets add constraint budgets_financial_transaction_id_fkey foreign key (financial_transaction_id) references public.financial_transactions(id) on delete set null not valid; end if;
end $$;

update public.settings set record_date = coalesce(record_date, created_at::date);
update public.clients set record_date = coalesce(record_date, fecha_alta, created_at::date);
update public.suppliers set record_date = coalesce(record_date, created_at::date);
update public.materials set record_date = coalesce(record_date, created_at::date);
update public.material_price_history set record_date = coalesce(record_date, effective_from::date);
update public.custom_projects set record_date = coalesce(record_date, fecha);
update public.custom_project_materials as cpm set record_date = coalesce(cpm.record_date, cp.record_date, cp.fecha) from public.custom_projects as cp where cp.id = cpm.custom_project_id and cpm.record_date is null;
update public.custom_project_labor as cpl set record_date = coalesce(cpl.record_date, cp.record_date, cp.fecha) from public.custom_projects as cp where cp.id = cpl.custom_project_id and cpl.record_date is null;
update public.ecommerce_products set record_date = coalesce(record_date, created_at::date);
update public.ecommerce_product_materials as epm set record_date = coalesce(epm.record_date, ep.record_date, ep.created_at::date) from public.ecommerce_products as ep where ep.id = epm.ecommerce_product_id and epm.record_date is null;
update public.ecommerce_product_processes as epp set record_date = coalesce(epp.record_date, ep.record_date, ep.created_at::date) from public.ecommerce_products as ep where ep.id = epp.ecommerce_product_id and epp.record_date is null;
update public.cut_jobs set record_date = coalesce(record_date, created_at::date);
update public.cut_job_parts as cjp set record_date = coalesce(cjp.record_date, cj.record_date, cj.created_at::date) from public.cut_jobs as cj where cj.id = cjp.cut_job_id and cjp.record_date is null;
update public.cut_job_layouts as cjl set record_date = coalesce(cjl.record_date, cj.record_date, cj.created_at::date) from public.cut_jobs as cj where cj.id = cjl.cut_job_id and cjl.record_date is null;
update public.purchases set record_date = coalesce(record_date, fecha_emision);
update public.purchase_items as pi set record_date = coalesce(pi.record_date, p.record_date, p.fecha_emision) from public.purchases as p where p.id = pi.purchase_id and pi.record_date is null;
update public.budgets set record_date = coalesce(record_date, fecha_emision);
update public.budget_items as bi set record_date = coalesce(bi.record_date, b.record_date, b.fecha_emision) from public.budgets as b where b.id = bi.budget_id and bi.record_date is null;
update public.jobs_board set record_date = coalesce(record_date, fecha_inicio, fecha_prometida, created_at::date);
update public.attachments set record_date = coalesce(record_date, created_at::date);

do $$
declare
  period_tables text[] := array[
    'settings','clients','suppliers','materials','material_price_history',
    'custom_projects','custom_project_materials','custom_project_labor',
    'ecommerce_products','ecommerce_product_materials','ecommerce_product_processes',
    'cut_jobs','cut_job_parts','cut_job_layouts','purchases','purchase_items',
    'budgets','budget_items','jobs_board','attachments',
    'categories','financial_transactions','material_price_lists',
    'material_price_imports','material_price_import_rows'
  ];
  table_name text;
begin
  foreach table_name in array period_tables loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_period_fields', table_name);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.fn_apply_period_fields()', 'trg_' || table_name || '_period_fields', table_name);
    execute format('update public.%I set record_date = current_date where record_date is null', table_name);
    execute format('update public.%I set month = extract(month from record_date)::smallint, year = extract(year from record_date)::integer, period_key = public.fn_period_key_from_date(record_date) where month is null or year is null or period_key is null', table_name);
    execute format('alter table public.%I alter column record_date set not null', table_name);
    execute format('alter table public.%I alter column month set not null', table_name);
    execute format('alter table public.%I alter column year set not null', table_name);
    execute format('alter table public.%I alter column period_key set not null', table_name);
    execute format('create index if not exists %I on public.%I (profile_id, period_key)', 'idx_' || table_name || '_profile_period_key', table_name);
    execute format('create index if not exists %I on public.%I (profile_id, year, month)', 'idx_' || table_name || '_profile_year_month', table_name);
    execute format('create index if not exists %I on public.%I (profile_id, record_date desc)', 'idx_' || table_name || '_profile_record_date', table_name);
  end loop;
end $$;

create unique index if not exists idx_categories_profile_domain_code on public.categories (profile_id, domain, code);
create index if not exists idx_categories_profile_domain_active on public.categories (profile_id, domain, is_active);
create index if not exists idx_financial_transactions_profile_type_period on public.financial_transactions (profile_id, type, period_key);
create index if not exists idx_financial_transactions_profile_status_period on public.financial_transactions (profile_id, status, period_key);
create index if not exists idx_financial_transactions_profile_supplier_period on public.financial_transactions (profile_id, supplier_id, period_key);
create index if not exists idx_financial_transactions_profile_client_period on public.financial_transactions (profile_id, client_id, period_key);
create index if not exists idx_financial_transactions_profile_project_period on public.financial_transactions (profile_id, custom_project_id, period_key);
create index if not exists idx_financial_transactions_profile_budget_period on public.financial_transactions (profile_id, budget_id, period_key);
create index if not exists idx_material_price_lists_profile_supplier_effective on public.material_price_lists (profile_id, supplier_id, effective_date desc);
create index if not exists idx_material_price_lists_profile_checksum on public.material_price_lists (profile_id, checksum);
create index if not exists idx_material_price_imports_profile_supplier_created on public.material_price_imports (profile_id, supplier_id, created_at desc);
create index if not exists idx_material_price_imports_profile_list_created on public.material_price_imports (profile_id, price_list_id, created_at desc);
create index if not exists idx_material_price_imports_profile_status_created on public.material_price_imports (profile_id, status, created_at desc);
create index if not exists idx_material_price_import_rows_import_row on public.material_price_import_rows (import_id, row_number);
create index if not exists idx_material_price_import_rows_profile_material on public.material_price_import_rows (profile_id, matched_material_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['categories','financial_transactions','material_price_lists','material_price_imports','material_price_import_rows'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at_and_by()', 'trg_' || table_name || '_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_all', table_name);
    execute format('create policy %I on public.%I for all using (profile_id = auth.uid()) with check (profile_id = auth.uid())', table_name || '_owner_all', table_name);
  end loop;
end $$;

commit;
