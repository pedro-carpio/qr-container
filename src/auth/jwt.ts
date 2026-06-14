const ALG = { name: "HMAC", hash: "SHA-256" };

function b64url(buf: ArrayBuffer | Uint8Array): string {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromB64url(s: string): Uint8Array {
	return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

async function getKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), ALG, false, ["sign", "verify"]);
}

export async function signJWT(
	payload: Record<string, unknown>,
	secret: string,
	expiresInSeconds?: number,
): Promise<string> {
	const enc = new TextEncoder();
	const now = Math.floor(Date.now() / 1000);
	const fullPayload = expiresInSeconds ? { ...payload, iat: now, exp: now + expiresInSeconds } : payload;
	const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
	const body = b64url(enc.encode(JSON.stringify(fullPayload)));
	const key = await getKey(secret);
	const sig = await crypto.subtle.sign(ALG, key, enc.encode(`${header}.${body}`));
	return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown>> {
	const parts = token.split(".");
	if (parts.length !== 3) throw new Error("Invalid token format");
	const key = await getKey(secret);
	const valid = await crypto.subtle.verify(
		ALG,
		key,
		fromB64url(parts[2]),
		new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
	);
	if (!valid) throw new Error("Invalid token signature");
	const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
	if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error("Token expired");
	return payload;
}
