
# Spec: QR Router Backend

## Cloudflare Workers + Chanfana

Edge. Stateless. D1 (SQLite). JWT propio. Chanfana documenta solo.

---

## 1. Arquitectura

```text
[Comprador]
 │ GET /router/{slug}/{amount}
 ▼
[Worker] ── Chanfana + Zod
 ├── [KV] rate limit (30 req/min/IP)
 └── [D1 SQLite] datos
```

---

## 2. Auth

JWT firmado con `WORKER_SECRET` (env var). Web Crypto nativo Workers. Sin Supabase.

- Signup → usuario en D1 → devolver JWT
- Requests protegidos → `Authorization: Bearer <token>`
- Middleware verifica JWT y adjunta `user_id` al contexto

---

## 3. Tablas (D1 = SQLite - tipos SQLite, no Postgres)

### `users`

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    company_name TEXT,
    slug TEXT UNIQUE,
    is_fully_registered INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_users_slug ON users(slug);
```

### `qrs`

```sql
CREATE TABLE qrs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    qr_string TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    bank TEXT,
    is_fallback INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_unique_user_amount ON qrs (user_id, amount) WHERE is_fallback = 0;
CREATE UNIQUE INDEX idx_unique_user_fallback ON qrs (user_id) WHERE is_fallback = 1;
```

IDs: `crypto.randomUUID()` en código (Workers nativo).

---

## 4. Endpoints

### Auth (público)

- `POST /auth/signup` - `{email, password}` → crear usuario → `{token}`
- `POST /auth/login` - `{email, password}` → `{token}`

### Onboarding (JWT requerido)

- `POST /api/company` - `{company_name, slug}` → actualizar usuario. Slug ya tomado → 409.
- `POST /api/qrs/fallback` - `{qr_string, expiration_date, bank}` - `expiration_date` debe ser > 11 meses desde hoy.

### Admin (JWT + `company_name == 'admin'`)

- `POST /api/approve` - `{user_id}` → `is_fully_registered = 1`

### QRs (JWT + `is_fully_registered == 1`)

- `POST /api/qrs` - `{amount, qr_string, expiration_date, bank}` - si existe QR con mismo monto → reemplazar (UPDATE). Si no → INSERT.

### Público

- `GET /router/{slug}/{amount}` - sin auth. Rate limit por IP via KV.

---

## 5. Algoritmo Router

```
1. Buscar user por slug → 404 si no existe o !is_fully_registered
2. Buscar QR exacto: user_id + amount + is_fallback=0
3. QR existe y expiration_date > now → devolver qr_string
4. QR muerto o no existe → buscar fallback (is_fallback=1)
5. Devolver fallback + ctx.waitUntil(notificar al dueño)
6. Sin fallback → 404
```

Alerta al dueño: `waitUntil` → fetch a webhook o email (simple, no bloquea respuesta).

---

## 6. Cron Trigger

Lunes 00:00 UTC (`0 0 * * 1`).

```
- DELETE qrs WHERE is_fallback=0 AND expiration_date < now - 30 días
- DELETE users WHERE is_fully_registered=0 AND created_at < now - 60 días
```

---

## 7. Rate Limiting (KV)

Router público: clave `rl:{ip}`, TTL 60s, valor = contador.
Si contador > 30 → 429.

---

## 8. Bindings (wrangler.jsonc)

| Binding | Tipo | Para qué |
|---------|------|----------|
| `DB` | D1 | todos los datos |
| `KV` | KV | rate limit router |

Secret: `WORKER_SECRET` → `wrangler secret put WORKER_SECRET`.
