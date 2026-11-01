/**
 * What a count owes the floor a consumer declares under `harness.<key>` — the
 * one rule behind `harness.mutationFloor` and `harness.uncitedFloor`, so the
 * two cannot drift apart.
 *
 * Both directions fail: a rise admits something nothing checks, and a floor
 * left above reality stops being a measurement. The reason is demanded on every
 * run rather than only on a rise, because telling a rise from a drop needs the
 * previously committed value, and reading git history to decide whether to ask
 * is more machinery than one field.
 */

/** Where a floor sits and how its problems read. */
export type Floor = {
	/** The key under `harness` in `package.json`. */
	key: string;
	/** The field under it holding the number. */
	field: string;
	/** What the count counts, as a plural noun. */
	counted: string;
	/** How a count above the floor comes back down. */
	lower: string;
};

/**
 * `floor` and `why` are `unknown` because they come from a hand-edited
 * `package.json` that `bun/config.ts` checks only for presence: an absent
 * reason or a floor written as `"12"` is named here rather than thrown as a
 * `TypeError` or compared as never equal.
 */
export function gauge(
	at: Floor,
	count: number,
	floor: unknown,
	why: unknown,
): string[] {
	const problems: string[] = [];
	if (typeof why !== "string" || !why.trim())
		problems.push(
			`the floor states no reason — write why as text in harness.${at.key}.why`,
		);
	// `typeof` as well, since `Number.isInteger` does not narrow `unknown`; a
	// negative floor no count can equal would report a gain that is not one.
	if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 0)
		problems.push(`harness.${at.key}.${at.field} is not a whole number`);
	else if (count !== floor) {
		const gap = `${count} ${at.counted} against a floor of ${floor}`;
		problems.push(
			count > floor
				? `${gap} — ${at.lower}, or raise the floor and say why`
				: `${gap} — write ${count} as the floor, so the gain is recorded`,
		);
	}
	return problems;
}
