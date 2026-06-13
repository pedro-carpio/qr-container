export async function cleanup(env: Env): Promise<void> {
	const now = new Date();

	const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
	await env.DB.prepare("DELETE FROM qrs WHERE expiration_date < ?")
		.bind(thirtyDaysAgo)
		.run();

	const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
	await env.DB.prepare("DELETE FROM users WHERE is_fully_registered = 0 AND created_at < ?")
		.bind(sixtyDaysAgo)
		.run();
}
