alter table public.ecommerce_products
  add column if not exists unidades_lote integer not null default 1;

alter table public.ecommerce_products
  drop constraint if exists ecommerce_products_unidades_lote_check;

alter table public.ecommerce_products
  add constraint ecommerce_products_unidades_lote_check
  check (unidades_lote > 0);
