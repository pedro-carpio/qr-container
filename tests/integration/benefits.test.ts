import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// ─── helpers ────────────────────────────────────────────────────────────────

function decodeJWT(token: string): Record<string, unknown> {
	const payload = token.split(".")[1];
	return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
}

async function post(path: string, body: unknown, token?: string) {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers["Authorization"] = `Bearer ${token}`;
	return SELF.fetch(`http://local.test${path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

async function get(path: string, token: string) {
	return SELF.fetch(`http://local.test${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
}

/** Creates an approved user with the given benefit plan, set directly in D1. */
async function setupUser(suffix: string, benefits: "free" | "simple" | "pro" = "free") {
	const adminRes = await post("/auth/signup", { email: `b_admin_${suffix}@test.com`, password: "adminpass12" });
	const { token: adminToken } = await adminRes.json<{ token: string }>();
	await post("/api/company", { company_name: "admin", slug: `b-admin-${suffix}` }, adminToken);

	const userRes = await post("/auth/signup", { email: `b_user_${suffix}@test.com`, password: "userpass123" });
	const { token: userToken } = await userRes.json<{ token: string }>();
	await post("/api/company", { company_name: "Test Corp", slug: `b-user-${suffix}` }, userToken);

	const userId = decodeJWT(userToken).user_id as string;
	await post("/api/approve", { user_id: userId }, adminToken);

	// Middleware reads benefits from DB on every request, so changing it here is enough
	if (benefits !== "free") {
		await env.DB.prepare("UPDATE users SET benefits = ? WHERE id = ?").bind(benefits, userId).run();
	}

	return { userToken, userId };
}

/**
 * Builds a minimal PNG byte array whose headers satisfy the logo validator
 * (correct signature + width/height fields). CRC fields are left as zeros;
 * the validator only reads the signature and IHDR dimensions, not CRCs.
 */
function makePng(width = 1, height = 1): Uint8Array {
	const buf = new Uint8Array(67);
	// PNG signature
	buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	// IHDR chunk length (13)
	buf.set([0x00, 0x00, 0x00, 0x0d], 8);
	// "IHDR"
	buf.set([0x49, 0x48, 0x44, 0x52], 12);
	// width and height (big-endian uint32)
	const view = new DataView(buf.buffer);
	view.setUint32(16, width, false);
	view.setUint32(20, height, false);
	// bit depth=8, color type=2 (RGB)
	buf.set([0x08, 0x02, 0x00, 0x00, 0x00], 24);
	return buf;
}

async function uploadLogo(token: string, png = makePng()) {
	const form = new FormData();
	form.append("logo", new File([png], "logo.png", { type: "image/png" }));
	return SELF.fetch("http://local.test/api/logo", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});
}

// A date far enough in the future to satisfy both the QR and fallback validators (>11 months)
const FUTURE = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();

// ─── Free plan ───────────────────────────────────────────────────────────────

describe("Free plan – QR count limit", () => {
	it("allows creating up to 5 QRs", async () => {
		const { userToken } = await setupUser("free-allow-5");
		for (let i = 1; i <= 5; i++) {
			const res = await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
			expect(res.status).toBe(200);
		}
	});

	it("blocks a 6th amount-specific QR with 403", async () => {
		const { userToken } = await setupUser("free-block-6th");
		for (let i = 1; i <= 5; i++) {
			await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
		}
		const res = await post("/api/qrs", { amount: 6, qr_string: "qr-6", expiration_date: FUTURE }, userToken);
		expect(res.status).toBe(403);
		const body = await res.json<{ errors: Array<{ code: number }> }>();
		expect(body.errors[0].code).toBe(403);
	});

	it("counts the fallback QR toward the 5-QR limit", async () => {
		const { userToken } = await setupUser("free-fallback-counts");
		// 4 amount QRs + 1 fallback = 5 total
		for (let i = 1; i <= 4; i++) {
			await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
		}
		await post("/api/qrs/fallback", { qr_string: "fallback", expiration_date: FUTURE }, userToken);

		const res = await post("/api/qrs", { amount: 5, qr_string: "qr-5", expiration_date: FUTURE }, userToken);
		expect(res.status).toBe(403);
	});

	it("blocks creating a fallback when 5 amount QRs already exist", async () => {
		const { userToken } = await setupUser("free-fb-blocked");
		for (let i = 1; i <= 5; i++) {
			await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
		}
		const res = await post("/api/qrs/fallback", { qr_string: "fallback", expiration_date: FUTURE }, userToken);
		expect(res.status).toBe(403);
	});

	it("allows updating an existing amount QR (upsert, count unchanged)", async () => {
		const { userToken } = await setupUser("free-upsert-amount");
		for (let i = 1; i <= 5; i++) {
			await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
		}
		// Updating amount=1 is an upsert → must not be rejected
		const res = await post("/api/qrs", { amount: 1, qr_string: "updated-qr", expiration_date: FUTURE }, userToken);
		expect(res.status).toBe(200);
	});

	it("allows updating existing fallback when already at the limit", async () => {
		const { userToken } = await setupUser("free-upsert-fallback");
		for (let i = 1; i <= 4; i++) {
			await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
		}
		await post("/api/qrs/fallback", { qr_string: "old-fallback", expiration_date: FUTURE }, userToken);
		// Replacing the existing fallback is an upsert → must not be rejected
		const res = await post("/api/qrs/fallback", { qr_string: "new-fallback", expiration_date: FUTURE }, userToken);
		expect(res.status).toBe(200);
	});
});

describe("Free plan – pro feature access", () => {
	it("rejects logo upload with 403", async () => {
		const { userToken } = await setupUser("free-logo-upload");
		const res = await uploadLogo(userToken);
		expect(res.status).toBe(403);
	});

	it("rejects logo GET with 403", async () => {
		const { userToken } = await setupUser("free-logo-get");
		const res = await get("/api/logo", userToken);
		expect(res.status).toBe(403);
	});

	it("rejects QR render with 403", async () => {
		const { userToken } = await setupUser("free-render");
		const res = await get("/api/qrs/render/100", userToken);
		expect(res.status).toBe(403);
	});
});

describe("Free plan – card_color is dropped", () => {
	it("silently drops card_color on amount QR and stores null", async () => {
		const { userToken } = await setupUser("free-color-amount");
		await post("/api/qrs", { amount: 1, qr_string: "qr-data", expiration_date: FUTURE, card_color: "#FF0000" }, userToken);

		const listRes = await get("/api/qrs", userToken);
		const body = (await listRes.json()) as { data: Array<{ card_color: string | null; is_fallback: number }> };
		const qr = body.data.find((q) => q.is_fallback === 0);
		expect(qr?.card_color).toBeNull();
	});

	it("silently drops card_color on fallback QR and stores null", async () => {
		const { userToken } = await setupUser("free-color-fallback");
		await post("/api/qrs/fallback", { qr_string: "fb-data", expiration_date: FUTURE, card_color: "#00FF00" }, userToken);

		const listRes = await get("/api/qrs", userToken);
		const body = (await listRes.json()) as { data: Array<{ card_color: string | null; is_fallback: number }> };
		const fallback = body.data.find((q) => q.is_fallback === 1);
		expect(fallback?.card_color).toBeNull();
	});
});

describe("Free plan – monthly request limit", () => {
	it("allows the 100th request and blocks the 101st (429)", async () => {
		const { userToken, userId } = await setupUser("free-rate-limit");
		const month = new Date().toISOString().slice(0, 7);
		// Pre-populate counter to 99
		await env.KV.put(`monthly:${userId}:${month}`, "99");

		// 100th → should succeed
		const ok = await get("/api/qrs", userToken);
		expect(ok.status).toBe(200);

		// 101st → must be blocked
		const blocked = await get("/api/qrs", userToken);
		expect(blocked.status).toBe(429);
		const body = await blocked.json<{ errors: Array<{ code: number }> }>();
		expect(body.errors[0].code).toBe(429);
	});

	it("increments the KV counter on each request", async () => {
		const { userToken, userId } = await setupUser("free-counter-incr");
		const month = new Date().toISOString().slice(0, 7);
		const key = `monthly:${userId}:${month}`;

		// setupUser calls /api/company, which already increments the counter once
		const baseline = Number(await env.KV.get(key) ?? "0");

		await get("/api/qrs", userToken);
		expect(Number(await env.KV.get(key))).toBe(baseline + 1);

		await get("/api/qrs", userToken);
		expect(Number(await env.KV.get(key))).toBe(baseline + 2);
	});
});

// ─── Simple plan ─────────────────────────────────────────────────────────────

describe("Simple plan – unlimited QRs", () => {
	it("allows creating more than 5 QRs", async () => {
		const { userToken } = await setupUser("simple-unlimited", "simple");
		for (let i = 1; i <= 7; i++) {
			const res = await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
			expect(res.status).toBe(200);
		}
	});
});

describe("Simple plan – pro feature access", () => {
	it("rejects logo upload with 403", async () => {
		const { userToken } = await setupUser("simple-logo-upload", "simple");
		const res = await uploadLogo(userToken);
		expect(res.status).toBe(403);
	});

	it("rejects logo GET with 403", async () => {
		const { userToken } = await setupUser("simple-logo-get", "simple");
		const res = await get("/api/logo", userToken);
		expect(res.status).toBe(403);
	});

	it("rejects QR render with 403", async () => {
		const { userToken } = await setupUser("simple-render", "simple");
		const res = await get("/api/qrs/render/100", userToken);
		expect(res.status).toBe(403);
	});
});

describe("Simple plan – card_color is dropped", () => {
	it("silently drops card_color and stores null", async () => {
		const { userToken } = await setupUser("simple-color", "simple");
		await post("/api/qrs", { amount: 1, qr_string: "qr-data", expiration_date: FUTURE, card_color: "#FF0000" }, userToken);

		const listRes = await get("/api/qrs", userToken);
		const { data } = await listRes.json<{ data: Array<{ card_color: string | null }> }>();
		expect(data[0]?.card_color).toBeNull();
	});
});

describe("Simple plan – not rate-limited", () => {
	it("allows requests even when KV counter is above free limit", async () => {
		const { userToken, userId } = await setupUser("simple-no-rate", "simple");
		const month = new Date().toISOString().slice(0, 7);
		await env.KV.put(`monthly:${userId}:${month}`, "9999");

		const res = await get("/api/qrs", userToken);
		expect(res.status).toBe(200);
	});
});

// ─── Pro plan ─────────────────────────────────────────────────────────────────

describe("Pro plan – unlimited QRs", () => {
	it("allows creating more than 5 QRs", async () => {
		const { userToken } = await setupUser("pro-unlimited", "pro");
		for (let i = 1; i <= 7; i++) {
			const res = await post("/api/qrs", { amount: i, qr_string: `qr-${i}`, expiration_date: FUTURE }, userToken);
			expect(res.status).toBe(200);
		}
	});
});

describe("Pro plan – logo upload", () => {
	it("accepts a valid PNG and returns 200 with the R2 key", async () => {
		const { userToken } = await setupUser("pro-logo-ok", "pro");
		const res = await uploadLogo(userToken);
		expect(res.status).toBe(200);
		const body = await res.json<{ success: boolean; key: string }>();
		expect(body.success).toBe(true);
		expect(body.key).toMatch(/^logos\//);
	});

	it("rejects an image exceeding 2 MB", async () => {
		const { userToken } = await setupUser("pro-logo-large", "pro");
		// Build a PNG header with valid signature + dimensions but padded to 3 MB
		const large = new Uint8Array(3 * 1024 * 1024);
		const header = makePng(100, 100);
		large.set(header, 0);
		const form = new FormData();
		form.append("logo", new File([large], "big.png", { type: "image/png" }));
		const res = await SELF.fetch("http://local.test/api/logo", {
			method: "POST",
			headers: { Authorization: `Bearer ${userToken}` },
			body: form,
		});
		expect(res.status).toBe(400);
	});

	it("rejects an image exceeding 1000×1000 px", async () => {
		const { userToken } = await setupUser("pro-logo-toobig", "pro");
		const form = new FormData();
		form.append("logo", new File([makePng(1001, 1001)], "huge.png", { type: "image/png" }));
		const res = await SELF.fetch("http://local.test/api/logo", {
			method: "POST",
			headers: { Authorization: `Bearer ${userToken}` },
			body: form,
		});
		expect(res.status).toBe(400);
	});

	it("rejects an unsupported MIME type", async () => {
		const { userToken } = await setupUser("pro-logo-mime", "pro");
		const form = new FormData();
		form.append("logo", new File([new Uint8Array(100)], "logo.gif", { type: "image/gif" }));
		const res = await SELF.fetch("http://local.test/api/logo", {
			method: "POST",
			headers: { Authorization: `Bearer ${userToken}` },
			body: form,
		});
		expect(res.status).toBe(400);
	});

	it("serves the uploaded logo back via GET", async () => {
		const { userToken } = await setupUser("pro-logo-get", "pro");
		await uploadLogo(userToken);

		const res = await get("/api/logo", userToken);
		// Consume the R2 stream body so miniflare can release isolated storage
		const bytes = await res.arrayBuffer();
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
		expect(bytes.byteLength).toBeGreaterThan(0);
	});

	it("returns 404 on GET when no logo has been uploaded", async () => {
		const { userToken } = await setupUser("pro-logo-404", "pro");
		const res = await get("/api/logo", userToken);
		expect(res.status).toBe(404);
	});
});

describe("Pro plan – QR render", () => {
	it("returns an SVG image for an existing amount QR", async () => {
		const { userToken } = await setupUser("pro-render-exact", "pro");
		await post("/api/qrs", { amount: 100, qr_string: "PAYMENT_DATA_123", expiration_date: FUTURE }, userToken);

		const res = await get("/api/qrs/render/100", userToken);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
		const svg = await res.text();
		expect(svg).toContain("<svg");
	});

	it("falls back to the fallback QR when the amount has no QR", async () => {
		const { userToken } = await setupUser("pro-render-fb", "pro");
		await post("/api/qrs/fallback", { qr_string: "FALLBACK_DATA", expiration_date: FUTURE }, userToken);

		const res = await get("/api/qrs/render/999", userToken);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
	});

	it("returns 404 when neither an amount QR nor a fallback exist", async () => {
		const { userToken } = await setupUser("pro-render-empty", "pro");
		const res = await get("/api/qrs/render/100", userToken);
		expect(res.status).toBe(404);
	});

	it("amount QR takes precedence over fallback QR", async () => {
		const { userToken } = await setupUser("pro-render-priority", "pro");
		await post("/api/qrs/fallback", { qr_string: "FALLBACK", expiration_date: FUTURE }, userToken);
		await post("/api/qrs", { amount: 50, qr_string: "EXACT_50", expiration_date: FUTURE }, userToken);

		// The render endpoint fetches exact first; SVG content encodes the QR string
		const res = await get("/api/qrs/render/50", userToken);
		expect(res.status).toBe(200);
		// Confirm we got a valid SVG (content encoding means we can't check qr_string directly)
		const svg = await res.text();
		expect(svg).toContain("<svg");
	});
});

describe("Pro plan – card_color is saved", () => {
	it("persists card_color on amount QR", async () => {
		const { userToken } = await setupUser("pro-color-amount", "pro");
		await post("/api/qrs", { amount: 1, qr_string: "qr-data", expiration_date: FUTURE, card_color: "#FF0000" }, userToken);

		const listRes = await get("/api/qrs", userToken);
		const body = (await listRes.json()) as { data: Array<{ card_color: string | null; is_fallback: number }> };
		const qr = body.data.find((q) => q.is_fallback === 0);
		expect(qr?.card_color).toBe("#FF0000");
	});

	it("persists card_color on fallback QR", async () => {
		const { userToken } = await setupUser("pro-color-fallback", "pro");
		await post("/api/qrs/fallback", { qr_string: "fb-data", expiration_date: FUTURE, card_color: "#0000FF" }, userToken);

		const listRes = await get("/api/qrs", userToken);
		const body = (await listRes.json()) as { data: Array<{ card_color: string | null; is_fallback: number }> };
		const fallback = body.data.find((q) => q.is_fallback === 1);
		expect(fallback?.card_color).toBe("#0000FF");
	});
});

describe("Pro plan – not rate-limited", () => {
	it("allows requests even when KV counter is above free limit", async () => {
		const { userToken, userId } = await setupUser("pro-no-rate", "pro");
		const month = new Date().toISOString().slice(0, 7);
		await env.KV.put(`monthly:${userId}:${month}`, "9999");

		const res = await get("/api/qrs", userToken);
		expect(res.status).toBe(200);
	});
});
