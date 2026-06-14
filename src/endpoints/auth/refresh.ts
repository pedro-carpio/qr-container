import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { signJWT, verifyJWT } from "../../auth/jwt";

export class RefreshToken extends OpenAPIRoute {
	schema = {
		tags: ["Auth"],
		summary: "Refresh access token",
		request: {
			body: contentJson(z.object({ refresh_token: z.string() })),
		},
		responses: {
			"200": {
				description: "New access token",
				...contentJson(z.object({ access_token: z.string() })),
			},
			"401": { description: "Invalid or expired refresh token" },
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { refresh_token } = data.body;

		let payload: Record<string, unknown>;
		try {
			payload = await verifyJWT(refresh_token, c.env.WORKER_SECRET);
		} catch {
			return c.json({ success: false, errors: [{ code: 401, message: "Invalid or expired refresh token" }] }, 401);
		}

		if (payload.type !== "refresh") {
			return c.json({ success: false, errors: [{ code: 401, message: "Invalid token type" }] }, 401);
		}

		const access_token = await signJWT(
			{ user_id: payload.user_id, type: "access" },
			c.env.WORKER_SECRET,
			15 * 60,
		);
		return c.json({ access_token });
	}
}
