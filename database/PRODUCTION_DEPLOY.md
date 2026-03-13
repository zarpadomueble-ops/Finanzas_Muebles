# Deploy a Produccion

Proyecto Supabase actual: `iyvibeqrfufabgbamwsr`

## Si necesitas destrabar produccion ahora mismo

1. Hace backup del proyecto en Supabase.
2. Abri el SQL Editor del proyecto `iyvibeqrfufabgbamwsr`.
3. Ejecuta estos archivos en este orden:
   - `database/migrations/20260311_carpi_industrial_schema.sql`
   - `database/migrations/20260312_ecommerce_unidades_lote.sql`
   - `database/migrations/20260312_cut_job_parts_prioridad.sql`
4. Verifica que existan al menos estas tablas:
   - `profiles`
   - `settings`
   - `clients`
   - `materials`
   - `custom_projects`
   - `budgets`
   - `jobs_board`
   - `purchases`
   - `cut_jobs`
5. Redeploya la app y prueba `dashboard`, `clientes` y `materiales`.

## Flujo recomendado con CLI

1. `npm run supabase:link`
2. Ingresa la database password del proyecto cuando la CLI la pida.
3. `npm run supabase:push`
4. `npm run supabase:migration:list`

## Seed

- No uses `database/seed.sql` en produccion.
- No uses `supabase/seed.staging.sql` en produccion.
- El seed de staging inserta datos demo y usa el profile fijo `11111111-1111-1111-1111-111111111111`.

## Permisos

Estas migraciones crean tablas, extensiones, funciones, triggers, politicas RLS e indices. Tienen que correrse con un rol privilegiado.
