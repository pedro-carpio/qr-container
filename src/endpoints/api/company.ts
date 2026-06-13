import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

export class CompanySetup extends OpenAPIRoute {
	schema = {
		tags: ["Onboarding"],
		summary: "Set company name and slug (one-time onboarding)",
		security: [{ bearerAuth: [] }],
		request: {
			body: contentJson(
				z.object({
					company_name: z.string().min(1),
					slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
				}),
			),
		},
		responses: {
			"200": { description: "Company info updated" },
			"409": { description: "Slug already taken" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { company_name, slug } = data.body;
		const user_id = c.get("user_id");

		const taken = await c.env.DB.prepare("SELECT id FROM users WHERE slug = ? AND id != ?")
			.bind(slug, user_id)
			.first();
		if (taken) {
			return c.json({ success: false, errors: [{ code: 409, message: "Slug already taken" }] }, 409);
		}

		await c.env.DB.prepare("UPDATE users SET company_name = ?, slug = ? WHERE id = ?")
			.bind(company_name, slug, user_id)
			.run();

		return c.json({ success: true });
	}
}
