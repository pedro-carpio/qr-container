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
				description: "JWT token and user info",
				...contentJson(
					z.object({
						access_token: z.string(),
						refresh_token: z.string(),
						fallback_qr_string: z.string().nullable(),
						logo_url: z.string().nullable(),
						user: z.object({
							id: z.string(),
							email: z.string(),
							company_name: z.string().nullable(),
							slug: z.string().nullable(),
							is_fully_registered: z.boolean(),
						}),
					}),
				),
			},
			"401": { description: "Invalid credentials" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { email, password } = data.body;

		const user = await c.env.DB.prepare(
			"SELECT id, email, password_hash, company_name, slug, is_fully_registered, logo_ext FROM users WHERE email = ?",
		)
			.bind(email)
			.first<{
				id: string;
				email: string;
				password_hash: string;
				company_name: string | null;
				slug: string | null;
				is_fully_registered: number;
				logo_ext: string | null;
			}>();

		if (!user || !(await verifyPassword(password, user.password_hash))) {
			return c.json({ success: false, errors: [{ code: 401, message: "Invalid credentials" }] }, 401);
		}

		const [access_token, refresh_token, fallbackQr] = await Promise.all([
			signJWT({ user_id: user.id, type: "access" }, c.env.WORKER_SECRET, 15 * 60),
			signJWT({ user_id: user.id, type: "refresh" }, c.env.WORKER_SECRET, 7 * 24 * 60 * 60),
			c.env.DB.prepare("SELECT qr_string FROM qrs WHERE user_id = ? AND is_fallback = 1 LIMIT 1")
				.bind(user.id)
				.first<{ qr_string: string }>(),
		]);

		return c.json({
			access_token,
			refresh_token,
			fallback_qr_string: fallbackQr?.qr_string ?? null,
			logo_url: user.logo_ext
				? `${c.env.LOGOS_BASE_URL}/logos/${user.id}.${user.logo_ext}`
				: null,
			user: {
				id: user.id,
				email: user.email,
				company_name: user.company_name,
				slug: user.slug,
				is_fully_registered: user.is_fully_registered === 1,
			},
		});
	}
}
