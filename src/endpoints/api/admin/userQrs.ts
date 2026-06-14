import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../../types";

export class AdminUserQrs extends OpenAPIRoute {
	schema = {
		hide: true,
		tags: ["Admin"],
		summary: "List QRs for a specific user (admin only)",
		security: [{ bearerAuth: [] }],
		request: {
			params: z.object({
				user_id: z.string().uuid(),
			}),
			query: z.object({
				page: z.coerce.number().int().min(1).default(1),
				limit: z.coerce.number().int().min(1).max(100).default(20),
			}),
		},
		responses: {
			"200": { description: "User details and paginated QR list" },
			"403": { description: "Forbidden" },
			"404": { description: "User not found" },
		},
	};

	async handle(c: AppContext) {
		if (c.get("company_name") !== "admin") {
			return c.json({ success: false, errors: [{ code: 403, message: "Forbidden" }] }, 403);
		}

		const data = await this.getValidatedData<typeof this.schema>();
		const { user_id } = data.params;
		const { page, limit } = data.query;
		const offset = (page - 1) * limit;

		const user = await c.env.DB.prepare(
			"SELECT id, email, company_name, slug, is_fully_registered, created_at FROM users WHERE id = ?",
		)
			.bind(user_id)
			.first();

		if (!user) {
			return c.json({ success: false, errors: [{ code: 404, message: "User not found" }] }, 404);
		}

		const [countResult, rowsResult] = await c.env.DB.batch([
			c.env.DB.prepare("SELECT COUNT(*) as total FROM qrs WHERE user_id = ?").bind(user_id),
			c.env.DB.prepare(
				"SELECT id, amount, qr_string, expiration_date, bank, card_color, is_fallback, created_at FROM qrs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
			).bind(user_id, limit, offset),
		]);

		const total = (countResult.results[0] as { total: number }).total;

		return c.json({
			success: true,
			user,
			data: rowsResult.results,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		});
	}
}
