# Schema Notes (2026-03-11)

## Decisiones clave

- `profiles` reemplaza la noción legacy de `users` para ownership de filas en dominio de negocio.
- Se agregó `profile_id` + `created_by/updated_by/deleted_by` en tablas de negocio para auditoría.
- Se usa `deleted_at` como soft delete en entidades operativas (clientes, materiales, presupuestos, compras, obras, etc.).
- Los snapshots se separan de costos vivos:
  - `material_price_history` guarda evolución de costo unitario.
  - `custom_project_materials`, `custom_project_labor`, `ecommerce_product_materials`, `ecommerce_product_processes`, `budget_items`, `purchase_items` guardan costo snapshot por línea.
  - `budgets.costs_snapshot/pricing_snapshot/terms_snapshot` conservan contexto histórico.
- Optimización de corte:
  - `cut_job_parts` guarda piezas de entrada.
  - `cut_job_layouts` guarda salida por placa (`board_index`) con piezas en `placements_json`.

## Compatibilidad hacia atrás

- No se eliminan tablas legacy automáticamente.
- Se migra data de tablas legacy a tablas nuevas cuando existen (`projects_custom`, `project_materials`, `project_labor`, `product_materials`, `cut_parts`, `cut_layouts`, `material_cost_history`).
- Si el nombre legacy está libre, se crean `views` de compatibilidad.

## RLS

- RLS habilitado en tablas de negocio.
- Política owner por defecto: `profile_id = auth.uid()`.
- En `profiles`: `id = auth.uid()`.
- Las migraciones/seed deben correrse con rol privilegiado (service role) para evitar bloqueos de políticas.
