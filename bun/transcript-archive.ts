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
 * the archive.
 */
import {
	chmodSync,
	closeSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { stateDir } from "./gate-ledger.ts";

/** How long the archive keeps a session, judged by its transcript's mtime. */
const KEEP = 180 * 86_400_000;
/** How long the hook waits for another export's lock, of its 60 s timeout. */
const WAIT = 10_000;
/** A lock older than this is a killed export's, and is taken over. */
const STALE = 120_000;

type Event = {
	session_id?: unknown;
	transcript_path?: unknown;
	cwd?: unknown;
	reason?: unknown;
};

/** Directory `path`, made 0700 even where it existed with other modes. */
function folder(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	chmodSync(path, 0o700);
}

/** Replaces `path` with what `write` puts in `<path>.tmp`, made 0600. */
function replace(path: string, write: (tmp: string) => void): void {
	const tmp = `${path}.tmp`;
	write(tmp);
	chmodSync(tmp, 0o600);
	renameSync(tmp, path);
}

/** Copies file `from` to `to`, keeping its modification time. */
const copy = (from: string, to: string) =>
	replace(to, (tmp) => {
		const { atime, mtime } = statSync(from);
		copyFileSync(from, tmp);
		utimesSync(tmp, atime, mtime);
	});

/**
 * Makes `to` hold what directory `from` holds: each file copied, then each
 * entry that has left `from` removed — last, so an export cut short has
 * removed nothing from the previous copy.
 */
function mirror(from: string, to: string): void {
	folder(to);
	const names = readdirSync(from);
	for (const name of names)
		if (statSync(join(from, name)).isDirectory())
			mirror(join(from, name), join(to, name));
		else copy(join(from, name), join(to, name));
	for (const name of readdirSync(to))
		if (!names.includes(name))
			rmSync(join(to, name), { recursive: true, force: true });
}

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

/**
 * Takes the lock at `path`, waiting up to `WAIT` for another export's and
 * taking over one older than `STALE`; whether it was taken.
 *
 * shortcut: two exports taking over one stale lock at once can both run;
 * the renames still leave each file whole. Upgrade if a third mode appears.
 */
function lock(path: string): boolean {
	const until = Date.now() + WAIT;
	for (;;) {
		try {
			closeSync(openSync(path, "wx", 0o600));
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		const held = statSync(path, { throwIfNoEntry: false });
		if (held && Date.now() - held.mtimeMs > STALE) rmSync(path, { force: true });
		else if (held && Date.now() > until) return false;
		else if (held) Bun.sleepSync(100);
	}
}

/**
 * Deletes, in every project directory of the archive, each session whose
 * copied transcript is past `KEEP` with its `<id>/` and record, and each
 * `.tmp`, `.lock` or lone `<id>/` past it, which a killed export left.
 */
function prune(root: string): void {
	const old = (path: string) => Date.now() - statSync(path).mtimeMs > KEEP;
	for (const project of readdirSync(root, { withFileTypes: true })) {
		if (!project.isDirectory()) continue;
		const dir = join(root, project.name);
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (/\.(tmp|lock)$/.test(name) && old(path)) rmSync(path, { force: true });
			// A first export killed between the mirror and the copy leaves `<id>/`
			// alone; the entry may already be gone with its `.jsonl` above.
			const lone =
				statSync(path, { throwIfNoEntry: false })?.isDirectory() &&
				!existsSync(`${path}.jsonl`) &&
				!existsSync(`${path}.lock`);
			if (lone && old(path)) rmSync(path, { recursive: true, force: true });
			if (!name.endsWith(".jsonl") || !old(path)) continue;
			const id = name.slice(0, -".jsonl".length);
			for (const gone of [path, join(dir, id), join(dir, `${id}.meta.json`)])
				rmSync(gone, { recursive: true, force: true });
		}
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
		const tree = join(dirname(path), id);
		if (existsSync(tree)) mirror(tree, join(project, id));
		else rmSync(join(project, id), { recursive: true, force: true });
		copy(path, join(project, `${id}.jsonl`));
		const cwd = typeof event?.cwd === "string" ? event.cwd : null;
		const record = {
			session_id: id,
			cwd,
			branch: git(cwd, "symbolic-ref", "--short", "-q", "HEAD"),
			head: git(cwd, "rev-parse", "--verify", "-q", "HEAD"),
			reason: typeof event?.reason === "string" ? event.reason : null,
			archived: new Date().toISOString().slice(0, 10),
		};
		replace(join(project, `${id}.meta.json`), (tmp) =>
			writeFileSync(tmp, `${JSON.stringify(record)}\n`),
		);
	} finally {
		rmSync(held, { force: true });
	}
	prune(root);
}

try {
	main(await Bun.stdin.text());
} catch {
	// Archiving never stops a session: a fault leaves the previous copy.
}
