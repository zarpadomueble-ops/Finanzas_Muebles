# Carpi SaaS - Arquitectura Base

Base escalable para una aplicación SaaS de carpintería industrial con Next.js App Router.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Supabase
- React Hook Form + Zod
- TanStack Table
- Recharts

## Estructura

```txt
src/
  app/
    (app)/
      dashboard/
      clientes/
      materiales/
      parametros/
      proyectos/
      ecommerce/
      corte/
      compras/
      presupuestos/
      obras/
      rentabilidad/
      configuracion/
    api/
    layout.tsx
    page.tsx

  components/
    ui/
    layout/
    shared/
    charts/
    tables/
    forms/
    feedback/

  features/
    auth/
    dashboard/
    clients/
    materials/
    settings/
    projects/
    ecommerce/
    cutting/
    purchases/
    budgets/
    jobs/
    profitability/

  lib/
    supabase/
    utils/
    format/
    constants/
    guards/

  domain/
    costing/
    cutting/
    pricing/
    purchases/
    budgets/
    profitability/

  services/
    clients/
    materials/
    settings/
    projects/
    ecommerce/
    cutting/
    purchases/
    budgets/
    dashboard/

  hooks/
  types/
  schemas/
  store/
  styles/
```

## Convenciones

- Cada `feature` tiene `components`, `schemas`, `types`, `services` y `actions`.
- La lógica de cálculo vive en `domain/*`.
- El acceso a datos vive en `services/*`.
- `app/(app)` contiene rutas de producto protegibles/multiusuario.
- Rutas legacy quedaron con redirect para compatibilidad.

## Ejecutar

```bash
npm install
npm run dev
```

## Variables de entorno

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Base de datos (Supabase/PostgreSQL)

- Migración principal: `database/migrations/20260311_carpi_industrial_schema.sql`
- Esquema canónico (alias): `database/supabase-schema.sql`
- Seed inicial: `database/seed.sql`
- Notas de diseño: `database/SCHEMA_NOTES.md`
- Deploy con CLI: `supabase/README.md`
- Migraciones para `supabase db push`: `supabase/migrations/*`
- Seed solo para staging: `supabase/seed.staging.sql`

### Tipos TypeScript compatibles con Supabase

- `src/types/supabase-database.ts` define `Database`, `PublicTableName`, `TableRow`, `TableInsert`, `TableUpdate`.
- Los clientes Supabase en `src/services/supabase` ya están tipados con ese `Database`.

