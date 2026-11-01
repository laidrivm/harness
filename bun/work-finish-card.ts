/**
 * `finish --card`'s record on the card: the card's `Pointer` names the one
 * change directory the branch adds files to against its merge base with
 * `origin/main`, and its pull request is linked under `Ссылки`
 * (`openspec/changes/finish-writes-card/design.md`). Each write is made only
 * where it is missing, so a rerun after a failure finishes the job; every
 * failure throws naming its step.
 */
import { board } from "./board-state.ts";
import { type Call, paged, plain } from "./notion-bot.ts";
import { named } from "./work-status.ts";
import { output } from "./work-take.ts";

const git = (top: string, step: string, ...args: string[]) => {
	try {
		return output(["git", ...args], top, { ...process.env, GIT_TERMINAL_PROMPT: "0" });
	} catch (error) {
		throw new Error(`${step} failed: ${(error as Error).message}`);
	}
};

/** The change directories, sorted, the branch at `top` adds a file to since its merge base with `origin/main`, fetched first. */
export function added(top: string): string[] {
	// The refspec named, as `work-status.ts` fetches, so a single-branch clone still moves origin/main.
	git(top, "the fetch of origin/main", "fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main");
	const base = git(top, "the merge base with origin/main", "merge-base", "refs/remotes/origin/main", "HEAD").trim();
	// `--no-renames`: an archive reads as its new files added, whatever `diff.renames` says.
	const paths = git(top, "the branch's diff", "diff", "--name-only", "--diff-filter=A", "--no-renames", base, "HEAD", "--", "openspec/changes/");
	const dirs = paths.split("\n").flatMap((path) => {
		const [, , first, second, ...rest] = path.split("/");
		if (first === "archive") return second && rest.length ? [`openspec/changes/archive/${second}/`] : [];
		return first && second ? [`openspec/changes/${first}/`] : [];
	});
	return [...new Set(dirs)].sort();
}

/** The link's kind: `proposal` for a change outside `archive/`, else `archive` for one inside it, else `apply`. */
export const kind = (dirs: string[]) =>
	dirs.some((d) => !d.startsWith("openspec/changes/archive/")) ? "proposal" : dirs.length ? "archive" : "apply";

type Page = { parent?: { data_source_id?: unknown }; properties?: { Pointer?: { rich_text?: unknown } } } | undefined;
type Block = { id?: unknown; type?: unknown; [type: string]: unknown };
const runs = (block: Block) => (block[String(block.type)] as { rich_text?: unknown } | undefined)?.rich_text;
const links = (block: Block, url: string) => {
	const all = runs(block);
	return Array.isArray(all) && all.some((run) => run?.href === url || run?.text?.link?.url === url);
};
const LIST = "bulleted_list_item";
const anchor = (block: Block) =>
	/^(paragraph|heading_[123])$/.test(String(block.type)) && plain(runs(block)).trim().replace(/:$/, "").trim() === "Ссылки";

/** Writes the Pointer `dirs` give the card `page` read, read back, and returns the line saying so, or why nothing is written. */
async function pointer(call: Call, card: string, top: string, dirs: string[], page: Page): Promise<string> {
	if (dirs.length !== 1)
		return `finish: the branch adds files to ${dirs.length ? `${dirs.length} change directories` : "no change directory"}, so the Pointer is left`;
	const [dir] = dirs;
	const raw = plain(page?.properties?.Pointer?.rich_text);
	const name = named(top);
	const prefix = name && raw.startsWith(`${name}: `) ? `${name}: ` : "";
	const path = raw.slice(prefix.length);
	if (path === dir) return `finish: the Pointer already names ${dir}`;
	const slug = /^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-(.+)\/$/.exec(dir)?.[1];
	if (path && path !== `openspec/changes/${slug}/`) return `finish: the Pointer reads "${raw}", not ${dir}, so it is left`;
	let to = `${prefix}${dir}`;
	if (!path) {
		const source = await call("the board read", `/v1/data_sources/${page?.parent?.data_source_id}`);
		if (plain(source?.title) !== board(top)) {
			// A card for this repository's change on another board points across (task-board).
			if (!name) throw new Error("the Pointer write needs package.json's name for another board's card");
			to = `${name}: ${dir}`;
		}
	}
	const written = await call("the Pointer write", `/v1/pages/${card}`, "PATCH", { properties: { Pointer: { rich_text: [{ text: { content: to } }] } } });
	// Notion's answer, not `to`: the read-back.
	const now = plain(written?.properties?.Pointer?.rich_text);
	if (now !== to) throw new Error(`the Pointer write read back "${now}", not ${to}`);
	return `finish: Pointer set to ${now}`;
}

/** Writes the card's `Pointer` and its link to `pull`, each where missing, and returns `finish`'s lines; throws naming the step. */
export async function recorded(call: Call, card: string, top: string, pull: { number: number; url: string }): Promise<string[]> {
	const dirs = added(top);
	const page = await call("the page read", `/v1/pages/${card}`);
	// The Pointer first: a refused append still leaves what `work.ts status` needs past proposing.
	const lines = [await pointer(call, card, top, dirs, page)];
	const blocks = await paged<Block>(call, "the block read", `/v1/blocks/${card}/children`);
	if (blocks.some((block) => links(block, pull.url))) return [...lines, `finish: #${pull.number} is already linked on the card`];
	const k = kind(dirs);
	const item = {
		type: LIST,
		[LIST]: { rich_text: [{ type: "text", text: { content: `#${pull.number}`, link: { url: pull.url } } }, { type: "text", text: { content: ` — ${k}` } }] },
	};
	const at = blocks.findIndex(anchor);
	let body: object;
	if (at === -1) {
		const heading = { type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Ссылки" }, annotations: { bold: true } }] } };
		body = { children: [heading, item] };
	} else {
		// The run of items directly under the anchor; a later section's bullets are not it.
		let last = at;
		while (blocks[last + 1]?.type === LIST) last++;
		body = { after: blocks[last].id, children: [item] };
	}
	await call("the link's append", `/v1/blocks/${card}/children`, "PATCH", body);
	return [...lines, `finish: #${pull.number} linked under Ссылки as ${k}`];
}
