import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../../types";

export class AdminListUsers extends OpenAPIRoute {
	schema = {
		hide: true,
		tags: ["Admin"],
		summary: "List all users (admin only)",
		security: [{ bearerAuth: [] }],
		request: {
			query: z.object({
				page: z.coerce.number().int().min(1).default(1),
				limit: z.coerce.number().int().min(1).max(100).default(20),
				status: z.enum(["pending", "active"]).optional(),
			}),
		},
		responses: {
			"200": { description: "Paginated list of users" },
			"403": { description: "Forbidden" },
		},
	};

	async handle(c: AppContext) {
		if (c.get("company_name") !== "admin") {
			return c.json({ success: false, errors: [{ code: 403, message: "Forbidden" }] }, 403);
		}

		const data = await this.getValidatedData<typeof this.schema>();
		const { page, limit, status } = data.query;
		const offset = (page - 1) * limit;

		const whereClause =
			status === "pending"
				? "WHERE is_fully_registered = 0"
				: status === "active"
					? "WHERE is_fully_registered = 1"
					: "";

		const [countResult, rowsResult] = await c.env.DB.batch([
			c.env.DB.prepare(`SELECT COUNT(*) as total FROM users ${whereClause}`),
			c.env.DB.prepare(
				`SELECT id, email, company_name, slug, is_fully_registered, created_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
			).bind(limit, offset),
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
