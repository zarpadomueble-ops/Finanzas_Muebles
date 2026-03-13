-- Carpi Industrial SaaS - Supabase/PostgreSQL migration
-- Date: 2026-03-11
-- Goals:
-- 1) Create/upgrade schema with UUIDs, timestamps, audit columns, RLS, indexes, and snapshots.
-- 2) Keep compatibility with legacy tables/columns when possible.
-- 3) Backfill new required tables from legacy equivalents without destructive drops.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- =========================================================
-- Helpers
-- =========================================================

create or replace function public.fn_set_updated_at_and_by()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create or replace function public.fn_recompute_settings_cost_per_hour()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.horas_productivas_mes, 0) > 0 then
    new.costo_hora_taller = round((new.costos_fijos_mes / new.horas_productivas_mes)::numeric, 2);
  else
    new.costo_hora_taller = 0;
  end if;

  return new;
end;
$$;

create or replace function public.fn_recompute_material_area()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.largo_mm, 0) > 0 and coalesce(new.ancho_mm, 0) > 0 then
    new.area_m2 = round(((new.largo_mm * new.ancho_mm) / 1000000.0)::numeric, 4);
  else
    new.area_m2 = 0;
  end if;

  return new;
end;
$$;

-- =========================================================
-- Profiles (required, replaces legacy "users")
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  locale text not null default 'es-AR',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

create index if not exists idx_profiles_email_lower on public.profiles (lower(email));
create index if not exists idx_profiles_deleted_at on public.profiles (deleted_at);

-- Backfill legacy users -> profiles (non-destructive).
do $$
begin
  if to_regclass('public.users') is not null then
    insert into public.profiles (id, full_name, email, created_at, updated_at, created_by, updated_by)
    select
      u.id,
      coalesce(u.full_name, 'Perfil sin nombre'),
      u.email,
      coalesce(u.created_at, now()),
      coalesce(u.created_at, now()),
      u.id,
      u.id
    from public.users u
    on conflict (id) do update
      set full_name = excluded.full_name,
          email = coalesce(excluded.email, public.profiles.email),
          updated_at = now();
  end if;
end $$;

-- =========================================================
-- Existing core tables: add required columns for new model
-- =========================================================

-- SETTINGS -------------------------------------------------
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  horas_productivas_mes numeric(12,2) not null default 176,
  costos_fijos_mes numeric(14,2) not null default 0,
  costo_hora_taller numeric(14,2) not null default 0,
  desperdicio_melamina_pct numeric(8,4) not null default 0,
  margen_medida_pct numeric(8,4) not null default 30,
  margen_ecommerce_pct numeric(8,4) not null default 25,
  impuestos_pct numeric(8,4) not null default 0,
  publicidad_pct numeric(8,4) not null default 0,
  comision_cobro_pct numeric(8,4) not null default 0,
  embalaje_promedio numeric(14,2) not null default 0,
  envio_promedio numeric(14,2) not null default 0,
  kerf_sierra_mm numeric(10,3) not null default 3,
  margen_perimetral_placa_mm numeric(10,3) not null default 10,
  permitir_rotacion_por_defecto boolean not null default true,
  veta_obligatoria_por_defecto boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.settings add column if not exists profile_id uuid;
alter table public.settings add column if not exists is_active boolean not null default true;
alter table public.settings add column if not exists notes text;
alter table public.settings add column if not exists created_at timestamptz not null default now();
alter table public.settings add column if not exists created_by uuid default auth.uid();
alter table public.settings add column if not exists updated_by uuid default auth.uid();
alter table public.settings add column if not exists deleted_at timestamptz;
alter table public.settings add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'settings'
      and column_name = 'user_id'
  ) then
    update public.settings s
    set profile_id = s.user_id
    where s.profile_id is null
      and s.user_id is not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_profile_id_fkey'
  ) then
    alter table public.settings
      add constraint settings_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_non_negative_chk'
  ) then
    alter table public.settings
      add constraint settings_non_negative_chk
      check (
        horas_productivas_mes >= 0 and
        costos_fijos_mes >= 0 and
        costo_hora_taller >= 0 and
        desperdicio_melamina_pct >= 0 and
        margen_medida_pct >= 0 and
        margen_ecommerce_pct >= 0 and
        impuestos_pct >= 0 and
        publicidad_pct >= 0 and
        comision_cobro_pct >= 0 and
        embalaje_promedio >= 0 and
        envio_promedio >= 0 and
        kerf_sierra_mm >= 0 and
        margen_perimetral_placa_mm >= 0
      ) not valid;
  end if;
end $$;

create unique index if not exists idx_settings_profile_active
  on public.settings (profile_id, is_active)
  where deleted_at is null;

-- CLIENTS --------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  nombre text not null,
  telefono text,
  email text,
  direccion text,
  ciudad text,
  provincia text,
  notas text,
  canal_ingreso text,
  fecha_alta date,
  saldo_pendiente numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.clients add column if not exists profile_id uuid;
alter table public.clients add column if not exists updated_at timestamptz not null default now();
alter table public.clients add column if not exists created_by uuid default auth.uid();
alter table public.clients add column if not exists updated_by uuid default auth.uid();
alter table public.clients add column if not exists deleted_at timestamptz;
alter table public.clients add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'user_id'
  ) then
    update public.clients c
    set profile_id = c.user_id
    where c.profile_id is null
      and c.user_id is not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_profile_id_fkey'
  ) then
    alter table public.clients
      add constraint clients_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

create index if not exists idx_clients_profile_created_at on public.clients (profile_id, created_at desc);
create index if not exists idx_clients_nombre_trgm on public.clients using gin (nombre gin_trgm_ops);
create index if not exists idx_clients_email_lower on public.clients (lower(email));
create index if not exists idx_clients_deleted_at on public.clients (deleted_at);

-- SUPPLIERS ------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  nombre text not null,
  telefono text,
  email text,
  ciudad text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.suppliers add column if not exists profile_id uuid;
alter table public.suppliers add column if not exists updated_at timestamptz not null default now();
alter table public.suppliers add column if not exists created_by uuid default auth.uid();
alter table public.suppliers add column if not exists updated_by uuid default auth.uid();
alter table public.suppliers add column if not exists deleted_at timestamptz;
alter table public.suppliers add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suppliers'
      and column_name = 'user_id'
  ) then
    update public.suppliers s
    set profile_id = s.user_id
    where s.profile_id is null
      and s.user_id is not null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_profile_id_fkey') then
    alter table public.suppliers
      add constraint suppliers_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

create index if not exists idx_suppliers_profile_created_at on public.suppliers (profile_id, created_at desc);
create index if not exists idx_suppliers_nombre_trgm on public.suppliers using gin (nombre gin_trgm_ops);
create index if not exists idx_suppliers_deleted_at on public.suppliers (deleted_at);

-- MATERIALS ------------------------------------------------
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  codigo text not null,
  nombre text not null,
  categoria text not null,
  unidad text not null,
  costo_unitario numeric(14,2) not null default 0,
  supplier_id uuid,
  marca text,
  espesor_mm numeric(10,3),
  largo_mm numeric(12,3),
  ancho_mm numeric(12,3),
  area_m2 numeric(14,4) not null default 0,
  tiene_veta boolean not null default false,
  activo boolean not null default true,
  favorito boolean not null default false,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.materials add column if not exists profile_id uuid;
alter table public.materials add column if not exists tiene_veta boolean not null default false;
alter table public.materials add column if not exists created_by uuid default auth.uid();
alter table public.materials add column if not exists updated_by uuid default auth.uid();
alter table public.materials add column if not exists deleted_at timestamptz;
alter table public.materials add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'user_id'
  ) then
    update public.materials m
    set profile_id = m.user_id
    where m.profile_id is null
      and m.user_id is not null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_profile_id_fkey') then
    alter table public.materials
      add constraint materials_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_supplier_id_fkey') then
    alter table public.materials
      add constraint materials_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers(id) on delete set null not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'materials_categoria_chk') then
    alter table public.materials
      add constraint materials_categoria_chk
      check (categoria in ('placas', 'herrajes', 'perfiles', 'insumos', 'logistica', 'servicios')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'materials_unidad_chk') then
    alter table public.materials
      add constraint materials_unidad_chk
      check (unidad in ('unidad', 'm2', 'm', 'kg', 'hora')) not valid;
  end if;
end $$;

create unique index if not exists idx_materials_profile_codigo_unique
  on public.materials (profile_id, codigo)
  where deleted_at is null;

create index if not exists idx_materials_profile_categoria on public.materials (profile_id, categoria);
create index if not exists idx_materials_nombre_trgm on public.materials using gin (nombre gin_trgm_ops);
create index if not exists idx_materials_codigo_trgm on public.materials using gin (codigo gin_trgm_ops);
create index if not exists idx_materials_deleted_at on public.materials (deleted_at);

-- ECOMMERCE PRODUCTS --------------------------------------
create table if not exists public.ecommerce_products (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  sku text not null,
  nombre text not null,
  categoria text,
  precio_mercado numeric(14,2) not null default 0,
  ancho numeric(12,3),
  alto numeric(12,3),
  profundidad numeric(12,3),
  horas_proceso_unit numeric(12,3) not null default 0,
  embalaje_unitario numeric(14,2) not null default 0,
  envio_unitario numeric(14,2) not null default 0,
  costo_materiales_unit numeric(14,2) not null default 0,
  costo_mano_obra_unit numeric(14,2) not null default 0,
  costo_base_unit numeric(14,2) not null default 0,
  costo_con_embalaje numeric(14,2) not null default 0,
  costo_total_canal numeric(14,2) not null default 0,
  precio_sugerido numeric(14,2) not null default 0,
  ganancia_unit numeric(14,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.ecommerce_products add column if not exists profile_id uuid;
alter table public.ecommerce_products add column if not exists status text not null default 'active';
alter table public.ecommerce_products add column if not exists created_by uuid default auth.uid();
alter table public.ecommerce_products add column if not exists updated_by uuid default auth.uid();
alter table public.ecommerce_products add column if not exists deleted_at timestamptz;
alter table public.ecommerce_products add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ecommerce_products'
      and column_name = 'user_id'
  ) then
    update public.ecommerce_products p
    set profile_id = p.user_id
    where p.profile_id is null
      and p.user_id is not null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_products_profile_id_fkey') then
    alter table public.ecommerce_products
      add constraint ecommerce_products_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

create unique index if not exists idx_ecommerce_profile_sku_unique
  on public.ecommerce_products (profile_id, sku)
  where deleted_at is null;

create index if not exists idx_ecommerce_nombre_trgm on public.ecommerce_products using gin (nombre gin_trgm_ops);
create index if not exists idx_ecommerce_deleted_at on public.ecommerce_products (deleted_at);

-- CUT JOBS -------------------------------------------------
create table if not exists public.cut_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  nombre text not null,
  largo_placa_mm numeric(12,3) not null default 0,
  ancho_placa_mm numeric(12,3) not null default 0,
  kerf_mm numeric(10,3) not null default 3,
  margen_perimetral_mm numeric(10,3) not null default 10,
  desperdicio_extra_pct numeric(8,4) not null default 0,
  allow_rotation_default boolean not null default true,
  grain_required_default boolean not null default false,
  iteration_actual integer not null default 1,
  placas_necesarias_snapshot integer not null default 0,
  aprovechamiento_pct_snapshot numeric(8,4) not null default 0,
  desperdicio_pct_snapshot numeric(8,4) not null default 0,
  costo_placas_snapshot numeric(14,2) not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.cut_jobs add column if not exists profile_id uuid;
alter table public.cut_jobs add column if not exists largo_placa numeric(12,3);
alter table public.cut_jobs add column if not exists ancho_placa numeric(12,3);
alter table public.cut_jobs add column if not exists kerf numeric(10,3);
alter table public.cut_jobs add column if not exists margen_perimetral numeric(10,3);
alter table public.cut_jobs add column if not exists desperdicio_extra numeric(8,4);
alter table public.cut_jobs add column if not exists largo_placa_mm numeric(12,3);
alter table public.cut_jobs add column if not exists ancho_placa_mm numeric(12,3);
alter table public.cut_jobs add column if not exists kerf_mm numeric(10,3);
alter table public.cut_jobs add column if not exists margen_perimetral_mm numeric(10,3);
alter table public.cut_jobs add column if not exists desperdicio_extra_pct numeric(8,4) not null default 0;
alter table public.cut_jobs add column if not exists iteration_actual integer not null default 1;
alter table public.cut_jobs add column if not exists placas_necesarias_snapshot integer not null default 0;
alter table public.cut_jobs add column if not exists aprovechamiento_pct_snapshot numeric(8,4) not null default 0;
alter table public.cut_jobs add column if not exists desperdicio_pct_snapshot numeric(8,4) not null default 0;
alter table public.cut_jobs add column if not exists costo_placas_snapshot numeric(14,2) not null default 0;
alter table public.cut_jobs add column if not exists status text not null default 'draft';
alter table public.cut_jobs add column if not exists created_by uuid default auth.uid();
alter table public.cut_jobs add column if not exists updated_by uuid default auth.uid();
alter table public.cut_jobs add column if not exists deleted_at timestamptz;
alter table public.cut_jobs add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cut_jobs'
      and column_name = 'user_id'
  ) then
    update public.cut_jobs c
    set profile_id = c.user_id
    where c.profile_id is null
      and c.user_id is not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cut_jobs' and column_name = 'largo_placa'
  ) then
    update public.cut_jobs set largo_placa_mm = largo_placa where largo_placa_mm is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cut_jobs' and column_name = 'ancho_placa'
  ) then
    update public.cut_jobs set ancho_placa_mm = ancho_placa where ancho_placa_mm is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cut_jobs' and column_name = 'kerf'
  ) then
    update public.cut_jobs set kerf_mm = kerf where kerf_mm is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cut_jobs' and column_name = 'margen_perimetral'
  ) then
    update public.cut_jobs
    set margen_perimetral_mm = margen_perimetral
    where margen_perimetral_mm is null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cut_jobs_profile_id_fkey') then
    alter table public.cut_jobs
      add constraint cut_jobs_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

create index if not exists idx_cut_jobs_profile_created_at on public.cut_jobs (profile_id, created_at desc);
create index if not exists idx_cut_jobs_status on public.cut_jobs (profile_id, status);
create index if not exists idx_cut_jobs_deleted_at on public.cut_jobs (deleted_at);

-- PURCHASES ------------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  source_type text not null default 'manual',
  source_id uuid,
  supplier_id uuid,
  fecha_emision date not null default current_date,
  fecha_entrega_estimada date,
  status text not null default 'draft',
  moneda char(3) not null default 'ARS',
  subtotal_snapshot numeric(14,2) not null default 0,
  impuestos_snapshot numeric(14,2) not null default 0,
  total_snapshot numeric(14,2) not null default 0,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.purchases add column if not exists profile_id uuid;
alter table public.purchases add column if not exists source_type text not null default 'manual';
alter table public.purchases add column if not exists source_id uuid;
alter table public.purchases add column if not exists supplier_id uuid;
alter table public.purchases add column if not exists fecha_emision date not null default current_date;
alter table public.purchases add column if not exists fecha_entrega_estimada date;
alter table public.purchases add column if not exists moneda char(3) not null default 'ARS';
alter table public.purchases add column if not exists subtotal_snapshot numeric(14,2) not null default 0;
alter table public.purchases add column if not exists impuestos_snapshot numeric(14,2) not null default 0;
alter table public.purchases add column if not exists total_snapshot numeric(14,2) not null default 0;
alter table public.purchases add column if not exists notas text;
alter table public.purchases add column if not exists updated_at timestamptz not null default now();
alter table public.purchases add column if not exists created_by uuid default auth.uid();
alter table public.purchases add column if not exists updated_by uuid default auth.uid();
alter table public.purchases add column if not exists deleted_at timestamptz;
alter table public.purchases add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'user_id'
  ) then
    update public.purchases p
    set profile_id = p.user_id
    where p.profile_id is null
      and p.user_id is not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases' and column_name = 'origen'
  ) then
    update public.purchases p
    set source_type = case
      when p.origen = 'proyecto' then 'custom_project'
      when p.origen = 'corte' then 'cut_job'
      else 'manual'
    end
    where p.source_type is null or p.source_type = 'manual';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases' and column_name = 'reference_id'
  ) then
    update public.purchases p
    set source_id = p.reference_id
    where p.source_id is null and p.reference_id is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases' and column_name = 'fecha'
  ) then
    update public.purchases p
    set fecha_emision = p.fecha
    where p.fecha_emision is null and p.fecha is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases' and column_name = 'total'
  ) then
    update public.purchases p
    set total_snapshot = p.total
    where p.total_snapshot = 0 and p.total is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'purchases' and column_name = 'status'
  ) then
    update public.purchases p
    set status = case p.status
      when 'borrador' then 'draft'
      when 'emitida' then 'ordered'
      when 'completa' then 'received'
      else p.status
    end;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_profile_id_fkey') then
    alter table public.purchases
      add constraint purchases_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchases_supplier_id_fkey') then
    alter table public.purchases
      add constraint purchases_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers(id) on delete set null not valid;
  end if;
end $$;

create index if not exists idx_purchases_profile_fecha on public.purchases (profile_id, fecha_emision desc);
create index if not exists idx_purchases_profile_status on public.purchases (profile_id, status);
create index if not exists idx_purchases_deleted_at on public.purchases (deleted_at);

-- PURCHASE ITEMS ------------------------------------------
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  purchase_id uuid not null,
  material_id uuid,
  supplier_id uuid,
  descripcion_snapshot text,
  cantidad numeric(14,3) not null default 0,
  unidad_snapshot text,
  costo_unitario_snapshot numeric(14,2) not null default 0,
  subtotal_snapshot numeric(14,2) not null default 0,
  cantidad_recibida numeric(14,3) not null default 0,
  estado text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.purchase_items add column if not exists profile_id uuid;
alter table public.purchase_items add column if not exists supplier_id uuid;
alter table public.purchase_items add column if not exists descripcion_snapshot text;
alter table public.purchase_items add column if not exists unidad_snapshot text;
alter table public.purchase_items add column if not exists subtotal_snapshot numeric(14,2) not null default 0;
alter table public.purchase_items add column if not exists cantidad_recibida numeric(14,3) not null default 0;
alter table public.purchase_items add column if not exists estado text not null default 'pending';
alter table public.purchase_items add column if not exists created_at timestamptz not null default now();
alter table public.purchase_items add column if not exists updated_at timestamptz not null default now();
alter table public.purchase_items add column if not exists created_by uuid default auth.uid();
alter table public.purchase_items add column if not exists updated_by uuid default auth.uid();
alter table public.purchase_items add column if not exists deleted_at timestamptz;
alter table public.purchase_items add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchase_items'
      and column_name = 'unidad'
  ) then
    update public.purchase_items i
    set unidad_snapshot = i.unidad
    where i.unidad_snapshot is null and i.unidad is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchase_items'
      and column_name = 'subtotal'
  ) then
    update public.purchase_items i
    set subtotal_snapshot = i.subtotal
    where i.subtotal_snapshot = 0 and i.subtotal is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchase_items'
      and column_name = 'comprado'
  ) then
    update public.purchase_items i
    set estado = case when i.comprado then 'received' else 'pending' end
    where i.estado is null or i.estado = 'pending';
  end if;

  update public.purchase_items i
  set profile_id = p.profile_id
  from public.purchases p
  where p.id = i.purchase_id
    and i.profile_id is null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_items_profile_id_fkey') then
    alter table public.purchase_items
      add constraint purchase_items_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchase_items_purchase_id_fkey') then
    alter table public.purchase_items
      add constraint purchase_items_purchase_id_fkey
      foreign key (purchase_id) references public.purchases(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchase_items_material_id_fkey') then
    alter table public.purchase_items
      add constraint purchase_items_material_id_fkey
      foreign key (material_id) references public.materials(id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchase_items_supplier_id_fkey') then
    alter table public.purchase_items
      add constraint purchase_items_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers(id) on delete set null not valid;
  end if;
end $$;

create index if not exists idx_purchase_items_purchase on public.purchase_items (purchase_id);
create index if not exists idx_purchase_items_profile_estado on public.purchase_items (profile_id, estado);
create index if not exists idx_purchase_items_deleted_at on public.purchase_items (deleted_at);

-- BUDGETS --------------------------------------------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  client_id uuid,
  custom_project_id uuid,
  ecommerce_product_id uuid,
  budget_number text,
  fecha_emision date not null default current_date,
  fecha_validez date,
  forma_pago text,
  estado text not null default 'draft',
  moneda char(3) not null default 'ARS',
  subtotal_snapshot numeric(14,2) not null default 0,
  descuento_snapshot numeric(14,2) not null default 0,
  impuestos_snapshot numeric(14,2) not null default 0,
  total_snapshot numeric(14,2) not null default 0,
  sena_snapshot numeric(14,2) not null default 0,
  saldo_snapshot numeric(14,2) not null default 0,
  costs_snapshot jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  terms_snapshot jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.budgets add column if not exists profile_id uuid;
alter table public.budgets add column if not exists custom_project_id uuid;
alter table public.budgets add column if not exists budget_number text;
alter table public.budgets add column if not exists fecha_emision date not null default current_date;
alter table public.budgets add column if not exists fecha_validez date;
alter table public.budgets add column if not exists estado text not null default 'draft';
alter table public.budgets add column if not exists moneda char(3) not null default 'ARS';
alter table public.budgets add column if not exists subtotal_snapshot numeric(14,2) not null default 0;
alter table public.budgets add column if not exists descuento_snapshot numeric(14,2) not null default 0;
alter table public.budgets add column if not exists impuestos_snapshot numeric(14,2) not null default 0;
alter table public.budgets add column if not exists total_snapshot numeric(14,2) not null default 0;
alter table public.budgets add column if not exists sena_snapshot numeric(14,2) not null default 0;
alter table public.budgets add column if not exists saldo_snapshot numeric(14,2) not null default 0;
alter table public.budgets add column if not exists costs_snapshot jsonb not null default '{}'::jsonb;
alter table public.budgets add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;
alter table public.budgets add column if not exists terms_snapshot jsonb not null default '{}'::jsonb;
alter table public.budgets add column if not exists locked_at timestamptz;
alter table public.budgets add column if not exists updated_at timestamptz not null default now();
alter table public.budgets add column if not exists created_by uuid default auth.uid();
alter table public.budgets add column if not exists updated_by uuid default auth.uid();
alter table public.budgets add column if not exists deleted_at timestamptz;
alter table public.budgets add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'user_id'
  ) then
    update public.budgets b
    set profile_id = b.user_id
    where b.profile_id is null
      and b.user_id is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'project_id'
  ) then
    update public.budgets b
    set custom_project_id = b.project_id
    where b.custom_project_id is null and b.project_id is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'fecha'
  ) then
    update public.budgets b
    set fecha_emision = b.fecha
    where b.fecha is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'validez_dias'
  ) then
    update public.budgets b
    set fecha_validez = b.fecha_emision + make_interval(days => coalesce(b.validez_dias, 0)::int)
    where b.fecha_validez is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'status'
  ) then
    update public.budgets b
    set estado = case b.status
      when 'borrador' then 'draft'
      when 'enviado' then 'sent'
      when 'aprobado' then 'approved'
      when 'rechazado' then 'rejected'
      else b.estado
    end
    where b.estado = 'draft';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'total'
  ) then
    update public.budgets b
    set total_snapshot = b.total
    where b.total is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'sena'
  ) then
    update public.budgets b
    set sena_snapshot = b.sena
    where b.sena is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'saldo'
  ) then
    update public.budgets b
    set saldo_snapshot = b.saldo
    where b.saldo is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budgets'
      and column_name = 'snapshot'
  ) then
    update public.budgets b
    set costs_snapshot = coalesce(b.snapshot, '{}'::jsonb)
    where b.costs_snapshot = '{}'::jsonb;
  end if;
end $$;

create index if not exists idx_budgets_profile_fecha on public.budgets (profile_id, fecha_emision desc);
create index if not exists idx_budgets_profile_estado on public.budgets (profile_id, estado);
create index if not exists idx_budgets_client on public.budgets (client_id);
create unique index if not exists idx_budgets_profile_number_unique
  on public.budgets (profile_id, budget_number)
  where deleted_at is null and budget_number is not null;
create index if not exists idx_budgets_deleted_at on public.budgets (deleted_at);
create index if not exists idx_budgets_costs_snapshot_gin on public.budgets using gin (costs_snapshot);

-- JOBS BOARD ------------------------------------------------
create table if not exists public.jobs_board (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  custom_project_id uuid,
  budget_id uuid,
  client_id uuid,
  titulo text,
  estado text not null default 'por_cotizar',
  monto_snapshot numeric(14,2) not null default 0,
  sena_snapshot numeric(14,2) not null default 0,
  saldo_snapshot numeric(14,2) not null default 0,
  fecha_prometida date,
  fecha_inicio date,
  fecha_entrega date,
  avance_pct numeric(8,4) not null default 0,
  prioridad smallint not null default 3,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.jobs_board add column if not exists profile_id uuid;
alter table public.jobs_board add column if not exists custom_project_id uuid;
alter table public.jobs_board add column if not exists titulo text;
alter table public.jobs_board add column if not exists estado text not null default 'por_cotizar';
alter table public.jobs_board add column if not exists monto_snapshot numeric(14,2) not null default 0;
alter table public.jobs_board add column if not exists sena_snapshot numeric(14,2) not null default 0;
alter table public.jobs_board add column if not exists saldo_snapshot numeric(14,2) not null default 0;
alter table public.jobs_board add column if not exists fecha_inicio date;
alter table public.jobs_board add column if not exists fecha_entrega date;
alter table public.jobs_board add column if not exists avance_pct numeric(8,4) not null default 0;
alter table public.jobs_board add column if not exists prioridad smallint not null default 3;
alter table public.jobs_board add column if not exists notas text;
alter table public.jobs_board add column if not exists created_at timestamptz not null default now();
alter table public.jobs_board add column if not exists created_by uuid default auth.uid();
alter table public.jobs_board add column if not exists updated_by uuid default auth.uid();
alter table public.jobs_board add column if not exists deleted_at timestamptz;
alter table public.jobs_board add column if not exists deleted_by uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs_board'
      and column_name = 'user_id'
  ) then
    update public.jobs_board j
    set profile_id = j.user_id
    where j.profile_id is null
      and j.user_id is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs_board' and column_name = 'project_id'
  ) then
    update public.jobs_board j
    set custom_project_id = j.project_id
    where j.custom_project_id is null and j.project_id is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs_board' and column_name = 'nombre_proyecto'
  ) then
    update public.jobs_board j
    set titulo = coalesce(j.titulo, j.nombre_proyecto)
    where j.titulo is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs_board' and column_name = 'monto'
  ) then
    update public.jobs_board j
    set monto_snapshot = j.monto
    where j.monto is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs_board' and column_name = 'sena'
  ) then
    update public.jobs_board j
    set sena_snapshot = j.sena
    where j.sena is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs_board' and column_name = 'saldo'
  ) then
    update public.jobs_board j
    set saldo_snapshot = j.saldo
    where j.saldo is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs_board' and column_name = 'avance'
  ) then
    update public.jobs_board j
    set avance_pct = j.avance
    where j.avance is not null;
  end if;
end $$;

create index if not exists idx_jobs_board_profile_estado on public.jobs_board (profile_id, estado);
create index if not exists idx_jobs_board_profile_fecha_prom on public.jobs_board (profile_id, fecha_prometida);
create index if not exists idx_jobs_board_deleted_at on public.jobs_board (deleted_at);

-- =========================================================
-- Required new tables (normalized + snapshots)
-- =========================================================

create table if not exists public.material_price_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  material_id uuid not null,
  price_old numeric(14,2) not null,
  price_new numeric(14,2) not null,
  change_reason text,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint material_price_history_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint material_price_history_material_id_fkey
    foreign key (material_id) references public.materials(id) on delete cascade,
  constraint material_price_history_price_non_negative_chk
    check (price_old >= 0 and price_new >= 0),
  constraint material_price_history_effective_range_chk
    check (effective_to is null or effective_to > effective_from)
);

create index if not exists idx_material_price_history_material_effective
  on public.material_price_history (material_id, effective_from desc);

create table if not exists public.custom_projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  client_id uuid,
  nombre_proyecto text not null,
  fecha date not null default current_date,
  tipo_mueble text,
  ancho numeric(12,3),
  alto numeric(12,3),
  profundidad numeric(12,3),
  cantidad integer not null default 1,
  descuento_pct numeric(8,4) not null default 0,
  subtotal_materiales numeric(14,2) not null default 0,
  horas_totales numeric(12,3) not null default 0,
  costo_mano_obra numeric(14,2) not null default 0,
  costo_directo numeric(14,2) not null default 0,
  costo_total numeric(14,2) not null default 0,
  precio_sugerido numeric(14,2) not null default 0,
  utilidad_estimada numeric(14,2) not null default 0,
  status text not null default 'draft',
  settings_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint custom_projects_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint custom_projects_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete set null
);

create index if not exists idx_custom_projects_profile_fecha on public.custom_projects (profile_id, fecha desc);
create index if not exists idx_custom_projects_profile_status on public.custom_projects (profile_id, status);
create index if not exists idx_custom_projects_deleted_at on public.custom_projects (deleted_at);

create table if not exists public.custom_project_materials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  custom_project_id uuid not null,
  material_id uuid,
  material_codigo_snapshot text,
  material_nombre_snapshot text not null,
  unidad_snapshot text,
  espesor_mm_snapshot numeric(10,3),
  consumo numeric(14,3) not null,
  desperdicio_pct numeric(8,4) not null default 0,
  costo_unitario_snapshot numeric(14,2) not null,
  subtotal_snapshot numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint custom_project_materials_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint custom_project_materials_project_id_fkey
    foreign key (custom_project_id) references public.custom_projects(id) on delete cascade,
  constraint custom_project_materials_material_id_fkey
    foreign key (material_id) references public.materials(id) on delete set null,
  constraint custom_project_materials_non_negative_chk
    check (consumo > 0 and desperdicio_pct >= 0 and costo_unitario_snapshot >= 0 and subtotal_snapshot >= 0)
);

create index if not exists idx_custom_project_materials_project on public.custom_project_materials (custom_project_id);

create table if not exists public.custom_project_labor (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  custom_project_id uuid not null,
  proceso_key text not null,
  proceso_nombre text not null,
  horas numeric(12,3) not null,
  costo_hora_snapshot numeric(14,2) not null,
  subtotal_snapshot numeric(14,2) not null,
  line_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint custom_project_labor_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint custom_project_labor_project_id_fkey
    foreign key (custom_project_id) references public.custom_projects(id) on delete cascade,
  constraint custom_project_labor_non_negative_chk
    check (horas >= 0 and costo_hora_snapshot >= 0 and subtotal_snapshot >= 0)
);

create index if not exists idx_custom_project_labor_project on public.custom_project_labor (custom_project_id, line_order);

create table if not exists public.ecommerce_product_materials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  ecommerce_product_id uuid not null,
  material_id uuid,
  material_codigo_snapshot text,
  material_nombre_snapshot text not null,
  unidad_snapshot text,
  consumo_unit numeric(14,3) not null,
  costo_unitario_snapshot numeric(14,2) not null,
  subtotal_snapshot numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint ecommerce_product_materials_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint ecommerce_product_materials_product_id_fkey
    foreign key (ecommerce_product_id) references public.ecommerce_products(id) on delete cascade,
  constraint ecommerce_product_materials_material_id_fkey
    foreign key (material_id) references public.materials(id) on delete set null,
  constraint ecommerce_product_materials_non_negative_chk
    check (consumo_unit >= 0 and costo_unitario_snapshot >= 0 and subtotal_snapshot >= 0)
);

create index if not exists idx_ecommerce_product_materials_product on public.ecommerce_product_materials (ecommerce_product_id);

create table if not exists public.ecommerce_product_processes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  ecommerce_product_id uuid not null,
  proceso_key text not null,
  proceso_nombre text not null,
  horas_unit numeric(12,3) not null default 0,
  costo_hora_snapshot numeric(14,2) not null default 0,
  subtotal_snapshot numeric(14,2) not null default 0,
  line_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint ecommerce_product_processes_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint ecommerce_product_processes_product_id_fkey
    foreign key (ecommerce_product_id) references public.ecommerce_products(id) on delete cascade,
  constraint ecommerce_product_processes_non_negative_chk
    check (horas_unit >= 0 and costo_hora_snapshot >= 0 and subtotal_snapshot >= 0)
);

create index if not exists idx_ecommerce_product_processes_product on public.ecommerce_product_processes (ecommerce_product_id, line_order);

create table if not exists public.cut_job_parts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  cut_job_id uuid not null,
  pieza text not null,
  cantidad integer not null,
  largo_mm numeric(12,3) not null,
  ancho_mm numeric(12,3) not null,
  material_id uuid,
  espesor_mm numeric(10,3),
  rotacion_permitida boolean not null default true,
  veta_obligatoria boolean not null default false,
  canto text,
  observacion text,
  bloqueada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint cut_job_parts_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint cut_job_parts_cut_job_id_fkey
    foreign key (cut_job_id) references public.cut_jobs(id) on delete cascade,
  constraint cut_job_parts_material_id_fkey
    foreign key (material_id) references public.materials(id) on delete set null,
  constraint cut_job_parts_positive_dims_chk
    check (cantidad > 0 and largo_mm > 0 and ancho_mm > 0)
);

create index if not exists idx_cut_job_parts_job on public.cut_job_parts (cut_job_id);
create index if not exists idx_cut_job_parts_material on public.cut_job_parts (material_id);

create table if not exists public.cut_job_layouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  cut_job_id uuid not null,
  iteration integer not null,
  board_index integer not null,
  board_label text,
  material_id uuid,
  espesor_mm numeric(10,3),
  largo_placa_mm numeric(12,3) not null,
  ancho_placa_mm numeric(12,3) not null,
  area_util_mm2 numeric(18,3) not null default 0,
  area_usada_mm2 numeric(18,3) not null default 0,
  area_desperdicio_mm2 numeric(18,3) not null default 0,
  aprovechamiento_pct numeric(8,4) not null default 0,
  costo_placa_snapshot numeric(14,2) not null default 0,
  kerf_mm numeric(10,3) not null default 0,
  margen_perimetral_mm numeric(10,3) not null default 0,
  placements_json jsonb not null default '[]'::jsonb,
  offcuts_json jsonb not null default '[]'::jsonb,
  svg_layout text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint cut_job_layouts_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint cut_job_layouts_cut_job_id_fkey
    foreign key (cut_job_id) references public.cut_jobs(id) on delete cascade,
  constraint cut_job_layouts_material_id_fkey
    foreign key (material_id) references public.materials(id) on delete set null,
  constraint cut_job_layouts_unique_board unique (cut_job_id, iteration, board_index)
);

create index if not exists idx_cut_job_layouts_job_iteration on public.cut_job_layouts (cut_job_id, iteration);
create index if not exists idx_cut_job_layouts_placements_gin on public.cut_job_layouts using gin (placements_json);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  budget_id uuid not null,
  line_order integer not null default 0,
  concepto text not null,
  descripcion text not null,
  cantidad numeric(14,3) not null default 1,
  precio_unitario_snapshot numeric(14,2) not null default 0,
  descuento_pct_snapshot numeric(8,4) not null default 0,
  impuestos_pct_snapshot numeric(8,4) not null default 0,
  subtotal_snapshot numeric(14,2) not null default 0,
  total_snapshot numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint budget_items_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint budget_items_budget_id_fkey
    foreign key (budget_id) references public.budgets(id) on delete cascade,
  constraint budget_items_concepto_chk
    check (concepto in ('fabricacion', 'instalacion', 'flete', 'descuento', 'otro'))
);

create index if not exists idx_budget_items_budget on public.budget_items (budget_id, line_order);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  bucket text not null default 'attachments',
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint attachments_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint attachments_size_non_negative_chk
    check (size_bytes is null or size_bytes >= 0),
  constraint attachments_unique_path unique (profile_id, entity_type, entity_id, file_path)
);

create index if not exists idx_attachments_entity on public.attachments (profile_id, entity_type, entity_id);
create index if not exists idx_attachments_deleted_at on public.attachments (deleted_at);

-- Late FKs for tables created before normalized targets existed.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'budgets_profile_id_fkey') then
    alter table public.budgets
      add constraint budgets_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_client_id_fkey') then
    alter table public.budgets
      add constraint budgets_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_custom_project_id_fkey') then
    alter table public.budgets
      add constraint budgets_custom_project_id_fkey
      foreign key (custom_project_id) references public.custom_projects(id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_ecommerce_product_id_fkey') then
    alter table public.budgets
      add constraint budgets_ecommerce_product_id_fkey
      foreign key (ecommerce_product_id) references public.ecommerce_products(id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_board_profile_id_fkey') then
    alter table public.jobs_board
      add constraint jobs_board_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_board_client_id_fkey') then
    alter table public.jobs_board
      add constraint jobs_board_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_board_custom_project_id_fkey') then
    alter table public.jobs_board
      add constraint jobs_board_custom_project_id_fkey
      foreign key (custom_project_id) references public.custom_projects(id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_board_budget_id_fkey') then
    alter table public.jobs_board
      add constraint jobs_board_budget_id_fkey
      foreign key (budget_id) references public.budgets(id) on delete set null not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'budgets_single_source_chk') then
    alter table public.budgets
      add constraint budgets_single_source_chk
      check (num_nonnulls(custom_project_id, ecommerce_product_id) <= 1) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'budgets_totals_non_negative_chk') then
    alter table public.budgets
      add constraint budgets_totals_non_negative_chk
      check (
        subtotal_snapshot >= 0 and
        descuento_snapshot >= 0 and
        impuestos_snapshot >= 0 and
        total_snapshot >= 0 and
        sena_snapshot >= 0 and
        saldo_snapshot >= 0
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchases_source_type_chk') then
    alter table public.purchases
      add constraint purchases_source_type_chk
      check (source_type in ('manual', 'custom_project', 'cut_job', 'budget')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchases_status_chk') then
    alter table public.purchases
      add constraint purchases_status_chk
      check (status in ('draft', 'ordered', 'partial', 'received', 'cancelled')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'purchase_items_status_chk') then
    alter table public.purchase_items
      add constraint purchase_items_status_chk
      check (estado in ('pending', 'partial', 'received', 'cancelled')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_board_status_chk') then
    alter table public.jobs_board
      add constraint jobs_board_status_chk
      check (estado in ('por_cotizar', 'presupuestado', 'aprobado', 'en_produccion', 'instalado', 'entregado', 'cobrado')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_board_progress_chk') then
    alter table public.jobs_board
      add constraint jobs_board_progress_chk
      check (avance_pct >= 0 and avance_pct <= 100) not valid;
  end if;
end $$;

-- =========================================================
-- Legacy data migration for renamed tables
-- =========================================================

-- material_cost_history -> material_price_history
do $$
begin
  if to_regclass('public.material_cost_history') is not null then
    insert into public.material_price_history (
      id, profile_id, material_id, price_old, price_new, effective_from, created_at, updated_at, created_by, updated_by
    )
    select
      mch.id,
      m.profile_id,
      mch.material_id,
      mch.costo_anterior,
      mch.costo_nuevo,
      coalesce(mch.changed_at, now()),
      coalesce(mch.changed_at, now()),
      coalesce(mch.changed_at, now()),
      m.profile_id,
      m.profile_id
    from public.material_cost_history mch
    join public.materials m on m.id = mch.material_id
    on conflict (id) do nothing;
  end if;
end $$;

-- projects_custom -> custom_projects
do $$
begin
  if to_regclass('public.projects_custom') is not null then
    insert into public.custom_projects (
      id, profile_id, client_id, nombre_proyecto, fecha, tipo_mueble,
      ancho, alto, profundidad, cantidad, descuento_pct,
      subtotal_materiales, horas_totales, costo_mano_obra, costo_directo,
      costo_total, precio_sugerido, utilidad_estimada, status,
      created_at, updated_at, created_by, updated_by
    )
    select
      p.id,
      coalesce(p.user_id, auth.uid()),
      p.client_id,
      p.nombre_proyecto,
      p.fecha,
      p.tipo_mueble,
      p.ancho,
      p.alto,
      p.profundidad,
      p.cantidad,
      p.descuento_pct,
      p.subtotal_materiales,
      p.horas_totales,
      p.costo_mano_obra,
      p.costo_directo,
      p.costo_total,
      p.precio_sugerido,
      p.utilidad_estimada,
      'draft',
      coalesce(p.created_at, now()),
      coalesce(p.updated_at, now()),
      coalesce(p.user_id, auth.uid()),
      coalesce(p.user_id, auth.uid())
    from public.projects_custom p
    on conflict (id) do nothing;
  end if;
end $$;

-- project_materials -> custom_project_materials
do $$
begin
  if to_regclass('public.project_materials') is not null then
    insert into public.custom_project_materials (
      id, profile_id, custom_project_id, material_id,
      material_codigo_snapshot, material_nombre_snapshot, unidad_snapshot, espesor_mm_snapshot,
      consumo, costo_unitario_snapshot, subtotal_snapshot,
      created_by, updated_by
    )
    select
      pm.id,
      cp.profile_id,
      pm.project_id,
      pm.material_id,
      m.codigo,
      coalesce(m.nombre, pm.material_id::text),
      m.unidad,
      m.espesor_mm,
      pm.consumo,
      pm.costo_unitario_snapshot,
      pm.subtotal,
      cp.profile_id,
      cp.profile_id
    from public.project_materials pm
    join public.custom_projects cp on cp.id = pm.project_id
    left join public.materials m on m.id = pm.material_id
    on conflict (id) do nothing;
  end if;
end $$;

-- project_labor -> custom_project_labor
do $$
begin
  if to_regclass('public.project_labor') is not null then
    insert into public.custom_project_labor (
      id, profile_id, custom_project_id,
      proceso_key, proceso_nombre, horas, costo_hora_snapshot, subtotal_snapshot,
      created_by, updated_by
    )
    select
      pl.id,
      cp.profile_id,
      pl.project_id,
      pl.proceso,
      pl.proceso,
      pl.horas,
      coalesce(s.costo_hora_taller, 0),
      round((pl.horas * coalesce(s.costo_hora_taller, 0))::numeric, 2),
      cp.profile_id,
      cp.profile_id
    from public.project_labor pl
    join public.custom_projects cp on cp.id = pl.project_id
    left join public.settings s on s.profile_id = cp.profile_id and s.is_active = true and s.deleted_at is null
    on conflict (id) do nothing;
  end if;
end $$;

-- product_materials -> ecommerce_product_materials
do $$
begin
  if to_regclass('public.product_materials') is not null then
    insert into public.ecommerce_product_materials (
      id, profile_id, ecommerce_product_id, material_id,
      material_codigo_snapshot, material_nombre_snapshot, unidad_snapshot,
      consumo_unit, costo_unitario_snapshot, subtotal_snapshot,
      created_by, updated_by
    )
    select
      pm.id,
      ep.profile_id,
      pm.product_id,
      pm.material_id,
      m.codigo,
      coalesce(m.nombre, pm.material_id::text),
      m.unidad,
      pm.consumo_unit,
      pm.costo_unitario_snapshot,
      pm.subtotal_unit,
      ep.profile_id,
      ep.profile_id
    from public.product_materials pm
    join public.ecommerce_products ep on ep.id = pm.product_id
    left join public.materials m on m.id = pm.material_id
    on conflict (id) do nothing;
  end if;
end $$;

insert into public.ecommerce_product_processes (
  id, profile_id, ecommerce_product_id, proceso_key, proceso_nombre,
  horas_unit, costo_hora_snapshot, subtotal_snapshot, line_order, created_by, updated_by
)
select
  gen_random_uuid(),
  ep.profile_id,
  ep.id,
  'produccion',
  'Producción',
  coalesce(ep.horas_proceso_unit, 0),
  coalesce(s.costo_hora_taller, 0),
  round((coalesce(ep.horas_proceso_unit, 0) * coalesce(s.costo_hora_taller, 0))::numeric, 2),
  1,
  ep.profile_id,
  ep.profile_id
from public.ecommerce_products ep
left join public.settings s on s.profile_id = ep.profile_id and s.is_active = true and s.deleted_at is null
where not exists (
  select 1
  from public.ecommerce_product_processes epp
  where epp.ecommerce_product_id = ep.id
);

-- cut_parts -> cut_job_parts
do $$
begin
  if to_regclass('public.cut_parts') is not null then
    insert into public.cut_job_parts (
      id, profile_id, cut_job_id, pieza, cantidad, largo_mm, ancho_mm, material_id, espesor_mm,
      rotacion_permitida, veta_obligatoria, canto, observacion, bloqueada,
      created_by, updated_by
    )
    select
      p.id,
      j.profile_id,
      p.cut_job_id,
      p.pieza,
      p.cantidad,
      p.largo,
      p.ancho,
      p.material_id,
      p.espesor,
      p.rotacion_permitida,
      p.veta_obligatoria,
      p.canto,
      p.observacion,
      p.bloqueada,
      j.profile_id,
      j.profile_id
    from public.cut_parts p
    join public.cut_jobs j on j.id = p.cut_job_id
    on conflict (id) do nothing;
  end if;
end $$;

-- cut_layouts -> cut_job_layouts (one row per board)
do $$
begin
  if to_regclass('public.cut_layouts') is not null then
    insert into public.cut_job_layouts (
      id, profile_id, cut_job_id, iteration, board_index, board_label, material_id, espesor_mm,
      largo_placa_mm, ancho_placa_mm, area_util_mm2, area_usada_mm2, area_desperdicio_mm2,
      aprovechamiento_pct, costo_placa_snapshot, kerf_mm, margen_perimetral_mm,
      placements_json, offcuts_json, created_at, updated_at, created_by, updated_by
    )
    select
      gen_random_uuid(),
      j.profile_id,
      cl.cut_job_id,
      cl.iteration,
      coalesce((b.board ->> 'boardIndex')::int, b.ord::int),
      concat('Placa ', coalesce((b.board ->> 'boardIndex')::int, b.ord::int)),
      nullif((b.board ->> 'materialId'), '')::uuid,
      nullif((b.board ->> 'espesor'), '')::numeric,
      coalesce((b.board ->> 'width')::numeric, j.largo_placa_mm, j.largo_placa),
      coalesce((b.board ->> 'height')::numeric, j.ancho_placa_mm, j.ancho_placa),
      coalesce(
        (coalesce((b.board ->> 'width')::numeric, j.largo_placa_mm, j.largo_placa) *
         coalesce((b.board ->> 'height')::numeric, j.ancho_placa_mm, j.ancho_placa)),
        0
      ),
      coalesce((b.board ->> 'usedArea')::numeric, 0),
      coalesce((b.board ->> 'wasteArea')::numeric, 0),
      case
        when (coalesce((b.board ->> 'usedArea')::numeric, 0) + coalesce((b.board ->> 'wasteArea')::numeric, 0)) > 0
          then round(
            (
              coalesce((b.board ->> 'usedArea')::numeric, 0) /
              (coalesce((b.board ->> 'usedArea')::numeric, 0) + coalesce((b.board ->> 'wasteArea')::numeric, 0))
            ) * 100, 4
          )
        else 0
      end,
      case
        when cl.boards_needed > 0 then round((cl.total_board_cost / cl.boards_needed)::numeric, 2)
        else 0
      end,
      coalesce(j.kerf_mm, j.kerf, 0),
      coalesce(j.margen_perimetral_mm, j.margen_perimetral, 0),
      coalesce(b.board -> 'placements', '[]'::jsonb),
      '[]'::jsonb,
      coalesce(cl.created_at, now()),
      coalesce(cl.created_at, now()),
      j.profile_id,
      j.profile_id
    from public.cut_layouts cl
    join public.cut_jobs j on j.id = cl.cut_job_id
    cross join lateral jsonb_array_elements(coalesce(cl.layouts, '[]'::jsonb)) with ordinality as b(board, ord)
    on conflict (cut_job_id, iteration, board_index) do nothing;
  end if;
end $$;

-- budget items from legacy JSON "lineas"
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'budgets' and column_name = 'lineas'
  ) then
    insert into public.budget_items (
      id, profile_id, budget_id, line_order, concepto, descripcion, cantidad, precio_unitario_snapshot,
      subtotal_snapshot, total_snapshot, created_by, updated_by
    )
    select
      gen_random_uuid(),
      b.profile_id,
      b.id,
      l.ord::int,
      case lower(coalesce(l.item ->> 'concepto', 'otro'))
        when 'fabricacion' then 'fabricacion'
        when 'instalacion' then 'instalacion'
        when 'flete' then 'flete'
        when 'descuento' then 'descuento'
        else 'otro'
      end,
      coalesce(l.item ->> 'descripcion', 'Ítem'),
      1,
      coalesce((l.item ->> 'monto')::numeric, 0),
      coalesce((l.item ->> 'monto')::numeric, 0),
      coalesce((l.item ->> 'monto')::numeric, 0),
      b.profile_id,
      b.profile_id
    from public.budgets b
    cross join lateral jsonb_array_elements(coalesce(b.lineas, '[]'::jsonb)) with ordinality as l(item, ord)
    where not exists (
      select 1 from public.budget_items bi where bi.budget_id = b.id
    );
  end if;
end $$;

-- =========================================================
-- Triggers
-- =========================================================

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_profiles_updated_at') then
    create trigger trg_profiles_updated_at
      before update on public.profiles
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_settings_updated_at') then
    create trigger trg_settings_updated_at
      before update on public.settings
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_settings_recompute_cost') then
    create trigger trg_settings_recompute_cost
      before insert or update on public.settings
      for each row execute function public.fn_recompute_settings_cost_per_hour();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_clients_updated_at') then
    create trigger trg_clients_updated_at
      before update on public.clients
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_suppliers_updated_at') then
    create trigger trg_suppliers_updated_at
      before update on public.suppliers
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_materials_updated_at') then
    create trigger trg_materials_updated_at
      before update on public.materials
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_materials_recompute_area') then
    create trigger trg_materials_recompute_area
      before insert or update on public.materials
      for each row execute function public.fn_recompute_material_area();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_material_price_history_updated_at') then
    create trigger trg_material_price_history_updated_at
      before update on public.material_price_history
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_custom_projects_updated_at') then
    create trigger trg_custom_projects_updated_at
      before update on public.custom_projects
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_custom_project_materials_updated_at') then
    create trigger trg_custom_project_materials_updated_at
      before update on public.custom_project_materials
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_custom_project_labor_updated_at') then
    create trigger trg_custom_project_labor_updated_at
      before update on public.custom_project_labor
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_ecommerce_products_updated_at') then
    create trigger trg_ecommerce_products_updated_at
      before update on public.ecommerce_products
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_ecommerce_product_materials_updated_at') then
    create trigger trg_ecommerce_product_materials_updated_at
      before update on public.ecommerce_product_materials
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_ecommerce_product_processes_updated_at') then
    create trigger trg_ecommerce_product_processes_updated_at
      before update on public.ecommerce_product_processes
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_cut_jobs_updated_at') then
    create trigger trg_cut_jobs_updated_at
      before update on public.cut_jobs
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_cut_job_parts_updated_at') then
    create trigger trg_cut_job_parts_updated_at
      before update on public.cut_job_parts
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_cut_job_layouts_updated_at') then
    create trigger trg_cut_job_layouts_updated_at
      before update on public.cut_job_layouts
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_purchases_updated_at') then
    create trigger trg_purchases_updated_at
      before update on public.purchases
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_purchase_items_updated_at') then
    create trigger trg_purchase_items_updated_at
      before update on public.purchase_items
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_budgets_updated_at') then
    create trigger trg_budgets_updated_at
      before update on public.budgets
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_budget_items_updated_at') then
    create trigger trg_budget_items_updated_at
      before update on public.budget_items
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_jobs_board_updated_at') then
    create trigger trg_jobs_board_updated_at
      before update on public.jobs_board
      for each row execute function public.fn_set_updated_at_and_by();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_attachments_updated_at') then
    create trigger trg_attachments_updated_at
      before update on public.attachments
      for each row execute function public.fn_set_updated_at_and_by();
  end if;
end $$;

-- =========================================================
-- Legacy compatibility views (created only if names are free)
-- =========================================================

do $$
begin
  if to_regclass('public.users') is null then
    execute $sql$
      create view public.users as
      select id, full_name, email, created_at
      from public.profiles
      where deleted_at is null
    $sql$;
  end if;

  if to_regclass('public.projects_custom') is null then
    execute $sql$
      create view public.projects_custom as
      select
        id,
        profile_id as user_id,
        client_id,
        nombre_proyecto,
        fecha,
        tipo_mueble,
        ancho,
        alto,
        profundidad,
        cantidad,
        descuento_pct,
        subtotal_materiales,
        horas_totales,
        costo_mano_obra,
        costo_directo,
        costo_total,
        precio_sugerido,
        utilidad_estimada,
        created_at,
        updated_at
      from public.custom_projects
      where deleted_at is null
    $sql$;
  end if;

  if to_regclass('public.project_materials') is null then
    execute $sql$
      create view public.project_materials as
      select
        id,
        custom_project_id as project_id,
        material_id,
        consumo,
        costo_unitario_snapshot,
        subtotal_snapshot as subtotal
      from public.custom_project_materials
      where deleted_at is null
    $sql$;
  end if;

  if to_regclass('public.project_labor') is null then
    execute $sql$
      create view public.project_labor as
      select
        id,
        custom_project_id as project_id,
        proceso_key as proceso,
        horas
      from public.custom_project_labor
    $sql$;
  end if;

  if to_regclass('public.product_materials') is null then
    execute $sql$
      create view public.product_materials as
      select
        id,
        ecommerce_product_id as product_id,
        material_id,
        consumo_unit,
        costo_unitario_snapshot,
        subtotal_snapshot as subtotal_unit
      from public.ecommerce_product_materials
    $sql$;
  end if;

  if to_regclass('public.cut_parts') is null then
    execute $sql$
      create view public.cut_parts as
      select
        id,
        cut_job_id,
        pieza,
        cantidad,
        largo_mm as largo,
        ancho_mm as ancho,
        material_id,
        espesor_mm as espesor,
        rotacion_permitida,
        veta_obligatoria,
        canto,
        observacion,
        bloqueada
      from public.cut_job_parts
      where deleted_at is null
    $sql$;
  end if;

  if to_regclass('public.cut_layouts') is null then
    execute $sql$
      create view public.cut_layouts as
      select
        gen_random_uuid() as id,
        cut_job_id,
        iteration,
        max(aprovechamiento_pct) as utilized_pct,
        max(100 - aprovechamiento_pct) as waste_pct,
        count(*)::int as boards_needed,
        sum(costo_placa_snapshot) as total_board_cost,
        jsonb_agg(
          jsonb_build_object(
            'boardIndex', board_index,
            'width', largo_placa_mm,
            'height', ancho_placa_mm,
            'materialId', material_id,
            'espesor', espesor_mm,
            'placements', placements_json,
            'usedArea', area_usada_mm2,
            'wasteArea', area_desperdicio_mm2
          )
        ) as layouts,
        min(created_at) as created_at
      from public.cut_job_layouts
      group by cut_job_id, iteration
    $sql$;
  end if;

  if to_regclass('public.material_cost_history') is null then
    execute $sql$
      create view public.material_cost_history as
      select
        id,
        material_id,
        price_old as costo_anterior,
        price_new as costo_nuevo,
        effective_from as changed_at
      from public.material_price_history
    $sql$;
  end if;
end $$;

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.clients enable row level security;
alter table public.suppliers enable row level security;
alter table public.materials enable row level security;
alter table public.material_price_history enable row level security;
alter table public.custom_projects enable row level security;
alter table public.custom_project_materials enable row level security;
alter table public.custom_project_labor enable row level security;
alter table public.ecommerce_products enable row level security;
alter table public.ecommerce_product_materials enable row level security;
alter table public.ecommerce_product_processes enable row level security;
alter table public.cut_jobs enable row level security;
alter table public.cut_job_parts enable row level security;
alter table public.cut_job_layouts enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;
alter table public.jobs_board enable row level security;
alter table public.attachments enable row level security;

drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all
  on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists settings_owner_all on public.settings;
create policy settings_owner_all on public.settings
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists clients_owner_all on public.clients;
create policy clients_owner_all on public.clients
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists suppliers_owner_all on public.suppliers;
create policy suppliers_owner_all on public.suppliers
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists materials_owner_all on public.materials;
create policy materials_owner_all on public.materials
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists material_price_history_owner_all on public.material_price_history;
create policy material_price_history_owner_all on public.material_price_history
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists custom_projects_owner_all on public.custom_projects;
create policy custom_projects_owner_all on public.custom_projects
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists custom_project_materials_owner_all on public.custom_project_materials;
create policy custom_project_materials_owner_all on public.custom_project_materials
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists custom_project_labor_owner_all on public.custom_project_labor;
create policy custom_project_labor_owner_all on public.custom_project_labor
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists ecommerce_products_owner_all on public.ecommerce_products;
create policy ecommerce_products_owner_all on public.ecommerce_products
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists ecommerce_product_materials_owner_all on public.ecommerce_product_materials;
create policy ecommerce_product_materials_owner_all on public.ecommerce_product_materials
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists ecommerce_product_processes_owner_all on public.ecommerce_product_processes;
create policy ecommerce_product_processes_owner_all on public.ecommerce_product_processes
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists cut_jobs_owner_all on public.cut_jobs;
create policy cut_jobs_owner_all on public.cut_jobs
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists cut_job_parts_owner_all on public.cut_job_parts;
create policy cut_job_parts_owner_all on public.cut_job_parts
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists cut_job_layouts_owner_all on public.cut_job_layouts;
create policy cut_job_layouts_owner_all on public.cut_job_layouts
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists purchases_owner_all on public.purchases;
create policy purchases_owner_all on public.purchases
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists purchase_items_owner_all on public.purchase_items;
create policy purchase_items_owner_all on public.purchase_items
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists budgets_owner_all on public.budgets;
create policy budgets_owner_all on public.budgets
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists budget_items_owner_all on public.budget_items;
create policy budget_items_owner_all on public.budget_items
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists jobs_board_owner_all on public.jobs_board;
create policy jobs_board_owner_all on public.jobs_board
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists attachments_owner_all on public.attachments;
create policy attachments_owner_all on public.attachments
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

commit;
