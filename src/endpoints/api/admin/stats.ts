import { OpenAPIRoute } from "chanfana";
import type { AppContext } from "../../../types";

export class AdminStats extends OpenAPIRoute {
	schema = {
		hide: true,
		tags: ["Admin"],
		summary: "Aggregate platform statistics (admin only)",
		security: [{ bearerAuth: [] }],
		responses: {
			"200": { description: "Aggregate stats for users and QRs" },
			"403": { description: "Forbidden" },
		},
	};

	async handle(c: AppContext) {
		if (c.get("company_name") !== "admin") {
			return c.json({ success: false, errors: [{ code: 403, message: "Forbidden" }] }, 403);
		}

		const [userStats, qrStats] = await c.env.DB.batch([
			c.env.DB.prepare(`
				SELECT
					COUNT(*) as total_users,
					SUM(is_fully_registered) as active_users,
					SUM(CASE WHEN is_fully_registered = 0 THEN 1 ELSE 0 END) as pending_users
				FROM users
			`),
			c.env.DB.prepare(`
				SELECT
					COUNT(*) as total_qrs,
					SUM(is_fallback) as fallback_qrs,
					SUM(CASE WHEN expiration_date < datetime('now') THEN 1 ELSE 0 END) as expired_qrs
				FROM qrs
			`),
		]);

		return c.json({
			success: true,
			data: {
				users: userStats.results[0],
				qrs: qrStats.results[0],
			},
		});
	}
}
