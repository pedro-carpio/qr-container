# QR Container

API de enrutamiento QR. Cloudflare Workers + D1. Docs en `/` (Swagger).

## Deploy

```bash
pnpm install

# 1. Crear D1 (copiar id → wrangler.jsonc > d1_databases[0].database_id)
wrangler d1 create d1-qr-container

# 2. Crear KV (copiar id → wrangler.jsonc > kv_namespaces[0].id)
wrangler kv namespace create RATE_LIMIT_KV

# 3. Secret JWT
wrangler secret put WORKER_SECRET

# 4. Deploy (aplica migraciones automáticamente vía predeploy)
pnpm deploy
```

## Dev local

```bash
pnpm dev
```

## Tests

```bash
pnpm test
```
