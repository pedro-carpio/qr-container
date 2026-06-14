import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

export class QrsList extends OpenAPIRoute {
	schema = {
		tags: ["QRs"],
		summary: "List your own QRs",
		security: [{ bearerAuth: [] }],
		request: {
			query: z.object({
				page: z.coerce.number().int().min(1).default(1),
				limit: z.coerce.number().int().min(1).max(100).default(20),
			}),
		},
		responses: {
			"200": { description: "Paginated list of your QRs" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { page, limit } = data.query;
		const offset = (page - 1) * limit;
		const user_id = c.get("user_id");

		const [countResult, rowsResult] = await c.env.DB.batch([
			c.env.DB.prepare("SELECT COUNT(*) as total FROM qrs WHERE user_id = ?").bind(user_id),
			c.env.DB.prepare(
				"SELECT id, amount, qr_string, expiration_date, bank, card_color, is_fallback, created_at FROM qrs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
			).bind(user_id, limit, offset),
		]);

		const total = (countResult.results[0] as { total: number }).total;

		return c.json({
			success: true,
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
