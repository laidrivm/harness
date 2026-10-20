#!/usr/bin/env bun
/**
 * The flake watch: one script reading a Bash call's `PostToolUse` or
 * `PostToolUseFailure` event, whatever the command, since a list of test
 * commands would miss every script and hook that wraps a suite. It reads bun's
 * reporter from the call's output, and when a command that failed passes in the same session,
 * from the same directory, on the same tree, it tells the agent the run is
 * flaky, naming the tests the failing runs named, and records one `flaky`
 * finding in the gate ledger. The rules are
 * `openspec/specs/flaky-tests/spec.md`'s.
 *
 * It never blocks: a flaky run is a finding to report, not a gate to pass, so
 * it exits 0 on every event and its only output is the hint. It fails open,
 * like the loop guard: whatever it cannot read or write — an event that is not
 * JSON, an id unsafe as a file name, a directory git cannot read, a store it
 * cannot read or write — decides nothing, since a missed hint costs one
 * unreported flake where a false one would send the agent after a test
 * nothing was wrong with.
 *
 * The store holds test names, unlike the loop guard's hashes, because the
 * passing run's output does not list them; it is private and outside every
 * tree. The ledger gets no name, command or output. Git runs only on a failing
 * run, or on a passing one whose command has an entry; a call that is no test
 * run costs one bun start and one JSON parse, and a pass with no entry one
 * file read besides. On a call that is no test run, the watch measured
 * 14.0-15.2 ms per call (50 runs per round, three rounds, 2026-10-20).
 */

import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { record } from "./gate-ledger.ts";

type Event = {
	hook_event_name?: unknown;
	session_id?: unknown;
	agent_id?: unknown;
	cwd?: unknown;
	tool_input?: { command?: unknown };
	tool_response?: { stdout?: unknown; stderr?: unknown };
	error?: unknown;
};

/** Per hashed key, the tree a failing run was seen on and the names it named. */
export type Store = Record<string, { tree: string; names: string[] }>;

/** A test run's outcome, and the failing tests it named. */
export type Run = { passing: boolean; names: string[] };

const sha = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

/**
 * The run bun's reporter shows in `output`: failing on a `(fail) ` line or a
 * nonzero `fail` count, passing on a `0 fail` with a nonzero `pass` and no
 * `(fail) ` line, and no run otherwise — every test skipped included. Each
 * name drops only its trailing `[<duration>]`, so a `[` inside one stays.
 */
export function read(output: string): Run | undefined {
	const names = [...output.matchAll(/^\(fail\) (.+)$/gm)].map((m) =>
		(m[1] ?? "").replace(/ \[[^[\]]*\]\s*$/, ""),
	);
	const count = (word: string) =>
		[...output.matchAll(new RegExp(`^[ \\t]*(\\d+) ${word}[ \\t]*$`, "gm"))].map(
			(m) => Number(m[1]),
		);
	const fails = count("fail");
	if (names.length || fails.some((n) => n > 0))
		return { passing: false, names: [...new Set(names)] };
	if (fails.length && count("pass").some((n) => n > 0))
		return { passing: true, names: [] };
}

/** `args` run by git in `cwd`, or `undefined` when git refuses. */
function git(cwd: string, ...args: string[]): string | undefined {
	const call = Bun.spawnSync(["git", ...args], { cwd });
	return call.exitCode === 0 ? call.stdout.toString() : undefined;
}

/**
 * The tree `cwd` sits in: its `HEAD`, a hash of its uncommitted changes to
 * tracked files and of its untracked files that are not ignored, by path and
 * content. `undefined` outside a working tree, or with no commit yet.
 */
export function tree(cwd: string): { head: string; print: string } | undefined {
	const [top, head] = git(cwd, "rev-parse", "--show-toplevel", "HEAD")?.split("\n") ?? [];
	if (!top || !head) return;
	const diff = git(top, "diff", "HEAD", "--binary");
	const others = git(top, "ls-files", "--others", "--exclude-standard", "-z");
	if (diff === undefined || others === undefined) return;
	const untracked = others
		.split("\0")
		.filter(Boolean)
		.map((path) => {
			try {
				return `${path}\0${sha(readFileSync(join(top, path)))}`;
			} catch {
				return path; // a dangling link still names its path
			}
		});
	return { head, print: sha([head, diff, ...untracked].join("\0")) };
}

/**
 * The store after `run` under `key` on `print`, and the names to call flaky:
 * a failing run adds its names on the same tree and replaces the entry on
 * another; a passing run deletes the entry, naming its names on the same tree.
 */
export function decide(
	store: Store,
	key: string,
	run: Run,
	print: string,
): { store: Store; flaky?: string[] } {
	const { [key]: entry, ...rest } = store;
	if (run.passing)
		return { store: rest, flaky: entry?.tree === print ? entry.names : undefined };
	const kept = entry?.tree === print ? entry.names : [];
	return {
		store: { ...rest, [key]: { tree: print, names: [...new Set([...kept, ...run.names])] } },
	};
}

/** What the agent is told of a flaky run whose failing runs named `names`. */
export const hint = (names: string[]) =>
	"flake-watch: this run passed on the tree where the same command failed: " +
	`${names.length ? names.join(", ") : "(the failing names were not in the output)"}. ` +
	"That is a flaky test, not a green run. Report it as a `flaky` finding " +
	"naming these tests, and file a card for it on the project's board. If " +
	"something outside the tree changed between the runs, say what.";

const isStore = (value: unknown): value is Store =>
	!!value && typeof value === "object" && !Array.isArray(value);

/** Whether `path` is a directory this user owns and no one else can open. */
function mine(path: string): boolean {
	const stat = lstatSync(path, { throwIfNoEntry: false });
	return !!stat?.isDirectory() && stat.uid === process.getuid?.() && !(stat.mode & 0o077);
}

/** The store in `file`; one missing or not the watch's own is empty. */
function load(file: string): Store {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (isStore(parsed)) return parsed;
	} catch {
		// Unreadable: start from nothing, as the header says.
	}
	return {};
}

/**
 * Plays one event against `dir`: the hint and the commit read, when the call
 * shows a flaky run, and nothing otherwise. The store file is per session and
 * sub-agent, as the loop guard keys its count.
 */
export function watch(event: Event, dir: string): { hint: string; head: string } | undefined {
	const { session_id: session, agent_id: agent, cwd } = event;
	const command = event.tool_input?.command;
	const safe = (id: unknown): id is string => typeof id === "string" && /^[\w-]+$/.test(id);
	if (!safe(session) || (agent != null && !safe(agent))) return;
	if (typeof cwd !== "string" || typeof command !== "string") return;
	const output = [event.error, event.tool_response?.stdout, event.tool_response?.stderr]
		.filter((part) => typeof part === "string")
		.join("\n");
	const run = read(output);
	if (!run) return;
	const file = join(dir, agent == null ? session : `${session}.${agent}`);
	// `tmpdir()` is a shared `/tmp` where `TMPDIR` is unset: a store directory
	// another user made, or can open, is never read or written.
	if (existsSync(dir) && !mine(dir)) return;
	const store = load(file);
	// shortcut: the key is the exact command, so a re-run through another pipe
	// (`bun test` then `bun test 2>&1 | tail`) is missed; normalise the command
	// if those misses show up in the wrap-up's notes.
	const key = sha(JSON.stringify([cwd, command]));
	if (run.passing && !store[key]) return;
	const seen = tree(cwd);
	if (!seen) return;
	const next = decide(store, key, run, seen.print);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	if (!mine(dir)) return; // made by another user since the check above
	// Written beside and renamed into place, so a reader never sees half a
	// store. Two calls at once can lose one write, which drops a name or a
	// hint: the silent side. Written before the hint, so a pass whose entry
	// could not be deleted never names the same run twice. Created exclusively,
	// so a link planted at the partial's name is never followed.
	const partial = `${file}.${process.pid}`;
	writeFileSync(partial, JSON.stringify(next.store), { mode: 0o600, flag: "wx" });
	renameSync(partial, file);
	if (next.flaky) return { hint: hint(next.flaky), head: seen.head };
}

if (import.meta.main) {
	// shortcut: one store file per session and sub-agent accumulates in the OS
	// temp dir, which the OS clears; prune here if that ever stops being true,
	// as the loop guard's own note says.
	const dir = join(tmpdir(), "flake-watch");
	let event: Event = {};
	let found: ReturnType<typeof watch>;
	try {
		event = JSON.parse(await Bun.stdin.text()) ?? {};
		found = watch(event, dir);
	} catch {
		// Fail-open, as the header says.
	}
	if (found) {
		// Silent on failure, so the hint never depends on it.
		record("flake-watch", "flaky", "fail-then-pass", event, found.head);
		const context = {
			hookEventName: event.hook_event_name,
			additionalContext: found.hint,
		};
		process.stdout.write(`${JSON.stringify({ hookSpecificOutput: context })}\n`);
	}
}
