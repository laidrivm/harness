/**
 * `finish --card`'s record on the card: the card's `Pointer` names the one
 * change directory the branch adds files to against its merge base with
 * `origin/main`, and its pull request is linked under `Ссылки`
 * (`openspec/changes/archive/2026-11-01-finish-writes-card/design.md`). Each write is made only
 * where it is missing, so a rerun after a failure finishes the job; every
 * failure throws naming its step.
 */
import { ARCHIVED, board } from "./board-state.ts";
import { across, named } from "./config.ts";
import { type Call, paged, plain } from "./notion-bot.ts";
import { MAIN, output } from "./work-take.ts";

const git = (top: string, step: string, ...args: string[]) => {
	try {
		return output(["git", ...args], top, { ...process.env, GIT_TERMINAL_PROMPT: "0" });
	} catch (error) {
		throw new Error(`${step} failed: ${(error as Error).message}`);
	}
};

/** The paths under `openspec/changes/` the branch at `top` adds since its merge base with `origin/main`, fetched first. */
export function added(top: string): string[] {
	git(top, "the fetch of origin/main", "fetch", "-q", "origin", MAIN);
	const base = git(top, "the merge base with origin/main", "merge-base", "refs/remotes/origin/main", "HEAD").trim();
	// `--no-renames`: an archive reads as its new files added, whatever `diff.renames` says; `-z`: paths unquoted.
	const paths = git(
		top,
		"the branch's diff",
		"diff",
		"-z",
		"--name-only",
		"--diff-filter=A",
		"--no-renames",
		base,
		"HEAD",
		"--",
		"openspec/changes/",
	);
	return paths.split("\0").filter(Boolean);
}

/** The change directories, sorted, that `paths` add files to: `openspec/changes/<slug>/` or `openspec/changes/archive/<dir>/`. */
export function changes(paths: string[]): string[] {
	const dirs = paths.flatMap((path) => {
		const [, , first, second, ...rest] = path.split("/");
		if (first === "archive") return second && rest.length ? [`openspec/changes/archive/${second}/`] : [];
		return first && second ? [`openspec/changes/${first}/`] : [];
	});
	return [...new Set(dirs)].sort();
}

/**
 * The link's kind (the user's answer 2 b, 2026-11-01): `proposal` when `paths`
 * add a change's `proposal.md`, `design.md` or `tasks.md` outside `archive/`,
 * else `archive` when they add to an archived change, else `apply`.
 */
export function kind(paths: string[]): string {
	if (paths.some((path) => /^openspec\/changes\/(?!archive\/)[^/]+\/(proposal|design|tasks)\.md$/.test(path)))
		return "proposal";
	return changes(paths).some((dir) => dir.startsWith("openspec/changes/archive/")) ? "archive" : "apply";
}

type Page = { parent?: { data_source_id?: unknown }; properties?: { Pointer?: { rich_text?: unknown } } } | undefined;
type Block = { id?: unknown; type?: unknown; [type: string]: unknown };
const content = (block: Block) => block[String(block.type)] as { rich_text?: unknown; url?: unknown } | undefined;
const runs = (block: Block) => content(block)?.rich_text;
/** Whether `href` is the pull request `url`, in any case, or a page of it (`/files`, `#…`). */
const same = (href: unknown, url: string) =>
	typeof href === "string" &&
	href.toLowerCase().startsWith(url.toLowerCase()) &&
	/^([/#?]|$)/.test(href.slice(url.length));
/** Whether a top-level block links `url`: a run of its text, or a bookmark's or a preview's own URL; nested blocks are not read. */
const links = (block: Block, url: string) => {
	const all = runs(block);
	return (
		same(content(block)?.url, url) ||
		(Array.isArray(all) && all.some((run) => same(run?.href, url) || same(run?.text?.link?.url, url)))
	);
};
const LIST = "bulleted_list_item";
const blank = (block: Block) => block.type === "paragraph" && !plain(runs(block)).trim();
const anchor = (block: Block) =>
	/^(paragraph|heading_[123])$/.test(String(block.type)) &&
	plain(runs(block)).trim().replace(/:$/, "").trim() === "Ссылки";

/** Writes the Pointer `dirs` give the card `page` read, read back, and returns the line saying so, or why nothing is written. */
async function pointer(call: Call, card: string, top: string, dirs: string[], page: Page): Promise<string> {
	if (dirs.length !== 1)
		return `finish: the branch adds files to ${dirs.length ? `${dirs.length} change directories` : "no change directory"}, so the Pointer is left`;
	const [dir] = dirs;
	const raw = plain(page?.properties?.Pointer?.rich_text);
	const { prefix, path } = across(top, raw);
	if (path === dir) return `finish: the Pointer already names ${dir}`;
	const slug = ARCHIVED.exec(/^openspec\/changes\/archive\/([^/]+)\/$/.exec(dir)?.[1] ?? "")?.[1];
	if (path && path !== `openspec/changes/${slug}/`)
		return `finish: the Pointer reads "${raw}", not ${dir}, so it is left`;
	let to = `${prefix}${dir}`;
	if (!path) {
		const source = await call("the board read", `/v1/data_sources/${page?.parent?.data_source_id}`);
		if (plain(source?.title) !== board(top)) {
			// A card for this repository's change on another board points across (task-board).
			const name = named(top);
			if (!name) throw new Error("the Pointer write needs package.json's name for another board's card");
			to = `${name}: ${dir}`;
		}
	}
	const written = await call("the Pointer write", `/v1/pages/${card}`, "PATCH", {
		properties: { Pointer: { rich_text: [{ text: { content: to } }] } },
	});
	// Notion's answer, not `to`: the read-back.
	const now = plain(written?.properties?.Pointer?.rich_text);
	if (now !== to) throw new Error(`the Pointer write read back "${now}", not ${to}`);
	return `finish: Pointer set to ${now}`;
}

/** Writes the card's `Pointer` and its link to `pull`, each where missing, and returns `finish`'s lines; throws naming the step. */
export async function recorded(
	call: Call,
	card: string,
	top: string,
	pull: { number: number; url: string },
): Promise<string[]> {
	let paths: string[];
	try {
		paths = added(top);
	} catch (error) {
		// Nothing is written under a kind or a Pointer the history cannot tell, a shallow clone's case (the user's answer 1 c, 2026-11-01).
		return [
			`finish: could not tell the branch's change, so the card's Pointer and link are left — ${(error as Error).message}`,
		];
	}
	const dirs = changes(paths);
	const page = await call("the page read", `/v1/pages/${card}`);
	if (page?.parent?.type !== "data_source_id") throw new Error(`${card} is not a card on a board`);
	// The Pointer first: a refused append still leaves what `work.ts status` needs past proposing.
	const lines = [await pointer(call, card, top, dirs, page)];
	const blocks = await paged<Block>(call, "the block read", `/v1/blocks/${card}/children`);
	if (blocks.some((block) => links(block, pull.url)))
		return [...lines, `finish: #${pull.number} is already linked on the card`];
	const k = kind(paths);
	const item = {
		type: LIST,
		[LIST]: {
			rich_text: [
				{ type: "text", text: { content: `#${pull.number}`, link: { url: pull.url } } },
				{ type: "text", text: { content: ` — ${k}` } },
			],
		},
	};
	const at = blocks.findIndex(anchor);
	let body: object;
	if (at === -1) {
		const heading = {
			type: "paragraph",
			paragraph: { rich_text: [{ type: "text", text: { content: "Ссылки" }, annotations: { bold: true } }] },
		};
		body = { children: [heading, item] };
	} else {
		// The run of items under the anchor, blank paragraphs inside it skipped; a later section's bullets are not it.
		let last = at;
		for (let i = at + 1; i < blocks.length && (blocks[i].type === LIST || blank(blocks[i])); i++)
			if (blocks[i].type === LIST) last = i;
		body = { after: blocks[last].id, children: [item] };
	}
	await call("the link's append", `/v1/blocks/${card}/children`, "PATCH", body);
	return [...lines, `finish: #${pull.number} linked under Ссылки as ${k}`];
}
