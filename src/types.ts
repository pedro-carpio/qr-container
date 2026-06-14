import type { Context } from "hono";

export type Variables = {
	user_id: string;
	company_name: string | null;
	is_fully_registered: number;
	benefits: "free" | "simple" | "pro";
};

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
export type HandleArgs = [AppContext];
