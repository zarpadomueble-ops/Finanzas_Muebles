# Supabase CLI

Este directorio deja el esquema listo para `supabase db push` sin mezclar datos demo en produccion.

## Estructura

- `migrations/`: migraciones SQL versionadas para deploy.
- `seed.staging.sql`: datos demo solo para staging o entornos de prueba.
- `config.toml`: configuracion minima para Supabase CLI con seed remoto deshabilitado.

## Primer setup

1. `npm run supabase:version`
2. `npm run supabase:link`
3. Ingresar la database password del proyecto cuando la CLI la pida.
4. `npm run supabase:push`

## Produccion

- Proyecto actual: `iyvibeqrfufabgbamwsr`
- `supabase db push` aplica solo las migraciones de `supabase/migrations`.
- No ejecutes `supabase/seed.staging.sql` en produccion.

## Staging

- Corre primero `npm run supabase:push`.
- Despues ejecuta `supabase/seed.staging.sql` manualmente en el SQL Editor del proyecto de staging.
- Si necesitas usar otro proyecto remoto, volve a correr `npm run supabase:link` con el `project-ref` correcto.

## Nota

Las migraciones en `supabase/migrations` son una copia operativa de `database/migrations` para despliegue con CLI. Si agregas una nueva migracion, mantenelas sincronizadas.
