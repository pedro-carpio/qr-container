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

function decodeJWT(token: string): Record<string, unknown> {
	const payload = token.split(".")[1];
	const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
	return JSON.parse(atob(base64));
}

async function setupFullUser(emailSuffix: string, slug: string) {
	// Admin user
	const adminRes = await post("/auth/signup", { email: `admin_${emailSuffix}@test.com`, password: "adminpass12" });
	const { token: adminToken } = await adminRes.json<{ token: string }>();
	await post("/api/company", { company_name: "admin", slug: `admin-${emailSuffix}` }, adminToken);

	// Regular user
	const userRes = await post("/auth/signup", { email: `user_${emailSuffix}@test.com`, password: "userpass123" });
	const { token: userToken } = await userRes.json<{ token: string }>();
	await post("/api/company", { company_name: "Acme Corp", slug }, userToken);

	const userId = decodeJWT(userToken).user_id as string;
	await post("/api/approve", { user_id: userId }, adminToken);

	return { userToken, userId };
}

describe("GET /router/:slug/:amount", () => {
	it("returns the exact QR when valid", async () => {
		const { userToken } = await setupFullUser("exact", "acme-exact");
		const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();

		await post("/api/qrs/fallback", { qr_string: "fallback-data", expiration_date: future, bank: "Bank" }, userToken);
		await post("/api/qrs", { amount: 100, qr_string: "exact-data", expiration_date: future, bank: "Bank" }, userToken);

		const res = await SELF.fetch("http://local.test/router/acme-exact/100");
		const body = await res.json<{ qr_string: string }>();
		expect(res.status).toBe(200);
		expect(body.qr_string).toBe("exact-data");
	});

	it("falls back when the exact QR is expired", async () => {
		const { userToken } = await setupFullUser("fallback", "acme-fallback");
		const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();
		const past = new Date(Date.now() - 1000).toISOString();

		await post("/api/qrs/fallback", { qr_string: "fallback-data", expiration_date: future, bank: "Bank" }, userToken);
		// Insert expired QR directly via API using a past date — API accepts any datetime so we can use past dates
		await post("/api/qrs", { amount: 50, qr_string: "expired-data", expiration_date: past, bank: "Bank" }, userToken);

		const res = await SELF.fetch("http://local.test/router/acme-fallback/50");
		const body = await res.json<{ qr_string: string }>();
		expect(res.status).toBe(200);
		expect(body.qr_string).toBe("fallback-data");
	});

	it("returns 404 for unknown slug", async () => {
		const res = await SELF.fetch("http://local.test/router/nonexistent-slug/100");
		expect(res.status).toBe(404);
	});

	it("returns 404 when no QR and no fallback exist", async () => {
		const { userToken } = await setupFullUser("nofallback", "acme-nofallback");
		const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();
		// Set a regular QR but no fallback
		await post("/api/qrs", { amount: 200, qr_string: "some-data", expiration_date: future, bank: "Bank" }, userToken);

		// Different amount with no fallback
		const res = await SELF.fetch("http://local.test/router/acme-nofallback/999");
		expect(res.status).toBe(404);
	});
});
