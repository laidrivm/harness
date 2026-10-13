#!/usr/bin/env bun
/**
 * The untracked `.claude/settings.local.json` swept against the tracked
 * `.claude/settings.json` beside it. Every "Yes, and don't ask again" lands in
 * the local file, so what piles up there is either a rule the tracked file
 * already makes or a gap in it — and only an entry naming one machine's path
 * belongs there for good.
 *
 * Run from the repository's root on the machine that holds the file:
 * `bun bun/settings-local.ts` in the harness, `bun
 * node_modules/harness/bun/settings-local.ts` in a consumer. It is not one of
 * `check.ts`'s checks: a clone and CI have no local file, so there it would
 * pass on an input it never read. It reports and writes neither file.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./root.ts";
import { machineLocal } from "./settings.ts";

const TRACKED = ".claude/settings.json";
const LOCAL = ".claude/settings.local.json";

type Permissions = { deny?: string[]; ask?: string[]; allow?: string[] };

/** `file`'s `permissions`, or a throw naming the file when it does not parse. */
function permissions(dir: string, file: string): Permissions {
	const text = readFileSync(join(dir, file), "utf8");
	try {
		return (JSON.parse(text) as { permissions?: Permissions }).permissions ?? {};
	} catch (error) {
		// The parser's own message names a position and no file.
		throw new Error(`${file} is not JSON — ${String(error)}`);
	}
}

/** `*` as any sequence and every other character as itself. */
const glob = (text: string) =>
	text
		.split("*")
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");

/** A trailing `:*` is a trailing ` *`; inside a rule the colon is literal. */
const normal = (rule: string) => rule.replace(/:\*\)$/, " *)");

/**
 * Whether Claude Code would apply `rule` to a call `entry` grants, per its
 * permissions documentation. A rule with no argument is a tool name, which may
 * be a glob; `Bash(*)` is `Bash`. Inside `Bash(...)`, `*` matches any sequence,
 * and a trailing ` *` that is the only wildcard also matches the bare command.
 * Every other rule is compared exactly — a path or domain glob it would cover
 * reads as a gap, which shows an entry rather than hiding one.
 */
function covers(rule: string, entry: string): boolean {
	const [r, e] = [normal(rule), normal(entry)];
	const tool = e.split("(")[0] ?? e;
	if (!r.includes("(") || r === "Bash(*)")
		return new RegExp(`^${glob(r === "Bash(*)" ? "Bash" : r)}$`).test(tool);
	if (r === e) return true;
	if (!r.startsWith("Bash(") || !e.startsWith("Bash(")) return false;
	const body = r.slice(5, -1);
	const bare = body.endsWith(" *") && body.indexOf("*") === body.length - 1;
	const pattern = bare ? `${glob(body.slice(0, -2))}(?: .*)?` : glob(body);
	return new RegExp(`^${pattern}$`, "s").test(e.slice(5, -1));
}

/**
 * Each local allow entry of `dir`, sorted: decided by a tracked deny, ask or
 * allow rule, tested in that order as Claude Code does; machine-local, kept;
 * or a gap. Decided lines come before gaps. `undefined` when there is no local
 * file to sweep.
 */
export function sweep(
	dir: string,
): { reported: string[]; kept: string[] } | undefined {
	if (!existsSync(join(dir, LOCAL))) return undefined;
	const local = permissions(dir, LOCAL).allow ?? [];
	// A string would otherwise be swept one character at a time.
	if (!Array.isArray(local)) throw new Error(`${LOCAL}: allow is not a list`);
	const tracked = permissions(dir, TRACKED);
	const decided: string[] = [];
	const gaps: string[] = [];
	const kept: string[] = [];
	for (const entry of local) {
		const by = (["deny", "ask", "allow"] as const)
			.map((list) => ({
				list,
				rule: (tracked[list] ?? []).find((r) => covers(r, entry)),
			}))
			.find(({ rule }) => rule !== undefined);
		const why = machineLocal(entry, dir);
		if (by) decided.push(`decided: ${entry} — ${by.list} holds ${by.rule}`);
		else if (why) kept.push(`kept: ${entry} — ${why}`);
		else
			gaps.push(
				`gap: ${entry} — promote it to ${TRACKED} or drop it`,
			);
	}
	return { reported: [...decided, ...gaps], kept };
}

if (import.meta.main) {
	const swept = sweep(root);
	if (swept === undefined) console.log(`no ${LOCAL} — nothing to sweep`);
	else {
		for (const line of swept.kept) console.log(line);
		for (const line of swept.reported) console.error(line);
		if (swept.reported.length) process.exit(1);
	}
}
