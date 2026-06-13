import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { hashPassword } from "../../auth/password";
import { signJWT } from "../../auth/jwt";

export class Signup extends OpenAPIRoute {
	schema = {
		tags: ["Auth"],
		summary: "Create a new account",
		request: {
			body: contentJson(
				z.object({
					email: z.string().email(),
					password: z.string().min(8),
				}),
			),
		},
		responses: {
			"200": {
				description: "JWT token",
				...contentJson(z.object({ token: z.string() })),
			},
			"409": { description: "Email already registered" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { email, password } = data.body;

		const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
		if (existing) {
			return c.json({ success: false, errors: [{ code: 409, message: "Email already registered" }] }, 409);
		}

		const id = crypto.randomUUID();
		const password_hash = await hashPassword(password);
		const created_at = new Date().toISOString();

		await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
			.bind(id, email, password_hash, created_at)
			.run();

		const token = await signJWT({ user_id: id }, c.env.WORKER_SECRET);
		return c.json({ token });
	}
}
