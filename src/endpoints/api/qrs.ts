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
				}),
			),
		},
		responses: {
			"200": { description: "QR saved" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { amount, qr_string, expiration_date, bank } = data.body;
		const user_id = c.get("user_id");

		await c.env.DB.prepare(
			`INSERT INTO qrs (id, user_id, amount, qr_string, expiration_date, bank, is_fallback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT (user_id, amount) WHERE is_fallback = 0
       DO UPDATE SET qr_string = excluded.qr_string, expiration_date = excluded.expiration_date, bank = excluded.bank`,
		)
			.bind(crypto.randomUUID(), user_id, amount, qr_string, expiration_date, bank ?? null, new Date().toISOString())
			.run();

		return c.json({ success: true });
	}
}
