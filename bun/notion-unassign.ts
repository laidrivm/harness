/**
 * The pick's `CARD:` line and the `Assign` write that removes the user once a
 * board-loop pass reads a draft's answer (`draft-until-answered`), with the
 * integration's settings and calls from `notion-bot.ts`, split from it at its
 * line cap, and the page read and write `release()` in `notion-release.ts`
 * shares with the work commands. The token reaches `fetch` only as a header.
 */
import { carded, client, ID, type Settings } from "./notion-bot.ts";
import { release, UNASSIGN_FAILED } from "./notion-release.ts";

export { UNASSIGN_FAILED };

/** The card a pick session's final message names in its one `CARD:` line, or why it names none. Untrusted, as `PICK:` is. */
export function pickedCard(said: string): { card: string } | string {
	const [line, ...more] = said.split("\n").filter((line) => line.startsWith("CARD:"));
	if (line === undefined || more.length) return "the pick session returned not one CARD: line";
	const card = line.slice("CARD:".length).trim();
	return ID.test(card) ? { card } : "the CARD: line names no card id";
}

/**
 * Removes the user alone from `card`'s `Assign` once steps 1 and 2 find it the
 * carried change's card on `board`: the pass has read the answer. Returns the
 * line the runner prints, opening with `UNASSIGN_FAILED` when a call failed
 * or `Assign` is too long to read whole; no call is retried. Not `assign()`,
 * which sets the user alone: this write keeps everyone else.
 */
export async function unassign(
	{ token, user }: Settings,
	card: string,
	{ board, slug }: { board: string; slug: string },
	timeout = 30_000,
): Promise<string> {
	const call = client(token, timeout);
	try {
		const why = await carded(call, card, board, slug);
		if (why) return `assign: not written — ${why}`;
		await release(call, card, user);
	} catch (error) {
		return `${UNASSIGN_FAILED} ${(error as Error).message}`;
	}
	return `assign: removed the user from ${card}`;
}
