/**
 * `transcript-archive.ts` where a session ends badly or another export is in
 * the way: every fault exits 0 and writes nothing, a lock holds a second
 * export off, and each export prunes the whole archive.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	archive,
	cleanup,
	copyOf,
	event,
	machine,
	put,
	session,
	spawned,
} from "./transcript-archive.fixture.ts";

afterAll(cleanup);

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms);

describe("a fault", () => {
	// spec: transcript-archive/a-malformed-event
	//   transcript-archive/a-session-id-that-climbs-out
	//   transcript-archive/a-transcript-already-gone
	test.each([
		["input that is not JSON [19]", () => "{not json"],
		["an event with no transcript_path", () => ({ session_id: "s1" })],
		["a session_id of ../x [20]", (path: string) => ({
			session_id: "../x",
			transcript_path: join(path, "..", "..", "x.jsonl"),
		})],
		["a transcript_path not <session_id>.jsonl [21]", (path: string) => ({
			session_id: "s2",
			transcript_path: path,
		})],
		["a transcript_path climbing out of its project", (path: string) => ({
			session_id: "x",
			transcript_path: `${dirname(path)}/../x.jsonl`,
		})],
		["a relative transcript_path", () => ({
			session_id: "s1",
			transcript_path: "s1.jsonl",
		})],
		["a transcript that does not exist [22]", (path: string) => ({
			session_id: "gone",
			transcript_path: join(path, "..", "gone.jsonl"),
		})],
	])("exits 0 and writes nothing on %s", (_, input) => {
		const m = machine();
		const path = session(m, "s1");
		put(join(m.config, "projects", "x.jsonl"), "{}\n");
		put(join(m.cwd, "s1.jsonl"), "{}\n");
		expect(archive(m, input(path))).toBe(0);
		expect(readdirSync(m.state)).toEqual([]);
	});

	test("exits 0 on a state directory it cannot write [24]", () => {
		const m = machine();
		chmodSync(m.state, 0o500);
		const code = archive(m, event(m, session(m, "s1")));
		chmodSync(m.state, 0o700);
		expect(code).toBe(0);
		expect(readdirSync(m.state)).toEqual([]);
	});

	// spec: transcript-archive/an-export-killed-mid-copy
	test("cut short mid-copy leaves the previous copy and record whole [23]", () => {
		const m = machine();
		const path = session(m, "s1", "x\n", { "tool-results/r.txt": "old" });
		archive(m, event(m, path, { reason: "clear" }));
		writeFileSync(join(path, "..", "s1", "tool-results", "r.txt"), "new");
		// A directory on the file's temporary name stops the export there, as a kill would.
		const copy = copyOf(m, "s1");
		mkdirSync(join(copy, "tool-results", "r.txt.tmp"));
		expect(archive(m, event(m, path, { reason: "logout" }))).toBe(0);
		expect(readFileSync(join(copy, "tool-results", "r.txt"), "utf8")).toBe("old");
		expect(JSON.parse(readFileSync(`${copy}.meta.json`, "utf8")).reason).toBe("clear");
		expect(existsSync(`${copy}.lock`)).toBe(false);
	});
});

describe("another export's lock", () => {
	// spec: transcript-archive/two-exports-of-one-session-at-once
	test("makes the hook wait, then export once it is released [38]", async () => {
		const m = machine();
		const path = session(m, "s1");
		const lock = `${copyOf(m, "s1")}.lock`;
		put(lock, "");
		const run = Bun.spawn(...spawned(m, event(m, path)));
		await Bun.sleep(1000);
		const early = existsSync(`${copyOf(m, "s1")}.jsonl`);
		rmSync(lock);
		expect(await run.exited).toBe(0);
		expect(early).toBe(false);
		expect(existsSync(`${copyOf(m, "s1")}.jsonl`)).toBe(true);
	});

	test("is taken over once older than 120 s [38]", () => {
		const m = machine();
		const lock = `${copyOf(m, "s1")}.lock`;
		put(lock, "");
		utimesSync(lock, ago(121_000), ago(121_000));
		expect(archive(m, event(m, session(m, "s1")))).toBe(0);
		expect(existsSync(`${copyOf(m, "s1")}.jsonl`)).toBe(true);
		expect(existsSync(lock)).toBe(false);
	}, 20_000);
});

describe("the prune", () => {
	/**
	 * Lays `aged` in a project no session of the run belongs to, each file
	 * last modified that many days ago, then ends a session elsewhere; which
	 * of `names` that project still holds.
	 */
	const after = (aged: Record<string, number>, names: string[]) => {
		const m = machine();
		const other = join(m.state, "harness", "transcripts", "-gone-clone");
		for (const [name, days] of Object.entries(aged)) {
			put(join(other, name), "x");
			utimesSync(join(other, name), ago(days * DAY), ago(days * DAY));
		}
		archive(m, event(m, session(m, "s1")));
		return names.filter((name) => existsSync(join(other, name)));
	};

	// spec: transcript-archive/a-session-past-the-period
	test("deletes a session 181 days old with its <id>/ and record, in any project [9] [37]", () => {
		const aged = { "old.jsonl": 181, "old/subagents/a.jsonl": 0, "old.meta.json": 0, "old.lock": 181 };
		expect(after(aged, ["old.jsonl", "old", "old.meta.json", "old.lock"])).toEqual([]);
	});

	test("keeps a session 179 days old [10]", () => {
		const aged = { "young.jsonl": 179, "young.meta.json": 179 };
		const names = ["young.jsonl", "young.meta.json"];
		expect(after(aged, names)).toEqual(names);
	});

	// spec: transcript-archive/a-temporary-file-with-no-copy-beside-it
	test("deletes a .tmp file 181 days old with no copy beside it", () => {
		expect(after({ "gone.jsonl.tmp": 181 }, ["gone.jsonl.tmp"])).toEqual([]);
	});

	// spec: transcript-archive/a-session-past-the-period
	test("deletes a session directory 181 days old with no transcript beside it (CodeRabbit)", () => {
		const m = machine();
		const lone = join(m.state, "harness", "transcripts", "-gone-clone", "lone");
		put(join(lone, "subagents", "a.jsonl"), "x");
		utimesSync(lone, ago(181 * DAY), ago(181 * DAY));
		archive(m, event(m, session(m, "s1")));
		expect(existsSync(lone)).toBe(false);
	});
});
