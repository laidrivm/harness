/**
 * What a count owes the floor a consumer declares under `harness.<key>` — the
 * one rule behind `harness.mutationFloor` and `harness.uncitedFloor`, so the
 * two cannot drift apart — and what makes a counted entry with a reason
 * readable, which each approval of `harness.suppressions` is too.
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
 * True for a count a measurement can be compared against: a whole number, zero
 * or above. A fraction or a negative one no count can equal, and a gain would
 * be reported that is not one. A type guard, since `Number.isInteger` does not
 * narrow `unknown`.
 */
const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * What is wrong with a `{ <field>: count, why }` entry at `path` — a floor, or
 * one approval of `harness.suppressions` — in a hand-edited `package.json`
 * that `bun/config.ts` checks only for presence: an absent reason or a count
 * written as `"12"` is named here rather than thrown as a `TypeError` or
 * compared as never equal, or as `NaN`, which nothing exceeds.
 */
export function unreadable(path: string, field: string, count: unknown, why: unknown): string[] {
	return [
		...(typeof why === "string" && why.trim() ? [] : [`${path}.why gives no reason — write one as text`]),
		...(whole(count) ? [] : [`${path}.${field} is not a whole number`]),
	];
}

/** The gap between `count` and the floor, after what `unreadable` names. */
export function gauge(at: Floor, count: number, floor: unknown, why: unknown): string[] {
	const problems = unreadable(`harness.${at.key}`, at.field, floor, why);
	if (whole(floor) && count !== floor) {
		const gap = `${count} ${at.counted} against a floor of ${floor}`;
		problems.push(
			count > floor
				? `${gap} — ${at.lower}, or raise the floor and say why`
				: `${gap} — write ${count} as the floor, so the gain is recorded`,
		);
	}
	return problems;
}
