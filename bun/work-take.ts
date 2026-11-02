/**
 * `work.ts take --card <id> [--after <comment id>]`: prints a card's context
 * for the session that takes it — the checkout's `HEAD`, the card's
 * properties, its body as the markdown Notion renders, its page-level comments
 * and whether a question waits, the paths and line counts of the change its
 * `Pointer` names, `openspec list`, and last the id of the card's newest
 * comment. With `--after` that id, the re-read prints only `Status`, `Assign`
 * and what came after it. It writes nothing but the release of the card's
 * `Assign` when nothing waits there, whose line follows the comments
 * (`cleared()`; `openspec/specs/work-take/`, and
 * `openspec/changes/archive/2026-10-27-work-take/design.md`). Notion is read
 * through the ask integration; a read that fails ends the run on a line naming
 * its step, and no line it composes holds the token.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { count } from "./file-size.ts";
import { integration } from "./notion-ask.ts";
import { type Comment, client, discussion, hex, ID, oldest, plain, waits } from "./notion-bot.ts";
import { cleared } from "./notion-release.ts";

/** The markdown read's API version, for that call alone: the others stay on the one their cases ran against. */
const MARKDOWN = "2026-03-11";
/** A `Pointer` at an active change, wholly; `work-status.ts` reads it too. */
export const POINTER = /^openspec\/changes\/([a-z0-9-]+)\/$/;

type Property = { type?: unknown; [key: string]: unknown };
const named = (value: unknown) =>
	typeof (value as { name?: unknown })?.name === "string" ? (value as { name: string }).name : "";
const list = (value: unknown) => (Array.isArray(value) ? value : []);

/** A property's value as text, read by its type; a type it does not know reads as empty. */
function text(property: Property | undefined): string {
	switch (property?.type) {
		case "title":
		case "rich_text":
			return plain(property[property.type]);
		case "status":
		case "select":
			return named(property[property.type]);
		case "multi_select":
			return list(property.multi_select).map(named).join(", ");
		case "people":
			return list(property.people)
				.map((person) => hex((person as { id?: unknown })?.id))
				.join(", ");
	}
	return "";
}

/** The refspec `work-status.ts` and `work-finish-card.ts` fetch `origin/main` by, named so a single-branch clone or a narrowed fetch still moves it. */
export const MAIN = "+refs/heads/main:refs/remotes/origin/main";

/** Runs `command` in `cwd` under `env`, its standard output, or throws naming how it failed; `work-status.ts` runs git through it too. */
export function output(command: string[], cwd?: string, env: Record<string, string | undefined> = process.env): string {
	const [program] = command;
	if (program === undefined || !Bun.which(program)) throw new Error(`no ${program} on PATH`);
	// Bounded, so a stalled remote or a prompt nobody answers ends in a failure, not a hang.
	const run = Bun.spawnSync(command, {
		cwd,
		env,
		stdout: "pipe",
		stderr: "pipe",
		timeout: 120_000,
		killSignal: "SIGKILL",
	});
	if (run.exitCode !== 0) {
		const said = run.stderr.toString().trim().split("\n")[0];
		throw new Error(`${command.slice(0, 2).join(" ")} exited ${run.exitCode}${said ? `: ${said}` : ""}`);
	}
	return run.stdout.toString();
}

/** The change `pointer` names in `top`, as lines, or the one line saying why none is printed. */
function change(pointer: string, top: string, commit: string): string[] {
	const slug = pointer.match(POINTER)?.[1];
	if (!pointer) return ["the card points at no change"];
	if (!slug || slug === "archive") return [`the pointer names no change of this checkout: ${pointer}`];
	const dir = join(top, pointer);
	if (!existsSync(dir) || !statSync(dir).isDirectory())
		return [`the change ${slug} is not in this checkout at ${commit}`];
	const specs = join(dir, "specs");
	const capabilities = existsSync(specs)
		? readdirSync(specs)
				.filter((name) => existsSync(join(specs, name, "spec.md")))
				.sort()
		: [];
	const paths = [
		...["proposal.md", "design.md", "tasks.md"],
		...capabilities.map((name) => join("specs", name, "spec.md")),
	];
	const lines = paths
		.filter((path) => existsSync(join(dir, path)))
		.map((path) => {
			const n = count(readFileSync(join(dir, path), "utf8"));
			return `${pointer}${path}: ${n} line${n === 1 ? "" : "s"}`;
		});
	return [...lines, `capabilities: ${capabilities.join(", ") || "none"}`];
}

/** The checkout's root and its `HEAD` commit. */
function head(): [string, string] {
	// Only git's terminator, not `trim()`: a checkout's path may end in a space (bun/root.ts).
	const [top, commit] = output(["git", "rev-parse", "--show-toplevel", "HEAD"]).replace(/\n$/, "").split("\n");
	if (top === undefined || commit === undefined) throw new Error("git rev-parse printed no commit");
	return [top, commit];
}

/** The line ending every read that got the comments: the newest of `ordered` whose id `--after` accepts, as Notion gave it. */
const newest = (ordered: Comment[]) => {
	const id = ordered.findLast((comment) => typeof comment.id === "string" && ID.test(comment.id))?.id;
	return `last comment: ${typeof id === "string" ? id : "none"}`;
};

/**
 * The lines `take` prints for `card`, and its exit code: 0, or 1 after a failed
 * read. With `after`, a comment's id, it is the re-read: `Status`, `Assign` and
 * the comments after that one, with no checkout, body, change or open changes.
 */
export async function take(card: string, after?: string, timeout = 30_000): Promise<{ lines: string[]; code: number }> {
	const lines: string[] = [];
	const full = after === undefined;
	let code = 0;
	let step = "the ask settings read";
	try {
		const found = integration(timeout);
		if (typeof found === "string") throw new Error(found);
		if (full) step = "the checkout read";
		const checkout = full ? head() : undefined;
		if (checkout) lines.push(`## Checkout: ${checkout[0]} at ${checkout[1]}`);

		step = "the page read";
		const page = await found.call<{ properties?: Record<string, Property> } | null>(step, `/v1/pages/${card}`);
		const properties: Record<string, Property> = page?.properties ?? {};
		lines.push(
			"## Card",
			...(full ? ["Name", "Status", "Pointer", "Labels", "Assign"] : ["Status", "Assign"]).map((name) =>
				`${name}: ${text(properties[name])}`.trimEnd(),
			),
		);

		if (full) {
			step = "the markdown read";
			type Markdown = { markdown?: unknown; truncated?: unknown; unknown_block_ids?: unknown } | null;
			const body = await client(found.settings.token, timeout, MARKDOWN)<Markdown>(step, `/v1/pages/${card}/markdown`);
			if (typeof body?.markdown !== "string") throw new Error("the markdown read gave no markdown");
			lines.push("## Body", body.markdown);
			if (body.truncated === true) lines.push("the body is truncated: Notion left part of it out");
			const missing = list(body.unknown_block_ids).length;
			if (missing) lines.push(`Notion left ${missing} block${missing === 1 ? "" : "s"} out of the body`);
		}

		step = "the comments read";
		const comments = oldest(await discussion(found.call, card));
		const by = (id: unknown) => (hex(id) === hex(found.settings.user) ? "user" : hex(id));
		lines.push("## Comments");
		// Found by position, not time: Notion rounds `created_time` to the minute, and `oldest()` keeps ties in its order.
		const at = full ? -1 : comments.findIndex((comment) => hex(comment.id) === hex(after));
		if (!full && at === -1) lines.push(`the comment ${after} is not on the card: every comment follows`);
		const shown = comments.slice(at + 1);
		if (!full && at !== -1 && !shown.length) lines.push(`no comment follows ${after}`);
		for (const comment of shown)
			lines.push(`${comment.created_time} ${by(comment.created_by?.id)}: ${plain(comment.rich_text)}`);
		lines.push(`question waiting: ${waits(comments, found.settings.user) ? "yes" : "no"}`);
		// Its own reads, so a failure prints its line and ends nothing; only a failed restore changes the exit.
		const freed = await cleared(found.call, card, found.settings.user);
		if (freed.line) lines.push(freed.line);
		code = freed.restoreFailed ? 1 : 0;
		const last = newest(comments);
		if (!checkout) return { lines: [...lines, last], code };
		const [top, commit] = checkout;

		step = "the change read";
		lines.push("## Change", ...change(text(properties.Pointer), top, commit));

		step = "the open changes read";
		// Telemetry off: take writes nothing but the release, and openspec's telemetry keeps state and sends events.
		const listed = output(["openspec", "list"], top, { ...process.env, OPENSPEC_TELEMETRY: "0" });
		// Its own terminator off, so the last comment's line follows the listing with no blank line between.
		lines.push("## Open changes", listed.replace(/\n$/, ""), last);
		return { lines, code };
	} catch (error) {
		return { lines: [...lines, `take: ${step} failed — ${(error as Error).message}`], code: 1 };
	}
}
