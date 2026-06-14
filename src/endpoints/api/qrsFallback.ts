import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

export class QrsFallbackCreate extends OpenAPIRoute {
	schema = {
		tags: ["QRs"],
		summary: "Create or replace fallback QR (expiration > 11 months required)",
		security: [{ bearerAuth: [] }],
		request: {
			body: contentJson(
				z.object({
					qr_string: z.string().min(1),
					expiration_date: z.string().datetime(),
					bank: z.string().optional(),
					card_color: z.string().optional(),
				}),
			),
		},
		responses: {
			"200": { description: "Fallback QR saved" },
			"400": { description: "Expiration date too soon" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { qr_string, expiration_date, bank, card_color } = data.body;
		const user_id = c.get("user_id");
		const isPro = c.get("benefits") === "pro";

		if (c.get("benefits") === "free") {
			const counts = await c.env.DB.prepare(
				`SELECT
					COUNT(*) as total,
					SUM(CASE WHEN is_fallback = 1 THEN 1 ELSE 0 END) as is_existing
				FROM qrs WHERE user_id = ?`,
			)
				.bind(user_id)
				.first<{ total: number; is_existing: number }>();
			if (counts && counts.is_existing === 0 && counts.total >= 5) {
				return c.json(
					{ success: false, errors: [{ code: 403, message: "Free plan is limited to 5 QRs" }] },
					403,
				);
			}
		}

		const minDate = new Date();
		minDate.setMonth(minDate.getMonth() + 11);
		if (new Date(expiration_date) <= minDate) {
			return c.json(
				{ success: false, errors: [{ code: 400, message: "expiration_date must be more than 11 months from now" }] },
				400,
			);
		}

		await c.env.DB.prepare(
			`INSERT INTO qrs (id, user_id, amount, qr_string, expiration_date, bank, card_color, is_fallback, created_at)
       VALUES (?, ?, 0, ?, ?, ?, ?, 1, ?)
       ON CONFLICT (user_id) WHERE is_fallback = 1
       DO UPDATE SET qr_string = excluded.qr_string, expiration_date = excluded.expiration_date, bank = excluded.bank, card_color = excluded.card_color`,
		)
			.bind(crypto.randomUUID(), user_id, qr_string, expiration_date, bank ?? null, isPro ? (card_color ?? null) : null, new Date().toISOString())
			.run();

		return c.json({ success: true });
	}
}
