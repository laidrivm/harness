import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cleanup, fabricate } from "./command-guard.fixture.ts";

/**
 * `gate-ledger.ts`: what one record holds and where it lands. Every case runs
 * in a spawned process whose environment is built from what the case needs —
 * `HOME` always a directory of its own — started in a directory holding no
 * `.env`, so nothing reaches the user's own ledger.
 */

afterAll(cleanup);

const writer = `${import.meta.dir}/gate-ledger.ts`;
const dir = () => fabricate(undefined, "gate-ledger-");

type Env = Record<string, string | undefined>;
const envOf = (vars: Env = {}): Env => ({
	PATH: process.env.PATH,
	HOME: dir(),
	...vars,
});

/** The argv that records one turn-gate refusal for `event`. */
const recording = (event: unknown) => [
	"bun",
	"-e",
	`import { record } from ${JSON.stringify(writer)};
	record("turn-gate", "refused", "pre-pr-sequence", ${JSON.stringify(event)});`,
];

function write(env: Env, event: unknown = { session_id: "s1" }) {
	const call = Bun.spawnSync(recording(event), { cwd: dir(), env });
	return { code: call.exitCode, stderr: call.stderr.toString() };
}

const ledger = (state: string) => join(state, "harness", "gates.jsonl");
const lines = (state: string) =>
	readFileSync(ledger(state), "utf8").split("\n").filter(Boolean);
const records = (state: string) =>
	lines(state).map((line) => JSON.parse(line));

/** The project one record names, written under `env` from `event`. */
function project(env: Env, event: unknown = {}): string {
	const state = dir();
	write(envOf({ XDG_STATE_HOME: state, ...env }), event);
	return records(state)[0].project;
}

describe("where the ledger lives", () => {
	test("a first record creates the state directory and the file", () => {
		const state = join(dir(), "not", "yet");
		write(envOf({ XDG_STATE_HOME: state }));
		expect(lines(state)).toHaveLength(1);
	});

	test.each([
		["empty", ""],
		["unset", undefined],
	])("an %s XDG_STATE_HOME falls back to $HOME/.local/state", (_, value) => {
		const home = dir();
		write(envOf({ HOME: home, XDG_STATE_HOME: value }));
		expect(lines(join(home, ".local", "state"))).toHaveLength(1);
	});

	test("a second record appends without rewriting the first", () => {
		const state = dir();
		write(envOf({ XDG_STATE_HOME: state }), { session_id: "first" });
		const first = lines(state)[0];
		write(envOf({ XDG_STATE_HOME: state }), { session_id: "second" });
		expect(lines(state)).toEqual([first, expect.stringContaining("second")]);
	});

	test("two processes recording at once leave two whole lines", async () => {
		const state = dir();
		const env = envOf({ XDG_STATE_HOME: state });
		const both = [1, 2].map(
			(n) => Bun.spawn(recording({ session_id: `s${n}` }), { cwd: dir(), env })
				.exited,
		);
		await Promise.all(both);
		expect(records(state).map((r) => r.session).sort()).toEqual(["s1", "s2"]);
	});
});

describe("the project a record names", () => {
	test("is CLAUDE_PROJECT_DIR as an absolute path", () => {
		const root = dir();
		expect(project({ CLAUDE_PROJECT_DIR: root })).toBe(realpathSync(root));
	});

	test("drops a trailing slash", () => {
		const root = dir();
		expect(project({ CLAUDE_PROJECT_DIR: `${root}/` })).toBe(
			realpathSync(root),
		);
	});

	test("falls back to the event's cwd, resolved the same way", () => {
		const root = dir();
		expect(project({}, { cwd: `${root}/` })).toBe(realpathSync(root));
	});

	test("is unknown with neither", () => {
		expect(project({})).toBe("unknown");
	});

	test("is the real path of a project reached through a symlink", () => {
		const root = dir();
		const link = join(dir(), "link");
		symlinkSync(root, link);
		expect(project({ CLAUDE_PROJECT_DIR: link })).toBe(realpathSync(root));
	});

	// spec: gate-ledger/two-projects gate-ledger/two-checkouts-sharing-a-name
	test("two checkouts sharing a basename record different projects", () => {
		const state = dir();
		const [clone, fork] = [dir(), dir()].map((parent) => {
			mkdirSync(join(parent, "app"));
			return join(parent, "app");
		});
		for (const root of [clone, fork])
			write(envOf({ XDG_STATE_HOME: state, CLAUDE_PROJECT_DIR: root }));
		expect(records(state).map((r) => r.project)).toEqual(
			[clone, fork].map((root) => realpathSync(root)),
		);
	});
});

describe("what a record holds", () => {
	test("an event with no string session_id still records", () => {
		const state = dir();
		write(envOf({ XDG_STATE_HOME: state }), { session_id: 42 });
		expect(records(state)).toEqual([
			expect.objectContaining({ gate: "turn-gate", session: null }),
		]);
	});

	test("exactly the six keys, each line parsing as JSON", () => {
		const state = dir();
		write(envOf({ XDG_STATE_HOME: state }));
		expect(Object.keys(records(state)[0]).sort()).toEqual(
			["at", "decision", "gate", "project", "rule", "session"].sort(),
		);
	});

	test("the time is ISO 8601 in UTC", () => {
		const state = dir();
		write(envOf({ XDG_STATE_HOME: state }));
		expect(records(state)[0].at).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
		);
	});
});

describe("a ledger that cannot be written", () => {
	test("throws nothing", () => {
		// A file where the state directory should be: no permission bit to
		// flip, so the case holds when the suite runs as root.
		const state = join(dir(), "file");
		writeFileSync(state, "");
		expect(write(envOf({ XDG_STATE_HOME: state }))).toEqual({
			code: 0,
			stderr: "",
		});
		expect(existsSync(ledger(state))).toBe(false);
	});
});
