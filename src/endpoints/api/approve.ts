import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

export class ApproveUser extends OpenAPIRoute {
	schema = {
		tags: ["Admin"],
		summary: "Approve a user (admin only)",
		security: [{ bearerAuth: [] }],
		request: {
			body: contentJson(
				z.object({
					user_id: z.string().uuid(),
				}),
			),
		},
		responses: {
			"200": { description: "User approved" },
			"403": { description: "Forbidden" },
			"404": { description: "User not found" },
		},
	};

	async handle(c: AppContext) {
		if (c.get("company_name") !== "admin") {
			return c.json({ success: false, errors: [{ code: 403, message: "Forbidden" }] }, 403);
		}

		const data = await this.getValidatedData<typeof this.schema>();
		const { user_id } = data.body;

		const result = await c.env.DB.prepare("UPDATE users SET is_fully_registered = 1 WHERE id = ?")
			.bind(user_id)
			.run();

		if (result.meta.changes === 0) {
			return c.json({ success: false, errors: [{ code: 404, message: "User not found" }] }, 404);
		}

		return c.json({ success: true });
	}
}
