// Augments the generated Env interface with bindings not yet in worker-configuration.d.ts
interface Env {
	KV: KVNamespace;
	WORKER_SECRET: string;
}
