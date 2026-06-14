export const SPA_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QR Panel</title>
  <script type="importmap">
  {
    "imports": {
      "vue":        "https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.prod.js",
      "vue-router": "https://esm.sh/vue-router@4?deps=vue@3",
      "axios":      "https://esm.sh/axios@1"
    }
  }
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:   #0f172a;
      --surf: #1e293b;
      --bd:   #334155;
      --tx:   #f1f5f9;
      --mu:   #94a3b8;
      --ac:   #3b82f6;
      --ac2:  #2563eb;
      --er:   #ef4444;
      --ok:   #22c55e;
      --r:    .5rem;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--tx);
      min-height: 100dvh;
      line-height: 1.5;
    }

    /* ── Layout ─────────────────────────────────────────────────── */
    .page { display: flex; align-items: center; justify-content: center; min-height: 100dvh; padding: 1rem; }
    .card { background: var(--surf); border: 1px solid var(--bd); border-radius: calc(var(--r) * 2); padding: 2rem; width: 100%; max-width: 22rem; }

    /* ── Typography ─────────────────────────────────────────────── */
    h1   { font-size: 1.375rem; font-weight: 700; margin-bottom: .25rem; }
    .sub { color: var(--mu); font-size: .875rem; margin-bottom: 1.75rem; }

    /* ── Form ───────────────────────────────────────────────────── */
    .field + .field { margin-top: .875rem; }
    label { display: block; font-size: .8125rem; font-weight: 500; color: var(--mu); margin-bottom: .375rem; }
    input {
      width: 100%; background: var(--bg); border: 1px solid var(--bd);
      border-radius: var(--r); padding: .5625rem .75rem;
      color: var(--tx); font-size: .875rem; outline: none;
      transition: border-color .15s;
    }
    input:focus              { border-color: var(--ac); }
    input[aria-invalid=true] { border-color: var(--er); }
    .hint                    { font-size: .75rem; margin-top: .25rem; color: var(--mu); }
    .hint.err                { color: var(--er); }
    .hint.ok                 { color: var(--ok); }

    /* ── Buttons ────────────────────────────────────────────────── */
    .btn {
      display: flex; align-items: center; justify-content: center; gap: .5rem;
      width: 100%; padding: .5625rem 1rem; border: 1px solid transparent;
      border-radius: var(--r); font-size: .875rem; font-weight: 600;
      cursor: pointer; transition: background .15s, opacity .15s;
    }
    .btn + .btn, .btn-wrap { margin-top: .75rem; }
    .btn-p { background: var(--ac); color: #fff; border-color: var(--ac); }
    .btn-p:hover:not(:disabled) { background: var(--ac2); }
    .btn-g { background: transparent; color: var(--mu); border-color: var(--bd); }
    .btn-g:hover:not(:disabled) { color: var(--tx); border-color: var(--tx); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Alert ──────────────────────────────────────────────────── */
    .alert {
      background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3);
      color: #fca5a5; border-radius: var(--r); padding: .75rem;
      font-size: .8125rem; margin-bottom: 1rem;
    }

    /* ── Footer link ────────────────────────────────────────────── */
    .foot { text-align: center; margin-top: 1rem; font-size: .8125rem; color: var(--mu); }
    .foot a { color: var(--ac); text-decoration: none; }
    .foot a:hover { text-decoration: underline; }

    /* ── Spinner ────────────────────────────────────────────────── */
    .spin {
      width: .9rem; height: .9rem; flex-shrink: 0;
      border: 2px solid rgba(255,255,255,.25); border-top-color: #fff;
      border-radius: 50%; animation: spin .6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module">
    import { createApp, ref, reactive, computed } from 'vue';
    import { createRouter, createWebHistory }     from 'vue-router';
    import axios                                  from 'axios';

    /* ─────────────────────────────────────────────────────────────
       Auth store
       access_token : memoria (reactive) — se pierde al recargar
       refresh_token: sessionStorage     — se limpia al cerrar pestaña
       hasCompany   : sessionStorage mirror
    ───────────────────────────────────────────────────────────── */
    const auth = reactive({
      access:     null,
      refresh:    sessionStorage.getItem('qr_rt') ?? null,
      hasCompany: sessionStorage.getItem('qr_co') === '1',
    });

    const isAuth = () => !!(auth.access || auth.refresh);

    function setAuth(access, refresh) {
      auth.access = access;
      if (refresh !== undefined) {
        auth.refresh = refresh;
        refresh
          ? sessionStorage.setItem('qr_rt', refresh)
          : sessionStorage.removeItem('qr_rt');
      }
    }

    function setCompany(v) {
      auth.hasCompany = v;
      v ? sessionStorage.setItem('qr_co', '1') : sessionStorage.removeItem('qr_co');
    }

    function signOut() {
      auth.access = null;
      auth.refresh = null;
      auth.hasCompany = false;
      sessionStorage.removeItem('qr_rt');
      sessionStorage.removeItem('qr_co');
    }

    /* ─────────────────────────────────────────────────────────────
       API client — axios + interceptor de refresh
       Las requests 401 concurrentes se encolan detrás de un único
       refresh para evitar race conditions.
    ───────────────────────────────────────────────────────────── */
    const api = axios.create();
    let _refreshing = null;

    api.interceptors.request.use(cfg => {
      if (auth.access) cfg.headers['Authorization'] = 'Bearer ' + auth.access;
      return cfg;
    });

    api.interceptors.response.use(null, async err => {
      const orig = err.config;
      if (err.response?.status === 401 && !orig._retry && auth.refresh) {
        orig._retry = true;
        if (!_refreshing) {
          _refreshing = axios
            .post('/auth/refresh', { refresh_token: auth.refresh })
            .then(r => setAuth(r.data.access_token, undefined))
            .catch(() => { signOut(); router.push('/entrar'); })
            .finally(() => { _refreshing = null; });
        }
        await _refreshing;
        if (auth.access) {
          orig.headers['Authorization'] = 'Bearer ' + auth.access;
          return api(orig);
        }
      }
      return Promise.reject(err);
    });

    /* ─────────────────────────────────────────────────────────────
       Módulos API
    ───────────────────────────────────────────────────────────── */
    const authApi = {
      login:  (email, password) => api.post('/auth/login',  { email, password }),
      signup: (email, password) => api.post('/auth/signup', { email, password }),
    };

    const companyApi = {
      setup: (company_name, slug) => api.post('/api/company', { company_name, slug }),
    };

    /* ─────────────────────────────────────────────────────────────
       Helpers
    ───────────────────────────────────────────────────────────── */
    const SLUG_RE = /^[a-z0-9-]+$/;
    const apiErr  = e => e.response?.data?.errors?.[0]?.message ?? 'Error inesperado';

    /* ─────────────────────────────────────────────────────────────
       Vista: Login  →  /entrar
    ───────────────────────────────────────────────────────────── */
    const LoginView = {
      template: '<div class="page"><div class="card">' +
        '<h1>Iniciar sesión</h1>' +
        '<p class="sub">Accede a tu panel de QRs</p>' +
        '<div v-if="err" class="alert">{{ err }}</div>' +
        '<form @submit.prevent="go">' +
          '<div class="field"><label>Correo electrónico</label>' +
            '<input v-model="email" type="email" autocomplete="email" placeholder="tu@email.com" required /></div>' +
          '<div class="field"><label>Contraseña</label>' +
            '<input v-model="pw" type="password" autocomplete="current-password" required /></div>' +
          '<div class="btn-wrap">' +
            '<button class="btn btn-p" :disabled="busy">' +
              '<span v-if="busy" class="spin"></span><span v-else>Entrar</span>' +
            '</button>' +
          '</div>' +
        '</form>' +
        '<p class="foot"><a href="/registrarse">¿Sin cuenta? Regístrate</a></p>' +
      '</div></div>',
      setup() {
        const email = ref(''), pw = ref(''), err = ref(''), busy = ref(false);
        async function go() {
          err.value = ''; busy.value = true;
          try {
            const { data } = await authApi.login(email.value, pw.value);
            setAuth(data.access_token, data.refresh_token);
            router.push(auth.hasCompany ? '/panel' : '/iniciar');
          } catch (e) { err.value = apiErr(e); }
          finally { busy.value = false; }
        }
        return { email, pw, err, busy, go };
      },
    };

    /* ─────────────────────────────────────────────────────────────
       Vista: Signup  →  /registrarse
    ───────────────────────────────────────────────────────────── */
    const SignupView = {
      template: '<div class="page"><div class="card">' +
        '<h1>Crear cuenta</h1>' +
        '<p class="sub">Empieza a gestionar tus QRs</p>' +
        '<div v-if="err" class="alert">{{ err }}</div>' +
        '<form @submit.prevent="go">' +
          '<div class="field"><label>Correo electrónico</label>' +
            '<input v-model="email" type="email" autocomplete="email" placeholder="tu@email.com" required /></div>' +
          '<div class="field"><label>Contraseña</label>' +
            '<input v-model="pw" type="password" autocomplete="new-password" required />' +
            '<p class="hint">Mínimo 8 caracteres</p></div>' +
          '<div class="btn-wrap">' +
            '<button class="btn btn-p" :disabled="busy">' +
              '<span v-if="busy" class="spin"></span><span v-else>Crear cuenta</span>' +
            '</button>' +
          '</div>' +
        '</form>' +
        '<p class="foot"><a href="/entrar">¿Ya tienes cuenta? Entra</a></p>' +
      '</div></div>',
      setup() {
        const email = ref(''), pw = ref(''), err = ref(''), busy = ref(false);
        async function go() {
          err.value = '';
          if (pw.value.length < 8) { err.value = 'La contraseña debe tener al menos 8 caracteres'; return; }
          busy.value = true;
          try {
            await authApi.signup(email.value, pw.value);
            const { data } = await authApi.login(email.value, pw.value);
            setAuth(data.access_token, data.refresh_token);
            router.push('/iniciar');
          } catch (e) { err.value = apiErr(e); }
          finally { busy.value = false; }
        }
        return { email, pw, err, busy, go };
      },
    };

    /* ─────────────────────────────────────────────────────────────
       Vista: Onboarding  →  /iniciar
    ───────────────────────────────────────────────────────────── */
    const OnboardingView = {
      template: '<div class="page"><div class="card">' +
        '<h1>Tu empresa</h1>' +
        '<p class="sub">Configuración inicial · solo una vez</p>' +
        '<div v-if="err" class="alert">{{ err }}</div>' +
        '<form @submit.prevent="go">' +
          '<div class="field"><label>Nombre de empresa</label>' +
            '<input v-model="name" type="text" placeholder="Mi Empresa S.A." required /></div>' +
          '<div class="field"><label>Identificador público (slug)</label>' +
            '<input v-model="slug" type="text" placeholder="mi-empresa"' +
            ' :aria-invalid="slugErr ? true : undefined" required />' +
            '<p v-if="slugErr" class="hint err">{{ slugErr }}</p>' +
            '<p v-else-if="slug && slugOk" class="hint ok">✓ Formato válido</p>' +
            '<p v-else class="hint">minúsculas, números y guiones</p>' +
          '</div>' +
          '<div class="btn-wrap">' +
            '<button class="btn btn-p" :disabled="busy || !slugOk || !name.trim()">' +
              '<span v-if="busy" class="spin"></span><span v-else>Continuar</span>' +
            '</button>' +
          '</div>' +
        '</form>' +
      '</div></div>',
      setup() {
        const name = ref(''), slug = ref(''), err = ref(''), busy = ref(false);
        const slugOk  = computed(() => SLUG_RE.test(slug.value));
        const slugErr = computed(() =>
          slug.value && !slugOk.value ? 'Solo minúsculas, números y guiones' : ''
        );
        async function go() {
          err.value = ''; busy.value = true;
          try {
            await companyApi.setup(name.value.trim(), slug.value);
            setCompany(true);
            router.push('/panel');
          } catch (e) { err.value = apiErr(e); }
          finally { busy.value = false; }
        }
        return { name, slug, slugOk, slugErr, err, busy, go };
      },
    };

    /* ─────────────────────────────────────────────────────────────
       Vista: Dashboard  →  /panel  (placeholder — puntos 5-9)
    ───────────────────────────────────────────────────────────── */
    const DashboardView = {
      template: '<div class="page"><div class="card">' +
        '<h1>Panel</h1>' +
        '<p class="sub">Bienvenido a tu panel de QRs</p>' +
        '<div class="btn-wrap">' +
          '<button class="btn btn-g" @click="out">Cerrar sesión</button>' +
        '</div>' +
      '</div></div>',
      setup() {
        return { out() { signOut(); router.push('/entrar'); } };
      },
    };

    /* ─────────────────────────────────────────────────────────────
       Router + guards

       sin auth            →  /entrar
       auth + sin empresa  →  /iniciar
       auth + empresa      →  /panel
    ───────────────────────────────────────────────────────────── */
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/entrar',      component: LoginView,      meta: { guest: true } },
        { path: '/registrarse', component: SignupView,     meta: { guest: true } },
        { path: '/iniciar',     component: OnboardingView, meta: { auth: true } },
        { path: '/panel',       component: DashboardView,  meta: { auth: true, co: true } },
        { path: '/:p(.*)*',    redirect: '/entrar' },
      ],
    });

    router.beforeEach(to => {
      if (to.meta.auth  && !isAuth())        return '/entrar';
      if (to.meta.co    && !auth.hasCompany) return '/iniciar';
      if (to.meta.guest && isAuth())         return auth.hasCompany ? '/panel' : '/iniciar';
    });

    /* ─────────────────────────────────────────────────────────────
       Mount
    ───────────────────────────────────────────────────────────── */
    createApp({ template: '<RouterView />' }).use(router).mount('#app');
  </script>
</body>
</html>`;
