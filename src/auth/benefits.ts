import { createMiddleware } from "hono/factory";
import type { Variables } from "../types";

const FREE_MONTHLY_REQUESTS = 100;

const PLAN_RANK: Record<string, number> = { free: 0, simple: 1, pro: 2 };

/**
 * Route-level guard: rejects requests from users below minPlan.
 * Apply directly on routes that require a specific plan tier.
 */
export const requireBenefit = (minPlan: "simple" | "pro") =>
	createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
		const benefits = c.get("benefits");
		if ((PLAN_RANK[benefits] ?? 0) < PLAN_RANK[minPlan]) {
			return c.json(
				{
					success: false,
					errors: [{ code: 403, message: `${minPlan.charAt(0).toUpperCase() + minPlan.slice(1)} plan or higher required` }],
				},
				403,
			);
		}
		await next();
	});

/**
 * Global middleware for /api/*: enforces monthly request cap for free users.
 * Non-free users pass through instantly.
 */
export const checkMonthlyLimit = createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
	if (c.get("benefits") !== "free") {
		await next();
		return;
	}

	const user_id = c.get("user_id");
	// Key resets automatically via TTL — no manual cleanup needed
	const month = new Date().toISOString().slice(0, 7); // e.g. "2026-06"
	const key = `monthly:${user_id}:${month}`;

	const raw = await c.env.KV.get(key);
	const count = raw ? parseInt(raw, 10) : 0;

	if (count >= FREE_MONTHLY_REQUESTS) {
		return c.json(
			{
				success: false,
				errors: [{ code: 429, message: `Free plan is limited to ${FREE_MONTHLY_REQUESTS} requests per month` }],
			},
			429,
		);
	}

	// Increment counter; TTL ensures the key expires ~35 days after creation
	await c.env.KV.put(key, String(count + 1), { expirationTtl: 60 * 60 * 24 * 35 });

	await next();
});
