import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

export class QrsCreate extends OpenAPIRoute {
	schema = {
		tags: ["QRs"],
		summary: "Create or replace a QR for a specific amount",
		security: [{ bearerAuth: [] }],
		request: {
			body: contentJson(
				z.object({
					amount: z.number().positive(),
					qr_string: z.string().min(1),
					expiration_date: z.string().datetime(),
					bank: z.string().optional(),
					card_color: z.string().optional(),
				}),
			),
		},
		responses: {
			"200": { description: "QR saved" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { amount, qr_string, expiration_date, bank, card_color } = data.body;
		const user_id = c.get("user_id");
		const isPro = c.get("benefits") === "pro";

		if (c.get("benefits") === "free") {
			const counts = await c.env.DB.prepare(
				`SELECT
					COUNT(*) as total,
					SUM(CASE WHEN amount = ? AND is_fallback = 0 THEN 1 ELSE 0 END) as is_existing
				FROM qrs WHERE user_id = ?`,
			)
				.bind(amount, user_id)
				.first<{ total: number; is_existing: number }>();
			if (counts && counts.is_existing === 0 && counts.total >= 5) {
				return c.json(
					{ success: false, errors: [{ code: 403, message: "Free plan is limited to 5 QRs" }] },
					403,
				);
			}
		}

		await c.env.DB.prepare(
			`INSERT INTO qrs (id, user_id, amount, qr_string, expiration_date, bank, card_color, is_fallback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT (user_id, amount) WHERE is_fallback = 0
       DO UPDATE SET qr_string = excluded.qr_string, expiration_date = excluded.expiration_date, bank = excluded.bank, card_color = excluded.card_color`,
		)
			.bind(crypto.randomUUID(), user_id, amount, qr_string, expiration_date, bank ?? null, isPro ? (card_color ?? null) : null, new Date().toISOString())
			.run();

		return c.json({ success: true });
	}
}
