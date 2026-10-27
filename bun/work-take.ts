/**
 * `work.ts take --card <id>`: prints a card's context for the session that
 * takes it — the checkout's `HEAD`, the card's properties, its body as the
 * markdown Notion renders, its page-level comments and whether a question
 * waits, the change its `Pointer` names, and `openspec list` — and writes
 * nothing (openspec/changes/work-take/design.md). Notion is read through the
 * ask integration; a read that fails ends the run on a line naming its step,
 * and no line holds the token.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { integration } from "./notion-ask.ts";
import { client, discussion, hex, plain, waits } from "./notion-bot.ts";

/** The markdown read's API version, for that call alone: the others stay on the one their cases ran against. */
const MARKDOWN = "2026-03-11";
const POINTER = /^openspec\/changes\/([a-z0-9-]+)\/$/;

type Property = { type?: unknown; [key: string]: unknown };
const named = (value: unknown) => (typeof (value as { name?: unknown })?.name === "string" ? (value as { name: string }).name : "");
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
			return list(property.people).map((person) => hex((person as { id?: unknown })?.id)).join(", ");
	}
	return "";
}

/** Runs `command` in `cwd`, its standard output, or throws naming how it failed. */
function output(command: string[], cwd?: string): string {
	if (!Bun.which(command[0])) throw new Error(`no ${command[0]} on PATH`);
	const run = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
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
	if (!existsSync(dir) || !statSync(dir).isDirectory()) return [`the change ${slug} is not in this checkout at ${commit}`];
	const specs = join(dir, "specs");
	const capabilities = existsSync(specs) ? readdirSync(specs).filter((name) => existsSync(join(specs, name, "spec.md"))).sort() : [];
	const paths = [...["proposal.md", "design.md", "tasks.md"], ...capabilities.map((name) => join("specs", name, "spec.md"))];
	const lines = paths
		.filter((path) => existsSync(join(dir, path)))
		.flatMap((path) => [`### ${pointer}${path}`, readFileSync(join(dir, path), "utf8")]);
	return [...lines, `capabilities: ${capabilities.join(", ") || "none"}`];
}

/** The lines `take` prints for `card`, and its exit code: 0, or 1 after a failed read. */
export async function take(card: string, timeout = 30_000): Promise<{ lines: string[]; code: number }> {
	const lines: string[] = [];
	let step = "the ask settings read";
	try {
		const found = integration(timeout);
		if (typeof found === "string") throw new Error(found);
		step = "the checkout read";
		const [top, commit] = output(["git", "rev-parse", "--show-toplevel", "HEAD"]).trim().split("\n");
		lines.push(`## Checkout: ${top} at ${commit}`);

		step = "the page read";
		const page = await found.call(step, `/v1/pages/${card}`);
		const properties: Record<string, Property> = page?.properties ?? {};
		lines.push("## Card", ...["Name", "Status", "Pointer", "Labels", "Assign"].map((name) => `${name}: ${text(properties[name])}`.trimEnd()));

		step = "the markdown read";
		const body = await client(found.settings.token, timeout, MARKDOWN)(step, `/v1/pages/${card}/markdown`);
		if (typeof body?.markdown !== "string") throw new Error("the markdown read gave no markdown");
		lines.push("## Body", body.markdown);
		if (body.truncated === true) lines.push("the body is truncated: Notion left part of it out");
		const missing = list(body.unknown_block_ids).length;
		if (missing) lines.push(`Notion left ${missing} block${missing === 1 ? "" : "s"} out of the body`);

		step = "the comments read";
		const comments = await discussion(found.call, card);
		const by = (id: unknown) => (hex(id) === hex(found.settings.user) ? "user" : hex(id));
		lines.push("## Comments");
		for (const comment of comments.toSorted((a, b) => String(a.created_time).localeCompare(String(b.created_time))))
			lines.push(`${comment.created_time} ${by(comment.created_by?.id)}: ${plain(comment.rich_text)}`);
		lines.push(`question waiting: ${waits(comments, found.settings.user) ? "yes" : "no"}`);

		step = "the change read";
		lines.push("## Change", ...change(text(properties.Pointer), top, commit));

		step = "the open changes read";
		lines.push("## Open changes", output(["openspec", "list"], top));
		return { lines, code: 0 };
	} catch (error) {
		return { lines: [...lines, `take: ${step} failed — ${(error as Error).message}`], code: 1 };
	}
}
