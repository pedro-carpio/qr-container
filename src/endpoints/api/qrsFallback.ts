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
			.bind(crypto.randomUUID(), user_id, qr_string, expiration_date, bank ?? null, card_color ?? null, new Date().toISOString())
			.run();

		return c.json({ success: true });
	}
}
