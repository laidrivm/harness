/**
 * The transcript archive's store: the copy, lock, record and prune that the
 * `SessionEnd` hook (`transcript-archive.ts`) and its catch-up
 * (`transcript-archive-catch-up.ts`) share, in a module of its own so neither
 * imports the other's.
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
import { join } from "node:path";

/** How long the archive keeps a session, judged by its transcript's mtime. */
const KEEP = 180 * 86_400_000;
/** How long the hook waits for another export's lock, of its 60 s timeout. */
const WAIT = 10_000;
/** A lock older than this is a killed export's, and is taken over. */
const STALE = 120_000;

/** Directory `path`, made 0700 even where it existed with other modes. */
export function folder(path: string): void {
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
		if (statSync(join(from, name)).isDirectory()) mirror(join(from, name), join(to, name));
		else copy(join(from, name), join(to, name));
	for (const name of readdirSync(to))
		if (!names.includes(name)) rmSync(join(to, name), { recursive: true, force: true });
}

/**
 * Takes the lock at `path`, waiting up to `wait` for another export's and
 * taking over one older than `STALE`; whether it was taken.
 *
 * shortcut: two exports taking over one stale lock at once can both run;
 * the renames still leave each file whole. Upgrade if a third mode appears.
 */
export function lock(path: string, wait = WAIT): boolean {
	const until = Date.now() + wait;
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
 * `.tmp`, `.lock` or lone `<id>/` past it, which a killed export left; how
 * many sessions it deleted.
 */
export function prune(root: string): number {
	let pruned = 0;
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
			pruned++;
		}
	}
	return pruned;
}

/** Whether `path` was last modified longer ago than the archive keeps a session. */
export const old = (path: string) => {
	// Gone since prune listed it, renamed or dropped by a concurrent export: not old, so the pass goes on.
	const stat = statSync(path, { throwIfNoEntry: false });
	return stat !== undefined && Date.now() - stat.mtimeMs > KEEP;
};

/** Copies session `id`'s `<id>/` and transcript from `dir` into `project`. */
export function files(dir: string, id: string, project: string): void {
	const tree = join(dir, id);
	if (existsSync(tree)) mirror(tree, join(project, id));
	else rmSync(join(project, id), { recursive: true, force: true });
	copy(join(dir, `${id}.jsonl`), join(project, `${id}.jsonl`));
}

/** Writes session `id`'s record into `project`. */
export const write = (project: string, id: string, record: object) =>
	replace(join(project, `${id}.meta.json`), (tmp) => writeFileSync(tmp, `${JSON.stringify(record)}\n`));
