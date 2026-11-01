/**
 * The release of a card's `Assign` that `bun/work.ts status`, `take` and
 * `finish --card` run (task-board, *The work commands release `Assign` when
 * nothing waits*), and the page read, cap and write it shares with the
 * runner's `unassign()`
 * (`openspec/changes/archive/2026-11-01-notion-ask-sets-assign/design.md`,
 * *Releasing `Assign`*). No call is retried, and no line holds the token.
 */
import { type Call, discussion, hex, waits } from "./notion-bot.ts";

/** How a line opens when a call failed or `Assign` was too long to read whole: the user may still be on `Assign`. */
export const UNASSIGN_FAILED = "assign: failed —";

type Person = { id: unknown };
/** An `Assign` as a PATCH's answer or a page read holds it: untrusted, so read where it is used. */
type Paged = { properties?: { Assign?: { people?: unknown } } } | undefined;

const people = (page: Paged): Person[] | undefined => {
	const listed = page?.properties?.Assign?.people;
	return Array.isArray(listed) ? listed : undefined;
};
const holds = (listed: Person[] | undefined, user: string) => listed?.some((p) => hex(p?.id) === hex(user)) ?? false;
const write = (call: Call, card: string, kept: { id: unknown }[]) =>
	call("the Assign write", `/v1/pages/${card}`, "PATCH", { properties: { Assign: { people: kept } } }) as Promise<Paged>;

/**
 * Reads `card`'s `Assign` and, once `go` agrees with the list read, writes it
 * back without `user`, keeping everyone else, and reads the user's absence
 * back from Notion's answer, for every caller, `unassign()` included (the
 * user's answer 11 b). Returns `true` once written and read back, `false`
 * when `go` declined; throws naming the step, at 25 people, the most a page
 * read lists, or when the answer still holds the user or lists no `Assign`.
 * `go` is asked first, so a card it declines never reads as failed for its
 * length.
 */
export async function release(call: Call, card: string, user: string, go: (listed: Person[]) => Promise<boolean> = async () => true) {
	const listed = people(await call("the page read", `/v1/pages/${card}`)) ?? [];
	if (!(await go(listed))) return false;
	// shortcut: a page read lists 25 references of a property at most, so a longer `Assign` is left whole rather than written back cut; page through `/v1/pages/<id>/properties/<property>` if a card ever needs it.
	if (listed.length >= 25) throw new Error(`${card} lists 25 people on Assign, the most a page read returns`);
	let now: Person[] | undefined;
	try {
		now = people(await write(call, card, without(listed, user)));
	} catch (error) {
		throw new AtWrite((error as Error).message);
	}
	if (!now || holds(now, user)) throw new AtWrite("the Assign write did not remove the user");
	return true;
}
const without = (listed: Person[], user: string) => listed.filter((p) => hex(p?.id) !== hex(user)).map((p) => ({ id: p.id }));

/** A `release()` failure at or after its write, which may have landed, unlike one before it. */
export class AtWrite extends Error {}

/** Whether a question or a `harness-pause` notice waits on `card` for `user`, read with no integration id. */
async function open(call: Call, card: string, user: string) {
	const comments = await discussion(call, card);
	return waits(comments, user) || waits(comments, user, undefined, "harness-pause");
}

/**
 * What `cleared()` did: the line to print, none when it wrote nothing; `back`,
 * `waits` when its own reads found a question or a pause notice, whether it
 * then wrote nothing or put the user back, and `unread` when its second read
 * failed; and whether a restore failed.
 */
export type Cleared = { line?: string; back?: "waits" | "unread"; restoreFailed: boolean };

/**
 * Removes `user` from `card`'s `Assign` when it holds them and nothing waits,
 * then reads the comments again and puts the user back when something now
 * waits or that read failed. The second read follows any write that may have
 * landed, its answer read back or not, so a question posted meanwhile keeps
 * the user whatever the write answered. A failed restore leaves a question
 * with no one on `Assign`.
 */
export async function cleared(call: Call, card: string, user: string): Promise<Cleared> {
	const failed = (why: string, restoreFailed = false): Cleared => ({ line: `${UNASSIGN_FAILED} ${why}`, restoreFailed });
	let listed: Person[] = [];
	let waiting = false;
	let fault: string | undefined;
	try {
		const done = await release(call, card, user, async (read) => {
			listed = read;
			if (!holds(read, user)) return false;
			waiting = await open(call, card, user);
			return !waiting;
		});
		// `back`, so `finish` keeps the draft for what this read found after its own.
		if (!done) return waiting ? { back: "waits", restoreFailed: false } : { restoreFailed: false };
	} catch (error) {
		// Before the write, nothing changed; at it, the write may have landed.
		if (!(error instanceof AtWrite)) return failed((error as Error).message);
		fault = (error as Error).message;
	}
	let back: Cleared["back"];
	try {
		back = (await open(call, card, user)) ? "waits" : undefined;
	} catch {
		// Unread is the side that keeps a question visible.
		back = "unread";
	}
	if (!back) return fault ? failed(fault) : { line: `assign: removed the user from ${card}`, restoreFailed: false };
	// The release's own fault first, so a restore that fails as the release did names both.
	const before = fault ? `${fault}; ` : "";
	try {
		if (!holds(people(await write(call, card, [...without(listed, user), { id: user }])), user))
			return failed(`${before}the restore did not hold the user`, true);
	} catch (error) {
		return failed(`${before}the restore: ${(error as Error).message}`, true);
	}
	return { line: `assign: restored the user on ${card}`, back, restoreFailed: false };
}
