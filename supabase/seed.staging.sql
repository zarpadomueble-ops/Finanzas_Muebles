-- Seed data aligned with 20260311_carpi_industrial_schema.sql
-- STAGING ONLY.
-- Do not run this file in production.
-- It inserts demo data and uses a fixed profile id.
-- Replace profile id with auth.uid() in real environments if needed.

insert into public.profiles (id, full_name, email)
values ('11111111-1111-1111-1111-111111111111', 'Demo Carpinteria', 'demo@carpi.local')
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

insert into public.settings (
  profile_id,
  horas_productivas_mes,
  costos_fijos_mes,
  desperdicio_melamina_pct,
  margen_medida_pct,
  margen_ecommerce_pct,
  impuestos_pct,
  publicidad_pct,
  comision_cobro_pct,
  embalaje_promedio,
  envio_promedio,
  kerf_sierra_mm,
  margen_perimetral_placa_mm,
  permitir_rotacion_por_defecto,
  veta_obligatoria_por_defecto,
  is_active
)
values (
  '11111111-1111-1111-1111-111111111111',
  176,
  3200000,
  8,
  35,
  28,
  21,
  4,
  3.5,
  8000,
  12000,
  3,
  10,
  true,
  false,
  true
)
on conflict do nothing;

insert into public.clients (id, profile_id, nombre, telefono, email, ciudad, provincia, fecha_alta, saldo_pendiente)
values
('20000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mariana Lopez', '+54 11 6789-1234', 'mariana.lopez@gmail.com', 'CABA', 'Buenos Aires', '2026-01-17', 120000),
('20000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Santiago Perez', '+54 11 5555-9988', 'sperez@yahoo.com', 'La Plata', 'Buenos Aires', '2026-02-04', 0)
on conflict (id) do nothing;

insert into public.suppliers (id, profile_id, nombre, telefono, email, ciudad)
values
('30000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Melaminas Sur', '+54 11 4355-2000', 'ventas@melaminassur.ar', 'CABA'),
('30000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Herrajes Delta', '+54 11 4920-9900', 'pedidos@herrajesdelta.ar', 'Lanus')
on conflict (id) do nothing;

insert into public.materials (
  id,
  profile_id,
  codigo,
  nombre,
  categoria,
  unidad,
  costo_unitario,
  supplier_id,
  marca,
  espesor_mm,
  largo_mm,
  ancho_mm,
  activo,
  favorito,
  tiene_veta
)
values
('40000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PLA-ROBLE-18', 'Melamina Roble 18mm', 'placas', 'm2', 19800, '30000000-0000-0000-0000-000000000001', 'Faplac', 18, 2750, 1830, true, true, true),
('40000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'HER-BIS-35', 'Bisagra cazoleta 35mm', 'herrajes', 'unidad', 3200, '30000000-0000-0000-0000-000000000002', 'Hafele', 0, 0, 0, true, true, false)
on conflict (id) do nothing;

insert into public.material_price_history (
  profile_id,
  material_id,
  price_old,
  price_new,
  change_reason,
  effective_from
)
values
('11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 18800, 19800, 'Ajuste proveedor', now() - interval '20 days'),
('11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000002', 2890, 3200, 'Ajuste herrajes', now() - interval '15 days')
on conflict do nothing;

insert into public.custom_projects (
  id,
  profile_id,
  client_id,
  nombre_proyecto,
  fecha,
  tipo_mueble,
  ancho,
  alto,
  profundidad,
  cantidad,
  subtotal_materiales,
  horas_totales,
  costo_mano_obra,
  costo_directo,
  costo_total,
  precio_sugerido,
  utilidad_estimada,
  status
)
values (
  '50000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  '20000000-0000-0000-0000-000000000001',
  'Cocina Integral Lopez',
  '2026-03-03',
  'Cocina',
  3200,
  2400,
  600,
  1,
  272000,
  34,
  618181.88,
  890181.88,
  1132000,
  1540000,
  408000,
  'quoted'
)
on conflict (id) do nothing;

insert into public.custom_project_materials (
  profile_id,
  custom_project_id,
  material_id,
  material_codigo_snapshot,
  material_nombre_snapshot,
  unidad_snapshot,
  espesor_mm_snapshot,
  consumo,
  costo_unitario_snapshot,
  subtotal_snapshot
)
values
('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'PLA-ROBLE-18', 'Melamina Roble 18mm', 'm2', 18, 9.4, 19800, 186120),
('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'HER-BIS-35', 'Bisagra cazoleta 35mm', 'unidad', 0, 8, 3200, 25600)
on conflict do nothing;

insert into public.custom_project_labor (
  profile_id,
  custom_project_id,
  proceso_key,
  proceso_nombre,
  horas,
  costo_hora_snapshot,
  subtotal_snapshot,
  line_order
)
values
('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000001', 'corte', 'Corte', 9, 18181.82, 163636.38, 1),
('11111111-1111-1111-1111-111111111111', '50000000-0000-0000-0000-000000000001', 'armado', 'Armado', 8, 18181.82, 145454.56, 2)
on conflict do nothing;

insert into public.ecommerce_products (
  id,
  profile_id,
  sku,
  nombre,
  categoria,
  precio_mercado,
  ancho,
  alto,
  profundidad,
  horas_proceso_unit,
  embalaje_unitario,
  envio_unitario,
  costo_materiales_unit,
  costo_mano_obra_unit,
  costo_base_unit,
  costo_con_embalaje,
  costo_total_canal,
  precio_sugerido,
  ganancia_unit,
  status
)
values (
  '60000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'ECO-RACK-120',
  'Rack TV Minimal 120',
  'Living',
  125000,
  1200,
  500,
  400,
  2.5,
  5000,
  7000,
  27620,
  45454.55,
  73074.55,
  86074.55,
  105074.55,
  145937,
  19925.45,
  'active'
)
on conflict (id) do nothing;

insert into public.ecommerce_product_materials (
  profile_id,
  ecommerce_product_id,
  material_id,
  material_codigo_snapshot,
  material_nombre_snapshot,
  unidad_snapshot,
  consumo_unit,
  costo_unitario_snapshot,
  subtotal_snapshot
)
values
('11111111-1111-1111-1111-111111111111', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'PLA-ROBLE-18', 'Melamina Roble 18mm', 'm2', 1.4, 19800, 27720),
('11111111-1111-1111-1111-111111111111', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'HER-BIS-35', 'Bisagra cazoleta 35mm', 'unidad', 2, 3200, 6400)
on conflict do nothing;

insert into public.ecommerce_product_processes (
  profile_id,
  ecommerce_product_id,
  proceso_key,
  proceso_nombre,
  horas_unit,
  costo_hora_snapshot,
  subtotal_snapshot,
  line_order
)
values
('11111111-1111-1111-1111-111111111111', '60000000-0000-0000-0000-000000000001', 'produccion', 'Producción', 2.5, 18181.82, 45454.55, 1)
on conflict do nothing;

insert into public.cut_jobs (
  id,
  profile_id,
  nombre,
  largo_placa_mm,
  ancho_placa_mm,
  kerf_mm,
  margen_perimetral_mm,
  desperdicio_extra_pct,
  allow_rotation_default,
  grain_required_default,
  status
)
values (
  '70000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Corte Cocina Lopez',
  2750,
  1830,
  3,
  10,
  8,
  true,
  false,
  'optimized'
)
on conflict (id) do nothing;

insert into public.cut_job_parts (
  profile_id,
  cut_job_id,
  pieza,
  cantidad,
  largo_mm,
  ancho_mm,
  material_id,
  espesor_mm,
  rotacion_permitida,
  veta_obligatoria,
  canto,
  bloqueada
)
values
('11111111-1111-1111-1111-111111111111', '70000000-0000-0000-0000-000000000001', 'Lateral bajo mesada', 4, 720, 560, '40000000-0000-0000-0000-000000000001', 18, true, false, '2L', false),
('11111111-1111-1111-1111-111111111111', '70000000-0000-0000-0000-000000000001', 'Puerta superior', 6, 710, 390, '40000000-0000-0000-0000-000000000001', 18, false, true, '4L', false)
on conflict do nothing;

insert into public.budgets (
  id,
  profile_id,
  client_id,
  custom_project_id,
  budget_number,
  fecha_emision,
  fecha_validez,
  forma_pago,
  estado,
  subtotal_snapshot,
  total_snapshot,
  sena_snapshot,
  saldo_snapshot,
  costs_snapshot
)
values (
  '80000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'PRES-2026-0001',
  current_date,
  current_date + interval '15 days',
  '50% anticipo + saldo contra entrega',
  'sent',
  1132000,
  1262000,
  631000,
  631000,
  '{"origen":"custom_project"}'::jsonb
)
on conflict (id) do nothing;

insert into public.budget_items (
  profile_id,
  budget_id,
  line_order,
  concepto,
  descripcion,
  cantidad,
  precio_unitario_snapshot,
  subtotal_snapshot,
  total_snapshot
)
values
('11111111-1111-1111-1111-111111111111', '80000000-0000-0000-0000-000000000001', 1, 'fabricacion', 'Fabricación y armado', 1, 1132000, 1132000, 1132000),
('11111111-1111-1111-1111-111111111111', '80000000-0000-0000-0000-000000000001', 2, 'flete', 'Flete e izaje', 1, 130000, 130000, 130000)
on conflict do nothing;

insert into public.purchases (
  id,
  profile_id,
  source_type,
  source_id,
  fecha_emision,
  status,
  total_snapshot
)
values (
  '90000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'custom_project',
  '50000000-0000-0000-0000-000000000001',
  current_date,
  'ordered',
  211720
)
on conflict (id) do nothing;

insert into public.purchase_items (
  profile_id,
  purchase_id,
  material_id,
  descripcion_snapshot,
  cantidad,
  unidad_snapshot,
  costo_unitario_snapshot,
  subtotal_snapshot,
  estado
)
values
('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Melamina Roble 18mm', 9.4, 'm2', 19800, 186120, 'pending'),
('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'Bisagra cazoleta 35mm', 8, 'unidad', 3200, 25600, 'pending')
on conflict do nothing;

insert into public.jobs_board (
  id,
  profile_id,
  custom_project_id,
  budget_id,
  client_id,
  titulo,
  estado,
  monto_snapshot,
  sena_snapshot,
  saldo_snapshot,
  fecha_prometida,
  avance_pct
)
values (
  'a0000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  '50000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Cocina Integral Lopez',
  'en_produccion',
  1262000,
  631000,
  631000,
  current_date + interval '20 days',
  35
)
on conflict (id) do nothing;
