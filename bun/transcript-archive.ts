/**
 * The `SessionEnd` hook: copies the ended session's `<id>.jsonl`, and the
 * `<id>/` directory beside it, into `harness/transcripts/<project>/` under the
 * state directory the gate ledger uses, writes one `<id>.meta.json` record
 * beside them, then prunes the whole archive. `<project>` is the name Claude
 * Code gave the transcript's directory under its `projects/`.
 *
 * Every file is 0600 and every directory 0700, whatever the umask. Each file
 * goes to `<name>.tmp` and is renamed over its copy, so an export cut short
 * leaves the previous copy whole. A copy keeps its source's modification time,
 * which is the session's last activity and the retention clock. `<id>.lock`,
 * created exclusively, keeps a second export of the session out.
 *
 * It never stops a session: every fault exits 0, and it writes nothing outside
 * the archive. With `--catch-up` it reads no event: it archives every session
 * under Claude Code's `projects/` that no hook archived or whose copy fell
 * behind, prunes, and prints one count line. `session-wrapup` runs it.
 */
import { rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { stateDir } from "./gate-ledger.ts";
import { catchUp } from "./transcript-archive-catch-up.ts";
import { files, folder, lock, prune, write } from "./transcript-archive-store.ts";

type Event = {
	session_id?: unknown;
	transcript_path?: unknown;
	cwd?: unknown;
	reason?: unknown;
};

/** One line git prints in `cwd`, or `null` where it cannot say. */
function git(cwd: string | null, ...args: string[]): string | null {
	if (!cwd) return null;
	try {
		const run = Bun.spawnSync(["git", "-C", cwd, ...args], { stderr: "ignore" });
		const out = run.stdout.toString().trim();
		return run.exitCode === 0 && out ? out : null;
	} catch {
		return null;
	}
}

/** Archives the session `input` names, if it names one that exists. */
function main(input: string): void {
	const event: Event | null = JSON.parse(input);
	const id = event?.session_id;
	const path = event?.transcript_path;
	// A plain name, and the transcript Claude Code names after it in a named
	// directory, with no `.` or `..` segment, so neither can point the copy
	// outside its project directory.
	if (typeof id !== "string" || !/^[\w-]+$/.test(id)) return;
	if (typeof path !== "string" || resolve(path) !== path) return;
	if (basename(path) !== `${id}.jsonl` || !basename(dirname(path))) return;
	if (!statSync(path, { throwIfNoEntry: false })?.isFile()) return;
	const root = join(stateDir(), "harness", "transcripts");
	const project = join(root, basename(dirname(path)));
	folder(root);
	folder(project);
	const held = join(project, `${id}.lock`);
	if (!lock(held)) return;
	try {
		files(dirname(path), id, project);
		const cwd = typeof event?.cwd === "string" ? event.cwd : null;
		write(project, id, {
			session_id: id,
			cwd,
			branch: git(cwd, "symbolic-ref", "--short", "-q", "HEAD"),
			head: git(cwd, "rev-parse", "--verify", "-q", "HEAD"),
			reason: typeof event?.reason === "string" ? event.reason : null,
			archived: new Date().toISOString().slice(0, 10),
		});
	} finally {
		rmSync(held, { force: true });
	}
	prune(root);
}

if (import.meta.main && process.argv.includes("--catch-up")) console.log(catchUp());
else if (import.meta.main)
	try {
		main(await Bun.stdin.text());
	} catch {
		// Archiving never stops a session: a fault leaves the previous copy.
	}
