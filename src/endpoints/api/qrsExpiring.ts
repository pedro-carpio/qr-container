import { OpenAPIRoute } from "chanfana";
import type { AppContext } from "../../types";

export class QrsExpiring extends OpenAPIRoute {
	schema = {
		tags: ["QRs"],
		summary: "List your QRs expiring within 30 days",
		security: [{ bearerAuth: [] }],
		responses: {
			"200": { description: "QRs expiring within the next 30 days, ordered by soonest first" },
		},
	};

	async handle(c: AppContext) {
		const user_id = c.get("user_id");
		const now = new Date().toISOString();
		const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

		const rows = await c.env.DB.prepare(
			`SELECT id, amount, qr_string, expiration_date, bank, is_fallback
			 FROM qrs
			 WHERE user_id = ?
			   AND expiration_date > ?
			   AND expiration_date < ?
			 ORDER BY expiration_date ASC`,
		)
			.bind(user_id, now, in30Days)
			.all();

		return c.json({
			success: true,
			data: rows.results,
		});
	}
}
