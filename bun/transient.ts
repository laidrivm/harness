/**
 * What a transient failure is (`retry-on-transient`): one the next tick may
 * not meet, which ends a pass `retry` rather than pausing the clone. A caller
 * that knows the status classifies it there and throws `Transient`; nothing
 * reads a message the runner itself printed.
 */

/** A failure the next tick may not meet: no answer, a timeout, a 5xx or a 429. */
export class Transient extends Error {}

/** `EX_TEMPFAIL` from `sysexits.h`: what a pass ended `retry` and the mint's transient failure exit. */
export const TEMPFAIL = 75;

/** How a session's result opens on the subscription's usage limit, which is never transient: `loop-every-stage`'s `limited`. */
export const LIMITED = "You've hit your";

/** Whether an answered call's status is transient: 5xx, or 429. */
export const answered = (status: number) => (status >= 500 && status <= 599) || status === 429;

/**
 * Whether a failed `git fetch` or `git push` met the network, read from its
 * stderr, the only structure git gives. A 4xx other than 429 anywhere wins
 * first, since git prints `RPC failed` or `early EOF` beside a permanent
 * rejection too.
 */
export function network(stderr: string) {
	if (/\b(?:HTTP(?: status)?|returned error:) 4(?!29)\d\d\b/.test(stderr)) return false;
	return /Could not resolve (?:host|proxy)|Failed to connect|timed out|Connection (?:refused|reset)|returned error: (?:5\d\d|429)\b|RPC failed|early EOF|unexpected disconnect|Empty reply from server/.test(
		stderr,
	);
}
