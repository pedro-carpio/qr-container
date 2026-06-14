import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { renderSVG } from "uqr";
import type { AppContext } from "../../types";

export class QrsRender extends OpenAPIRoute {
	schema = {
		tags: ["QRs"],
		summary: "Render a QR as SVG image (pro plan only). Falls back to fallback QR if no QR exists for the given amount.",
		security: [{ bearerAuth: [] }],
		request: {
			params: z.object({
				amount: z.string().regex(/^\d+(\.\d+)?$/, "amount must be a positive number"),
			}),
		},
		responses: {
			"200": { description: "SVG image of the QR code" },
			"404": { description: "No QR found for this user and amount" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const amount = parseFloat(data.params.amount);
		const user_id = c.get("user_id");

		const result = await c.env.DB.batch<{ qr_string: string }>([
			c.env.DB.prepare("SELECT qr_string FROM qrs WHERE user_id = ? AND amount = ? AND is_fallback = 0 LIMIT 1").bind(
				user_id,
				amount,
			),
			c.env.DB.prepare("SELECT qr_string FROM qrs WHERE user_id = ? AND is_fallback = 1 LIMIT 1").bind(user_id),
		]);

		const qrString =
			result[0].results[0]?.qr_string ?? result[1].results[0]?.qr_string ?? null;

		if (!qrString) {
			return c.json({ success: false, errors: [{ code: 404, message: "No QR found for this amount" }] }, 404);
		}

		const svg = renderSVG(qrString);

		return new Response(svg, {
			headers: {
				"Content-Type": "image/svg+xml",
				"Cache-Control": "private, max-age=300",
			},
		});
	}
}
