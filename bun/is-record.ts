/**
 * A plain object: not `null`, not a list. Its own module so the policy check
 * and sync read it without importing a hook.
 */
export const isRecord = (value: unknown): value is Record<string, never> =>
	!!value && typeof value === "object" && !Array.isArray(value);
