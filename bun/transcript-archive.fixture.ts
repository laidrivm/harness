/**
 * What the archive's test files need: a machine of their own — a home, a state
 * directory and a Claude Code config directory, each in one temporary
 * directory — a session written there as Claude Code lays it out, and the
 * hook spawned on an event under umask 022, started in a directory holding no
 * `.env`. Nothing a case runs reaches the user's own `~/.local/state` or
 * `~/.claude`. Each test file registers `cleanup` itself.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const hook = `${import.meta.dir}/transcript-archive.ts`;
const made: string[] = [];

/** Removes every machine fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

export type Machine = { home: string; state: string; config: string; cwd: string };

export function machine(): Machine {
	const root = mkdtempSync(join(tmpdir(), "transcript-archive-"));
	made.push(root);
	const at = (name: string) => {
		mkdirSync(join(root, name));
		return join(root, name);
	};
	return { home: at("home"), state: at("state"), config: at("config"), cwd: at("cwd") };
}

/** Writes `path` and the directories above it. */
export function put(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

/**
 * Session `id`'s transcript holding `text` under `project`, with `files`
 * under its `<id>/`; returns the transcript's path.
 */
export function session(
	m: Machine,
	id: string,
	text = '{"type":"user"}\n',
	files: Record<string, string> = {},
	project = "-work-p",
): string {
	const dir = join(m.config, "projects", project);
	for (const [path, body] of Object.entries(files)) put(join(dir, id, path), body);
	put(join(dir, `${id}.jsonl`), text);
	return join(dir, `${id}.jsonl`);
}

/** The `SessionEnd` event Claude Code sends for the transcript at `path`. */
export const event = (m: Machine, path: string, extra: object = {}) => ({
	session_id: basename(path, ".jsonl"),
	transcript_path: path,
	cwd: m.cwd,
	hook_event_name: "SessionEnd",
	reason: "other",
	...extra,
});

/** Where the archive keeps session `id` of `project`, without an extension. */
export const copyOf = (m: Machine, id: string, project = "-work-p") =>
	join(m.state, "harness", "transcripts", project, id);

/** The hook's argv and options for `input`: an event, or raw text as given. */
export function spawned(m: Machine, input: unknown, vars: object = {}) {
	const text = typeof input === "string" ? input : JSON.stringify(input);
	return [
		["sh", "-c", 'umask 022; exec bun "$0" "$@"', hook],
		{
			cwd: m.cwd,
			env: {
				PATH: process.env.PATH,
				HOME: m.home,
				XDG_STATE_HOME: m.state,
				CLAUDE_CONFIG_DIR: m.config,
				...vars,
			},
			stdin: new TextEncoder().encode(text),
		},
	] as const;
}

/** Runs the hook on `input` to its end; its exit code. */
export const archive = (m: Machine, input: unknown, vars: object = {}) =>
	Bun.spawnSync(...spawned(m, input, vars)).exitCode;

/** Runs `--catch-up` to its end, with nothing on stdin; its exit code and stdout. */
export function catchUp(m: Machine, vars: object = {}) {
	const [argv, options] = spawned(m, "", vars);
	const run = Bun.spawnSync([...argv, "--catch-up"], options);
	return { code: run.exitCode, out: run.stdout.toString() };
}
