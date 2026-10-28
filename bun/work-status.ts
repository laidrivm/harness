/**
 * `work.ts status --card <id> --to <status>`: writes a card's `Status` through
 * the ask integration once its checks pass, in the order
 * `openspec/changes/notion-status-gate/design.md` sets (*The order of checks
 * and the write*): the user's statuses, the page read, the evidence on
 * `origin/main` for a merged status, the WIP limit for an unproven entry into
 * the range. Each refusal writes nothing in Notion and is one `status` record;
 * a failed write records nothing.
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARCHIVED, boardState, ORDER } from "./board-state.ts";
import { record } from "./gate-ledger.ts";
import { integration } from "./notion-ask.ts";
import { plain } from "./notion-bot.ts";
import { complete, groups } from "./turn-gate.ts";
import { POINTER } from "./work-take.ts";

/** The eleven statuses task-board defines, which `--to` names one of. */
export const STATUSES = [...ORDER, "discarded"];
const USER_ONLY = ["idea", "approved", "discarded"];
/** `exploring` … `archiving`, which the WIP limit holds. */
const RANGE = ORDER.slice(ORDER.indexOf("exploring"), ORDER.indexOf("done"));
const MERGED = ["proposed", "applied", "done"];
const ARCHIVE = /^openspec\/changes\/archive\/([^/]+)\/$/;

/** A refusal under the ledger id `id`. */
class Refusal extends Error {
	constructor(
		readonly id: string,
		message: string,
	) {
		super(message);
	}
}

/** `git …args` in `cwd`, its output without git's terminator, or a refusal under `unread`. */
function git(cwd: string, ...args: string[]): string {
	const run = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	const said = run.stderr.toString().trim().split("\n")[0];
	if (run.exitCode !== 0) throw new Refusal("unread", `git ${args[0]} exited ${run.exitCode}${said ? `: ${said}` : ""}`);
	return run.stdout.toString().replace(/\n$/, "");
}

/** The `name` of `top`'s `package.json`, or `undefined`. */
function named(top: string): string | undefined {
	try {
		const name = JSON.parse(readFileSync(join(top, "package.json"), "utf8"))?.name;
		return typeof name === "string" && name ? name : undefined;
	} catch {
		return undefined;
	}
}

/** Why `tasks` does not prove `applied`: every `## ` group needs a ticked box and no open one. */
function unticked(tasks: string): string | undefined {
	const found = groups(tasks);
	const ticked = complete(tasks);
	// `groups()` keys by heading, so a heading written twice hides the earlier group.
	// shortcut: a `## ` line inside a fence counts here and not there, so such a task list refuses; read headings through `groups()` when one does.
	if ((tasks.match(/^## .+$/gm) ?? []).length !== found.size) return "its tasks.md repeats a `## ` heading";
	if (!found.size) return "its tasks.md has no task group";
	const open = [...found.keys()].filter((heading) => !ticked.includes(heading));
	return open.length ? `its tasks.md leaves open: ${open.join(", ")}` : undefined;
}

/**
 * Why `origin/main`, fetched into `top`, does not prove `to` for the change
 * `pointer` names, or nothing; `seen.commit` is set to the commit it read.
 * The tree is extracted into a temporary directory removed on every path.
 */
function evidence(top: string, pointer: string, to: string, seen: { commit?: string }): string | undefined {
	// The refspec named, so a single-branch clone or a narrowed fetch still moves origin/main.
	git(top, "fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main");
	seen.commit = git(top, "rev-parse", "--verify", "-q", "refs/remotes/origin/main^{commit}");
	const dir = mkdtempSync(join(tmpdir(), "work-status-"));
	try {
		git(top, "archive", "-o", join(dir, "changes.tar"), seen.commit, "openspec/changes");
		const tar = Bun.spawnSync(["tar", "-xf", join(dir, "changes.tar"), "-C", dir], { stderr: "pipe" });
		if (tar.exitCode !== 0) throw new Refusal("unread", `tar exited ${tar.exitCode} on origin/main's openspec/changes`);
		let state: ReturnType<typeof boardState>;
		try {
			state = boardState(dir);
		} catch (error) {
			throw new Refusal("unread", (error as Error).message.replaceAll("\n", " "));
		}
		const name = named(top);
		// This repository's own change as a card on another board points at it (task-board).
		const path = name && pointer.startsWith(`${name}: `) ? pointer.slice(name.length + 2) : pointer;
		const active = POINTER.exec(path)?.[1];
		const archive = ARCHIVE.exec(path)?.[1];
		const slug =
			active && active !== "archive"
				? active
				: archive && statSync(join(dir, path), { throwIfNoEntry: false })?.isDirectory()
					? ARCHIVED.exec(archive)?.[1]
					: undefined;
		const derived = slug && Object.hasOwn(state.status, slug) ? state.status[slug] : undefined;
		if (!slug || !derived) throw new Refusal("no-pointer", `the card's Pointer "${pointer}" names no change on origin/main`);
		if (derived === "done" || (to === "proposed" && derived === "proposed")) return undefined;
		if (to === "applied" && derived === "proposed") {
			const why = unticked(readFileSync(join(dir, "openspec/changes", slug, "tasks.md"), "utf8"));
			return why && `${slug} on origin/main is not applied: ${why}`;
		}
		return `origin/main derives ${derived} for ${slug}, which does not prove ${to}`;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** The line `status` prints for moving `card` to `to`, and its exit code: 0 written, 1 otherwise. */
export async function status(card: string, to: string, timeout = 30_000): Promise<{ lines: string[]; code: number }> {
	const seen: { top?: string; commit?: string } = {};
	const refuse = (id: string, why: string) => {
		record("status", "block", id, { session_id: process.env.CLAUDE_CODE_SESSION_ID || undefined, cwd: seen.top ?? process.cwd() }, seen.commit);
		return { lines: [`status: refused — ${why}`], code: 1 };
	};
	if (USER_ONLY.includes(to)) return refuse("user-only", `only the user moves a card to ${to}, in Notion`);
	const found = integration(timeout);
	if (typeof found === "string") return refuse("unread", found);
	let from: string;
	try {
		const page = await found.call("the page read", `/v1/pages/${card}`);
		const board = page?.parent?.type === "data_source_id" ? page.parent.data_source_id : undefined;
		if (typeof board !== "string") throw new Refusal("unread", `${card} is not a card on a board`);
		from = page.properties?.Status?.select?.name;
		if (!STATUSES.includes(from)) throw new Refusal("unread", `${card}'s Status reads no status`);
		if (from === "discarded") throw new Refusal("user-only", `${card} is discarded, and only the user moves it out`);
		if (MERGED.includes(to)) {
			seen.top = git(process.cwd(), "rev-parse", "--show-toplevel");
			const why = evidence(seen.top, plain(page.properties?.Pointer?.rich_text), to, seen);
			if (why) throw new Refusal("no-evidence", why);
		} else if (!RANGE.includes(from) && RANGE.includes(to)) {
			const limit = process.env.HARNESS_WIP_LIMIT ?? "5";
			if (!/^\d+$/.test(limit)) throw new Refusal("wip-limit", `HARNESS_WIP_LIMIT is "${limit}", not a whole number`);
			const listed = await found.call("the board's query", `/v1/data_sources/${board}/query`, "POST", {
				filter: { or: RANGE.map((name) => ({ property: "Status", select: { equals: name } })) },
				page_size: 100,
			});
			if (!Array.isArray(listed?.results)) throw new Refusal("unread", "the board's query gave no results");
			if (listed.has_more !== false) throw new Refusal("wip-full", "more than one page of cards is at exploring … archiving");
			const n = listed.results.length;
			if (n >= Number(limit)) throw new Refusal("wip-full", `${n} cards are at exploring … archiving, the WIP limit of ${limit}`);
		}
	} catch (error) {
		return refuse(error instanceof Refusal ? error.id : "unread", (error as Error).message);
	}
	try {
		const written = await found.call("the Status write", `/v1/pages/${card}`, "PATCH", { properties: { Status: { select: { name: to } } } });
		const now = written?.properties?.Status?.select?.name;
		if (now !== to) return { lines: [`status: ${card} written, but Notion answers ${now ?? "no status"}`], code: 1 };
		return { lines: [`status: ${card} ${from} → ${now}`], code: 0 };
	} catch (error) {
		return { lines: [`status: ${card} not written — ${(error as Error).message}`], code: 1 };
	}
}
