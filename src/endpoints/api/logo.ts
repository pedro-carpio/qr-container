import { OpenAPIRoute } from "chanfana";
import type { AppContext } from "../../types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_DIMENSION = 1000; // pixels

function getImageDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
	const bytes = new Uint8Array(buffer);
	const view = new DataView(buffer);

	// PNG: signature \x89PNG\r\n\x1a\n, then IHDR chunk with width at offset 16
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		if (bytes.length < 24) return null;
		return {
			width: view.getUint32(16, false),
			height: view.getUint32(20, false),
		};
	}

	// JPEG: starts with \xFF\xD8, scan for SOF markers
	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		let offset = 2;
		while (offset < bytes.length - 8) {
			if (bytes[offset] !== 0xff) break;
			const marker = bytes[offset + 1];
			const segLen = view.getUint16(offset + 2, false);
			// SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15
			if (
				(marker >= 0xc0 && marker <= 0xc3) ||
				(marker >= 0xc5 && marker <= 0xc7) ||
				(marker >= 0xc9 && marker <= 0xcb) ||
				(marker >= 0xcd && marker <= 0xcf)
			) {
				return {
					height: view.getUint16(offset + 5, false),
					width: view.getUint16(offset + 7, false),
				};
			}
			offset += 2 + segLen;
		}
		return null;
	}

	// WebP: RIFF....WEBP header
	if (
		bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
		bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
	) {
		if (bytes.length < 30) return null;
		const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
		if (chunk === "VP8 ") {
			// Lossy: width/height at offsets 26-29 as 14-bit values
			return {
				width: (view.getUint16(26, true) & 0x3fff) + 1,
				height: (view.getUint16(28, true) & 0x3fff) + 1,
			};
		}
		if (chunk === "VP8L") {
			// Lossless: packed 28-bit values starting at offset 21
			const bits = view.getUint32(21, true);
			return {
				width: (bits & 0x3fff) + 1,
				height: ((bits >> 14) & 0x3fff) + 1,
			};
		}
		if (chunk === "VP8X") {
			// Extended: canvas width/height as 24-bit LE at offsets 24 and 27
			return {
				width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
				height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
			};
		}
		return null;
	}

	return null;
}

export class LogoUpload extends OpenAPIRoute {
	schema = {
		tags: ["Logo"],
		summary: "Upload logo image (pro plan only, multipart/form-data with 'logo' field)",
		security: [{ bearerAuth: [] }],
		responses: {
			"200": { description: "Logo uploaded successfully" },
			"400": { description: "Invalid image (type, size, or dimensions)" },
			"403": { description: "Pro plan required" },
		},
	};

	async handle(c: AppContext) {
		let file: File | null = null;
		try {
			const form = await c.req.formData();
			const field = form.get("logo");
			if (field instanceof File) file = field;
		} catch {
			return c.json(
				{ success: false, errors: [{ code: 400, message: "Request must be multipart/form-data with a 'logo' field" }] },
				400,
			);
		}

		if (!file) {
			return c.json(
				{ success: false, errors: [{ code: 400, message: "'logo' file field is required" }] },
				400,
			);
		}

		if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
			return c.json(
				{ success: false, errors: [{ code: 400, message: "Image must be JPEG, PNG, or WebP" }] },
				400,
			);
		}

		if (file.size > MAX_SIZE_BYTES) {
			return c.json(
				{ success: false, errors: [{ code: 400, message: "Image must be under 2 MB" }] },
				400,
			);
		}

		const buffer = await file.arrayBuffer();
		const dims = getImageDimensions(buffer);

		if (!dims) {
			return c.json(
				{ success: false, errors: [{ code: 400, message: "Could not read image dimensions" }] },
				400,
			);
		}

		if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
			return c.json(
				{
					success: false,
					errors: [{ code: 400, message: `Image dimensions must not exceed ${MAX_DIMENSION}×${MAX_DIMENSION} px (got ${dims.width}×${dims.height})` }],
				},
				400,
			);
		}

		const user_id = c.get("user_id");
		const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
		const key = `logos/${user_id}.${ext}`;

		await Promise.all([
			c.env.LOGOS.put(key, buffer, { httpMetadata: { contentType: file.type } }),
			c.env.DB.prepare("UPDATE users SET logo_ext = ? WHERE id = ?").bind(ext, user_id).run(),
		]);

		return c.json({ success: true, key });
	}
}

export class LogoGet extends OpenAPIRoute {
	schema = {
		tags: ["Logo"],
		summary: "Get current user's logo (pro plan only)",
		security: [{ bearerAuth: [] }],
		responses: {
			"200": { description: "Logo image" },
			"403": { description: "Pro plan required" },
			"404": { description: "No logo uploaded" },
		},
	};

	async handle(c: AppContext) {
		const user_id = c.get("user_id");

		// Try each supported extension
		for (const ext of ["jpg", "png", "webp"]) {
			const obj = await c.env.LOGOS.get(`logos/${user_id}.${ext}`);
			if (obj) {
				const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
				return new Response(obj.body, {
					headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
				});
			}
		}

		return c.json(
			{ success: false, errors: [{ code: 404, message: "No logo uploaded" }] },
			404,
		);
	}
}
