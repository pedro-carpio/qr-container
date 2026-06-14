import { createMiddleware } from "hono/factory";
import { verifyJWT } from "./jwt";
import type { Variables } from "../types";

export const requireAuth = createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
	const auth = c.req.header("Authorization");
	if (!auth?.startsWith("Bearer ")) {
		return c.json({ success: false, errors: [{ code: 401, message: "Unauthorized" }] }, 401);
	}
	try {
		const payload = await verifyJWT(auth.slice(7), c.env.WORKER_SECRET);
		if (payload.type === "refresh") throw new Error("Refresh token cannot be used for API access");
		const user = await c.env.DB.prepare("SELECT company_name, is_fully_registered FROM users WHERE id = ?")
			.bind(payload.user_id)
			.first<{ company_name: string | null; is_fully_registered: number }>();
		if (!user) throw new Error("User not found");
		c.set("user_id", payload.user_id as string);
		c.set("company_name", user.company_name);
		c.set("is_fully_registered", user.is_fully_registered);
	} catch {
		return c.json({ success: false, errors: [{ code: 401, message: "Unauthorized" }] }, 401);
	}
	await next();
});
