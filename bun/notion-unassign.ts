/**
 * The pick's `CARD:` line and the `Assign` write that removes the user once a
 * board-loop pass reads a draft's answer (`draft-until-answered`), with the
 * integration's settings and calls from `notion-bot.ts`: split from it at its
 * line cap. The token reaches `fetch` only as a header there.
 */
import { carded, client, hex, ID, type Settings } from "./notion-bot.ts";

/** The card a pick session's final message names in its one `CARD:` line, or why it names none. Untrusted, as `PICK:` is. */
export function pickedCard(said: string): { card: string } | string {
	const lines = said.split("\n").filter((line) => line.startsWith("CARD:"));
	if (lines.length !== 1) return "the pick session returned not one CARD: line";
	const card = lines[0].slice("CARD:".length).trim();
	return ID.test(card) ? { card } : "the CARD: line names no card id";
}

/** How `unassign()`'s line opens when a call failed or `Assign` was too long to read whole, unlike a card it refused: the user may still be on `Assign`. */
export const UNASSIGN_FAILED = "assign: failed —";

/**
 * Removes the user alone from `card`'s `Assign` once steps 1 and 2 find it the
 * carried change's card on `board`: the pass has read the answer. Returns the
 * line the runner prints, opening with `UNASSIGN_FAILED` when a call failed
 * or `Assign` is too long to read whole; no call is retried. Not `assign()`,
 * which sets the user alone: this write keeps everyone else.
 */
export async function unassign({ token, user }: Settings, card: string, { board, slug }: { board: string; slug: string }, timeout = 30_000): Promise<string> {
	const call = client(token, timeout);
	try {
		const why = await carded(call, card, board, slug);
		if (why) return `assign: not written — ${why}`;
		const people = (await call("the page read", `/v1/pages/${card}`))?.properties?.Assign?.people;
		// shortcut: a page read lists 25 references of a property at most, so a longer `Assign` is left whole rather than written back cut; page through `/v1/pages/<id>/properties/<property>` if a card ever needs it.
		if (Array.isArray(people) && people.length >= 25) return `${UNASSIGN_FAILED} ${card} lists 25 people on Assign, the most a page read returns`;
		const kept = (Array.isArray(people) ? people : []).filter((p) => hex(p?.id) !== hex(user)).map((p) => ({ id: p.id }));
		await call("the Assign write", `/v1/pages/${card}`, "PATCH", { properties: { Assign: { people: kept } } });
	} catch (error) {
		return `${UNASSIGN_FAILED} ${(error as Error).message}`;
	}
	return `assign: removed the user from ${card}`;
}
