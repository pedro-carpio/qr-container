# Frontend MVP Roadmap

## Stack
- **React + Vite** — setup mínimo, HMR rápido
- **TanStack Router** — rutas type-safe, guards declarativos
- **TanStack Query** — cache, revalidación, estado de fetching
- **Zustand** — auth state (tokens en memoria, no localStorage)
- **Zod** — validación de forms (espeja esquemas del backend)
- **shadcn/ui** — componentes accesibles sin overhead

---

## Token Management

Access token: 15 min. Refresh token: 7 días.

- `access_token` solo en memoria (Zustand)
- `refresh_token` en `httpOnly cookie` o memoria si no hay BFF
- Axios interceptor: detecta 401 → llama `POST /auth/refresh` → reintentar request original
- Cola de requests pendientes durante el refresh (evitar race conditions)
- Al cerrar pestaña: limpiar estado en memoria

---

## Flujo de Estados del Usuario

```
No autenticado → /login | /signup
Autenticado, sin company → /onboarding
Autenticado + company → /dashboard
Autenticado + admin (x-internal) → /admin/*
```

TanStack Router: loader por ruta lee el estado del usuario y redirige. Sin estado en URL.

---

## Rutas

| Ruta | Descripción |
|---|---|
| `/entrar` | Email + password |
| `/registrarse` | Email + password (min 8) |
| `/iniciar` | `company_name` + `slug` (`^[a-z0-9-]+$`) |
| `/pendind` | Pantalla estática: no haz realizado tu ultimo pago |
| `/panel` | Lista de QRs paginada |
| `/panel/nuevo` | Crear QR (amount + qr_string + fecha + bank?) |
| `/panel/qr-abierto` | Crear QR fallback (sin amount) |
| `/panel/venciendo` | QRs con vencimiento <30 días |
| `/admin` | Stats globales |
| `/admin/pendientes` | Aprobar usuarios (`POST /api/approve`) |
| `/admin/usuarios` | Lista filtrada por status |
| `/admin/usuarios/:id/qrs` | QRs de un usuario |

---

## Seguridad

- `Authorization: Bearer <token>` en cada request protegido
- Admin: header `x-internal` requerido por el backend — solo exponer rutas `/admin` si el payload JWT o response inicial indica rol admin
- No persistir `access_token` en `localStorage` / `sessionStorage`
- Validar `slug` client-side con la misma regex del backend (`/^[a-z0-9-]+$/`) antes de enviar
- `expiration_date` enviada como ISO 8601 datetime
- Rate limiting en `/router`: el frontend solo consume este endpoint en contexto público (sin auth), manejar 429 con backoff

---

## API Client

```
src/
  api/
    client.ts       # axios instance + interceptors (refresh + retry)
    auth.ts         # signup, login, refresh
    company.ts      # POST /api/company
    qrs.ts          # POST /api/qrs, POST /api/qrs/fallback, GET /api/qrs, GET /api/qrs/expiring
    admin.ts        # todos los endpoints /api/admin + /api/approve
```

Cada módulo exporta funciones tipadas. TanStack Query los envuelve en `useQuery` / `useMutation`.

---

## Orden de Implementación (MVP)

1. **API client** — axios + interceptor de refresh
2. **Auth** — login, signup, logout, persistencia en Zustand
3. **Router + guards** — protección por estado del usuario
4. **Onboarding** — crear company, validación de slug
5. **Dashboard** — lista QRs paginada (`GET /api/qrs`)
6. **Crear QR** — form con validación Zod
7. **Crear fallback** — variante sin amount
8. **Expiring** — tabla de QRs próximos a vencer
9. **Admin** — solo si el usuario tiene acceso; stats → pending → users → user QRs
