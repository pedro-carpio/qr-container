import type { D1Migration } from "cloudflare:test";

declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {
		MIGRATIONS: D1Migration[];
		DB: D1Database;
		KV: KVNamespace;
		LOGOS: R2Bucket;
	}
}
