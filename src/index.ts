import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
import type { Variables } from "./types";
import { requireAuth } from "./auth/middleware";
import { Signup } from "./endpoints/auth/signup";
import { Login } from "./endpoints/auth/login";
import { CompanySetup } from "./endpoints/api/company";
import { QrsFallbackCreate } from "./endpoints/api/qrsFallback";
import { ApproveUser } from "./endpoints/api/approve";
import { QrsCreate } from "./endpoints/api/qrs";
import { RouterGet } from "./endpoints/router/routerGet";
import { cleanup } from "./cron/cleanup";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.onError((err, c) => {
	if (err instanceof ApiException) {
		return c.json({ success: false, errors: err.buildResponse() }, err.status as ContentfulStatusCode);
	}
	console.error("Unhandled error:", err);
	return c.json({ success: false, errors: [{ code: 7000, message: "Internal Server Error" }] }, 500);
});

// Protect all /api/* routes with JWT auth
app.use("/api/*", requireAuth);

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

// Onboarding + protected API
openapi.post("/api/company", CompanySetup);
openapi.post("/api/qrs/fallback", QrsFallbackCreate);
openapi.post("/api/approve", ApproveUser);
openapi.post("/api/qrs", QrsCreate);

// Public router
openapi.get("/router/:slug/:amount", RouterGet);

export default {
	fetch: app.fetch.bind(app),
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(cleanup(env));
	},
};
