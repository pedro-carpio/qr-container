# Roadmap MVP — QR Router

## Paso 1 — Limpiar plantilla

- Borrar `src/endpoints/tasks/` y `src/endpoints/dummyEndpoint.ts`
- Borrar `migrations/0001_add_tasks_table.sql`
- Limpiar `src/index.ts` (quitar imports de tasks/dummy)

## Paso 2 — Migrations D1

Crear `migrations/0001_init.sql`:
- Tabla `users`
- Tabla `qrs`
- Índices de `slug`, `user_id+amount`, `user_id+fallback`

## Paso 3 — Helpers base

- `src/lib/jwt.ts` — sign/verify JWT con Web Crypto + `WORKER_SECRET`
- `src/lib/password.ts` — hash/verify password con Web Crypto (SHA-256 + salt)
- `src/middleware/auth.ts` — middleware Hono: leer Bearer → verificar JWT → adjuntar `user_id` al contexto

## Paso 4 — Auth endpoints

- `src/endpoints/auth/signup.ts` — `POST /auth/signup`
- `src/endpoints/auth/login.ts` — `POST /auth/login`
- `src/endpoints/auth/router.ts`

## Paso 5 — Onboarding endpoints

- `src/endpoints/company/set.ts` — `POST /api/company`
- `src/endpoints/qrs/setFallback.ts` — `POST /api/qrs/fallback`

## Paso 6 — Admin endpoint

- `src/endpoints/admin/approve.ts` — `POST /api/approve`

## Paso 7 — QR endpoint

- `src/endpoints/qrs/upsert.ts` — `POST /api/qrs` (upsert por monto)

## Paso 8 — Router público

- `src/endpoints/router/route.ts` — `GET /router/:slug/:amount`
- Lógica: exacto vivo → fallback → `waitUntil(alerta)` → 404
- Rate limit: leer/escribir `RATE_LIMIT_KV` por IP

## Paso 9 — Cron Trigger

- `src/cron/cleanup.ts` — borrar QRs podridos + usuarios vagos
- Registrar en `src/index.ts` como `scheduled` export
- Agregar cron schedule en `wrangler.jsonc`

## Paso 10 — Wiring final

- `src/index.ts` — montar todos los routers, exportar `scheduled`
- `wrangler.jsonc` — agregar binding `RATE_LIMIT_KV` y cron schedule
- `src/types.ts` — extender `Env` con `RATE_LIMIT_KV: KVNamespace` y `WORKER_SECRET: string`
- `worker-configuration.d.ts` — `wrangler types` para regenerar

## Paso 11 — Tests mínimos

- `tests/integration/auth.test.ts` — signup + login
- `tests/integration/router.test.ts` — flujo completo: crear user → company → fallback → qr → GET router

## Estado actual

| Paso | Estado |
|------|--------|
| 1. Limpiar plantilla | pendiente |
| 2. Migrations | pendiente |
| 3. Helpers base | pendiente |
| 4. Auth endpoints | pendiente |
| 5. Onboarding | pendiente |
| 6. Admin | pendiente |
| 7. QR upsert | pendiente |
| 8. Router público | pendiente |
| 9. Cron | pendiente |
| 10. Wiring | pendiente |
| 11. Tests | pendiente |
