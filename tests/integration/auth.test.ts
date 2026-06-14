import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

async function post(path: string, body: unknown, token?: string) {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers["Authorization"] = `Bearer ${token}`;
	return SELF.fetch(`http://local.test${path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

describe("POST /auth/signup", () => {
	it("creates a user and returns a JWT", async () => {
		const res = await post("/auth/signup", { email: "signup1@test.com", password: "password123" });
		const body = await res.json<{ token: string }>();
		expect(res.status).toBe(200);
		expect(typeof body.token).toBe("string");
		expect(body.token.split(".")).toHaveLength(3);
	});

	it("returns 409 when email is already registered", async () => {
		await post("/auth/signup", { email: "signup2@test.com", password: "password123" });
		const res = await post("/auth/signup", { email: "signup2@test.com", password: "password123" });
		expect(res.status).toBe(409);
	});

	it("returns 400 for invalid input", async () => {
		const res = await post("/auth/signup", { email: "not-an-email", password: "short" });
		expect(res.status).toBe(400);
	});
});

describe("POST /auth/login", () => {
	it("returns a JWT for valid credentials", async () => {
		await post("/auth/signup", { email: "login1@test.com", password: "password123" });
		const res = await post("/auth/login", { email: "login1@test.com", password: "password123" });
		const body = await res.json<{ access_token: string; refresh_token: string }>();
		expect(res.status).toBe(200);
		expect(typeof body.access_token).toBe("string");
		expect(typeof body.refresh_token).toBe("string");
	});

	it("returns 401 for wrong password", async () => {
		await post("/auth/signup", { email: "login2@test.com", password: "password123" });
		const res = await post("/auth/login", { email: "login2@test.com", password: "wrongpassword" });
		expect(res.status).toBe(401);
	});

	it("returns 401 for unknown email", async () => {
		const res = await post("/auth/login", { email: "nobody@test.com", password: "password123" });
		expect(res.status).toBe(401);
	});
});
