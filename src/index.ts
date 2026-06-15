import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ContentfulStatusCode } from "hono/utils/http-status";
import type { Variables } from "./types";
import { requireAuth } from "./auth/middleware";
import { checkMonthlyLimit, requireBenefit } from "./auth/benefits";
import { Signup } from "./endpoints/auth/signup";
import { Login } from "./endpoints/auth/login";
import { RefreshToken } from "./endpoints/auth/refresh";
import { CompanySetup } from "./endpoints/api/company";
import { QrsFallbackCreate } from "./endpoints/api/qrsFallback";
import { ApproveUser } from "./endpoints/api/approve";
import { QrsCreate } from "./endpoints/api/qrs";
import { QrsExpiring } from "./endpoints/api/qrsExpiring";
import { QrsList } from "./endpoints/api/qrsList";
import { AdminListUsers } from "./endpoints/api/admin/users";
import { AdminListPending } from "./endpoints/api/admin/pending";
import { AdminUserQrs } from "./endpoints/api/admin/userQrs";
import { AdminStats } from "./endpoints/api/admin/stats";
import { RouterGet } from "./endpoints/router/routerGet";
import { LogoUpload, LogoGet } from "./endpoints/api/logo";
import { QrsRender } from "./endpoints/api/qrsRender";
import { cleanup } from "./cron/cleanup";

const ALLOWED_ORIGINS = [
	"https://qr-container-frontend-mu.vercel.app",
	"https://qr.porkusillo.site"
];

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
	"*",
	cors({
		origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "x-internal"],
		exposeHeaders: [],
		maxAge: 86400,
		credentials: false,
	}),
);

app.onError((err, c) => {
	if (err instanceof ApiException) {
		return c.json({ success: false, errors: err.buildResponse() }, err.status as ContentfulStatusCode);
	}
	console.error("Unhandled error:", err);
	return c.json({ success: false, errors: [{ code: 7000, message: "Internal Server Error" }] }, 500);
});

// Protect all /api/* routes with JWT auth, then enforce monthly limit for free users
app.use("/api/*", requireAuth);
app.use("/api/*", checkMonthlyLimit);

const openapi = fromHono(app, {
	docs_url: "/",
	schema: {
		info: {
			title: "QR Router API",
			version: "1.0.0",
			description: "QR routing backend - Cloudflare Workers + D1 + KV",
		},
	},
});

// Auth
openapi.post("/auth/signup", Signup);
openapi.post("/auth/login", Login);
openapi.post("/auth/refresh", RefreshToken);

// Onboarding + protected API
openapi.post("/api/company", CompanySetup);
openapi.post("/api/qrs/fallback", QrsFallbackCreate);
openapi.post("/api/approve", ApproveUser);
openapi.post("/api/qrs", QrsCreate);
openapi.get("/api/qrs", QrsList);
openapi.get("/api/qrs/expiring", QrsExpiring);
openapi.post("/api/logo", requireBenefit("pro"), LogoUpload);
openapi.get("/api/logo", requireBenefit("pro"), LogoGet);
openapi.get("/api/qrs/render/:amount", requireBenefit("pro"), QrsRender);

// Admin audit (hidden from OpenAPI docs)
openapi.get("/api/admin/stats", AdminStats);
openapi.get("/api/admin/pending", AdminListPending);
openapi.get("/api/admin/users", AdminListUsers);
openapi.get("/api/admin/users/:user_id/qrs", AdminUserQrs);

// Public router
openapi.get("/router/:slug/:amount", RouterGet);

export default {
	fetch: app.fetch.bind(app),
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(cleanup(env));
	},
};
