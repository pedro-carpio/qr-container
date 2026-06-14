import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

async function notifyOwner(email: string, slug: string, amount: number): Promise<void> {
	console.log(`[notify] fallback used: slug=${slug} amount=${amount} owner=${email}`);
}

export class RouterGet extends OpenAPIRoute {
	schema = {
		tags: ["Router"],
		summary: "Resolve QR string for a given slug and amount",
		request: {
			params: z.object({
				slug: z.string(),
				amount: z.coerce.number().positive(),
			}),
		},
		responses: {
			"200": {
				description: "QR string",
				...contentJson(z.object({ qr_string: z.string(), expiration_date: z.string() })),
			},
			"404": { description: "Not found" },
			"429": { description: "Rate limit exceeded" },
		},
	};

	async handle(c: AppContext) {
		// Rate limiting
		const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
		const rlKey = `rl:${ip}`;
		const current = await c.env.KV.get(rlKey);
		const count = current ? parseInt(current, 10) : 0;
		if (count >= 30) {
			return c.json({ success: false, errors: [{ code: 429, message: "Rate limit exceeded" }] }, 429);
		}
		await c.env.KV.put(rlKey, String(count + 1), { expirationTtl: 60 });

		const data = await this.getValidatedData<typeof this.schema>();
		const { slug, amount } = data.params;

		// Resolve user by slug
		const user = await c.env.DB.prepare(
			"SELECT id, email FROM users WHERE slug = ?",
		)
			.bind(slug)
			.first<{ id: string; email: string }>();
		if (!user) {
			return c.json({ success: false, errors: [{ code: 404, message: "Not found" }] }, 404);
		}

		const now = new Date().toISOString();

		// Exact QR match
		const qr = await c.env.DB.prepare(
			"SELECT qr_string, expiration_date FROM qrs WHERE user_id = ? AND amount = ? AND is_fallback = 0",
		)
			.bind(user.id, amount)
			.first<{ qr_string: string; expiration_date: string }>();

		if (qr && qr.expiration_date > now) {
			return c.json({ qr_string: qr.qr_string, expiration_date: qr.expiration_date });
		}

		// Fallback
		const fallback = await c.env.DB.prepare(
			"SELECT qr_string, expiration_date FROM qrs WHERE user_id = ? AND is_fallback = 1 AND expiration_date > ?",
		)
			.bind(user.id, now)
			.first<{ qr_string: string; expiration_date: string }>();

		if (!fallback) {
			return c.json({ success: false, errors: [{ code: 404, message: "Not found" }] }, 404);
		}

		c.executionCtx.waitUntil(notifyOwner(user.email, slug, amount));
		return c.json({ qr_string: fallback.qr_string, expiration_date: fallback.expiration_date });
	}
}
