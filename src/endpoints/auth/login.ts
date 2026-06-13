import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { verifyPassword } from "../../auth/password";
import { signJWT } from "../../auth/jwt";

export class Login extends OpenAPIRoute {
	schema = {
		tags: ["Auth"],
		summary: "Login with email and password",
		request: {
			body: contentJson(
				z.object({
					email: z.string().email(),
					password: z.string(),
				}),
			),
		},
		responses: {
			"200": {
				description: "JWT token",
				...contentJson(z.object({ token: z.string() })),
			},
			"401": { description: "Invalid credentials" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { email, password } = data.body;

		const user = await c.env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?")
			.bind(email)
			.first<{ id: string; password_hash: string }>();

		if (!user || !(await verifyPassword(password, user.password_hash))) {
			return c.json({ success: false, errors: [{ code: 401, message: "Invalid credentials" }] }, 401);
		}

		const token = await signJWT({ user_id: user.id }, c.env.WORKER_SECRET);
		return c.json({ token });
	}
}
