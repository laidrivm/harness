/**
 * The catch-up that `transcript-archive.ts --catch-up` runs: it archives every
 * session under Claude Code's `projects/` that no hook archived, or whose copy
 * fell behind, with the hook's own copy, lock and prune, and returns one count
 * line. `session-wrapup` runs it, so a session the board loop killed is
 * archived at the next wrap-up on the machine.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stateDir } from "./gate-ledger.ts";
import { files, folder, lock, old, prune, write } from "./transcript-archive.ts";

/**
 * Whether `copy` holds what `source` holds, file for file by size and
 * modification time: a file missing from either side, or present in only
 * one, is a difference. Times are compared to the millisecond `utimesSync`
 * keeps.
 */
function same(source: string, copy: string): boolean {
	const a = statSync(source, { throwIfNoEntry: false });
	const b = statSync(copy, { throwIfNoEntry: false });
	if (!a || !b) return !a && !b;
	if (a.isDirectory() !== b.isDirectory()) return false;
	if (!a.isDirectory())
		return a.size === b.size && Math.trunc(a.mtimeMs) === Math.trunc(b.mtimeMs);
	const names = readdirSync(source).sort();
	const copied = readdirSync(copy).sort();
	return (
		names.join("/") === copied.join("/") &&
		names.every((name) => same(join(source, name), join(copy, name)))
	);
}

/** The record at `path` as an object, or `null` for none or one that does not parse. */
function recorded(path: string): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(readFileSync(path, "utf8"));
		return value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** The last `cwd` and `gitBranch` the transcript at `path` carries, each `null` where none does. */
function last(path: string): { cwd: string | null; branch: string | null } {
	const found = { cwd: null as string | null, branch: null as string | null };
	for (const text of readFileSync(path, "utf8").split("\n")) {
		try {
			const entry = JSON.parse(text);
			if (typeof entry?.cwd === "string") found.cwd = entry.cwd;
			if (typeof entry?.gitBranch === "string") found.branch = entry.gitBranch;
		} catch {
			// A line that does not parse carries neither.
		}
	}
	return found;
}

/**
 * Archives every session under Claude Code's `projects/` with no record, or
 * whose files differ from their copy, then prunes; the one count line. A
 * locked session is skipped, a source past the period ignored, and a session
 * or a project directory that throws counted as failed.
 */
export function catchUp(): string {
	const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
	const projects = join(config, "projects");
	const root = join(stateDir(), "harness", "transcripts");
	const count = { archived: 0, skipped: 0, pruned: 0, failed: 0 };
	const dirs = existsSync(projects) ? readdirSync(projects, { withFileTypes: true }) : [];
	for (const entry of dirs.filter((d) => d.isDirectory())) {
		const dir = join(projects, entry.name);
		let names: string[];
		try {
			names = readdirSync(dir);
		} catch {
			// A project gone since the listing, or one that cannot be read, is one failure, not the run's end.
			count.failed++;
			continue;
		}
		for (const name of names) {
			const id = name.slice(0, -".jsonl".length);
			if (!name.endsWith(".jsonl") || !/^[\w-]+$/.test(id)) continue;
			try {
				if (!statSync(join(dir, name)).isFile() || old(join(dir, name))) continue;
				const project = join(root, entry.name);
				folder(root);
				folder(project);
				const held = join(project, `${id}.lock`);
				if (!lock(held, 0)) {
					count.skipped++;
					continue;
				}
				try {
					const before = recorded(join(project, `${id}.meta.json`));
					const unchanged =
						same(join(dir, name), join(project, name)) &&
						same(join(dir, id), join(project, id));
					if (before && unchanged) {
						count.skipped++;
						continue;
					}
					files(dir, id, project);
					const archived = new Date().toISOString().slice(0, 10);
					// Only the hook knows HEAD and the end reason: a record of its own keeps them.
					if (before && before.reason !== "catch-up") write(project, id, { ...before, archived });
					else
						write(project, id, {
							session_id: id,
							...last(join(dir, name)),
							head: null,
							reason: "catch-up",
							archived,
						});
					count.archived++;
				} finally {
					rmSync(held, { force: true });
				}
			} catch {
				count.failed++;
			}
		}
	}
	try {
		if (existsSync(root)) count.pruned = prune(root);
	} catch {
		count.failed++;
	}
	const { archived, skipped, pruned, failed } = count;
	return `catch-up: archived ${archived}, skipped ${skipped}, pruned ${pruned}, failed ${failed}`;
}
