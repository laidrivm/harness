/**
 * The harness's bump of its own development pin, against the stand-in for
 * GitHub's API and a real git repository whose history holds the pinned
 * commit. The install is injected, so no case reaches the network.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GREEN, git, type Served, serve } from "./bump.fixture.ts";
import { bumpSelf } from "./bump.ts";

/** A commit the fixture's first manifest pins, never one in its history. */
const OLD = "eddf1fdd56642c48a3b222034ec6268c9b55971f";
const spec = (sha: string) => `github:laidrivm/harness#${sha}`;

const api: Served = { head: "", runs: [], broken: false, seen: [] };
let server: ReturnType<typeof serve>;
const made: string[] = [];

beforeAll(() => {
	server = serve(api);
});

afterAll(() => {
	server.stop(true);
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

type Fields = { dependencies?: string; devDependencies?: string };

const manifest = (fields: Fields, test = "bun test") =>
	`${JSON.stringify(
		{
			name: "harness",
			scripts: { test },
			...Object.fromEntries(
				Object.entries(fields).map(([field, harness]) => [field, { harness }]),
			),
		},
		null,
		"\t",
	)}\n`;

const write = (dir: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files))
		writeFileSync(join(dir, path), text);
};

/**
 * A harness repository: the pinned commit, then a merged bump pinning it
 * with `after`'s fields, then — when `work` is given — one more commit
 * changing the test script or another file.
 */
function harness(
	before: Fields,
	after: (pin: string) => Fields,
	work?: { script?: string; file?: string },
) {
	const dir = mkdtempSync(join(tmpdir(), "harness-bump-self-"));
	made.push(dir);
	git(dir, "init", "-q", "-b", "main");
	write(dir, { "package.json": manifest(before), "bun.lock": "lock\n", "src.ts": "1\n" });
	git(dir, "add", "-A");
	git(dir, "commit", "-qm", "pinned");
	const pin = git(dir, "rev-parse", "HEAD");
	write(dir, { "package.json": manifest(after(pin)), "bun.lock": `lock ${pin}\n` });
	git(dir, "commit", "-qam", "merged bump");
	if (work) {
		write(dir, {
			"package.json": manifest(after(pin), work.script),
			...(work.file && { "src.ts": work.file }),
		});
		git(dir, "commit", "-qam", "work");
	}
	return { dir, pin, head: git(dir, "rev-parse", "HEAD") };
}

const dev = (sha: string): Fields => ({ devDependencies: spec(sha) });
const twice = (sha: string): Fields => ({
	dependencies: spec(sha),
	devDependencies: spec(sha),
});

/** An injected install that rewrites the lockfile, every call recorded. */
function runner() {
	const calls: string[][] = [];
	const run = (argv: string[], cwd: string) => {
		calls.push(argv);
		writeFileSync(join(cwd, "bun.lock"), "lock moved\n");
		return 0;
	};
	return { calls, run };
}

const QUIET = { sha: "", old: "", behind: "" };

/** The repository's commit and working tree, to show a case left both alone. */
const state = (dir: string) => [
	git(dir, "rev-parse", "HEAD"),
	git(dir, "status", "--porcelain"),
	readFileSync(join(dir, "package.json"), "utf8"),
];

describe("a run that proposes nothing", () => {
	// spec: harness-updates/a-head-not-yet-green-proposes-nothing
	test.each([
		["has no successful test run", "head", []],
		["is the pinned commit", "pin", [GREEN]],
	] as const)("a head that %s changes nothing", async (_, served, runs) => {
		const repo = harness(dev(OLD), dev);
		api.head = repo[served];
		api.runs = [...runs];
		const before = state(repo.dir);
		const { run, calls } = runner();
		expect(await bumpSelf(repo.dir, { api: server.url.origin, run })).toEqual(QUIET);
		expect(calls).toEqual([]);
		expect(state(repo.dir)).toEqual(before);
	});

	// spec: harness-updates/a-merged-bump-proposes-nothing
	test.each([
		["devDependencies alone", dev(OLD), dev],
		["both harness fields", twice(OLD), twice],
	])("a head that is a merged bump moving %s changes nothing", async (_, before, after) => {
		const repo = harness(before, after);
		api.head = repo.head;
		api.runs = [GREEN];
		const was = state(repo.dir);
		const { run, calls } = runner();
		expect(await bumpSelf(repo.dir, { api: server.url.origin, run })).toEqual(QUIET);
		expect(calls).toEqual([]);
		expect(state(repo.dir)).toEqual(was);
	});
});

describe("two different pins", () => {
	// spec: harness-updates/the-self-bump-refuses-two-different-pins
	test.each([
		["green, differing from the pin only in those fields", "head", [GREEN]],
		["not green", "head", []],
		["the pinned commit", "pin", [GREEN]],
	] as const)("are refused with a head %s, the tree unchanged", async (_, served, runs) => {
		const repo = harness(twice(OLD), (pin) => ({
			dependencies: spec(pin),
			devDependencies: spec(OLD),
		}));
		api.head = repo[served];
		api.runs = [...runs];
		const before = state(repo.dir);
		const { run, calls } = runner();
		const refused = await bumpSelf(repo.dir, { api: server.url.origin, run }).then(
			() => "",
			(error: Error) => error.message,
		);
		expect(refused).toContain("devDependencies.harness");
		expect(calls).toEqual([]);
		expect(state(repo.dir)).toEqual(before);
	});
});

describe("a run that proposes a bump", () => {
	// spec: harness-updates/a-green-main-the-pin-lags-gets-a-bump-pull-request
	// spec: harness-updates/a-manifest-change-that-is-no-bump-is-proposed
	test.each([
		["another file", { file: "2\n" }],
		["package.json's test script", { script: "bun test --bail" }],
	])("a head that changed %s gets one commit moving the pin to it", async (_, work) => {
		const repo = harness(dev(OLD), dev, work);
		api.head = repo.head;
		api.runs = [GREEN];
		const { run, calls } = runner();
		const result = await bumpSelf(repo.dir, { api: server.url.origin, run });
		expect(result).toEqual({ sha: repo.head, old: repo.pin, behind: "2" });
		expect(calls).toEqual([["bun", "install", "--ignore-scripts"]]);
		expect(git(repo.dir, "rev-list", "--count", `${repo.head}..HEAD`)).toBe("1");
		expect(git(repo.dir, "log", "-1", "--format=%an|%cn|%s")).toBe(
			`github-actions[bot]|github-actions[bot]|Bump harness ${repo.pin.slice(0, 7)}..${repo.head.slice(0, 7)}`,
		);
		expect(git(repo.dir, "diff", "--name-only", "HEAD~1", "HEAD")).toBe(
			"bun.lock\npackage.json",
		);
		const moved = JSON.parse(git(repo.dir, "show", "HEAD:package.json"));
		expect(moved.devDependencies.harness).toBe(spec(repo.head));
	});
});

describe("bump.ts self run as a script", () => {
	async function script(dir: string, env: Record<string, string> = {}) {
		const child = Bun.spawn(["bun", join(import.meta.dir, "bump.ts"), "self"], {
			cwd: dir,
			env: { ...process.env, GITHUB_API_URL: server.url.origin, ...env },
			stderr: "pipe",
		});
		return { code: await child.exited, stderr: await new Response(child.stderr).text() };
	}

	test("appends sha, old and behind to GITHUB_OUTPUT when set", async () => {
		const repo = harness(dev(OLD), dev);
		api.head = repo.head;
		api.runs = [];
		const out = mkdtempSync(join(tmpdir(), "harness-bump-self-out-"));
		made.push(out);
		const output = join(out, "output");
		expect((await script(repo.dir, { GITHUB_OUTPUT: output })).code).toBe(0);
		expect(readFileSync(output, "utf8")).toBe("sha=\nold=\nbehind=\n");
	}, 20_000);

	// spec: harness-updates/the-self-bump-refuses-two-different-pins
	test("exits 1 and prints why on two different pins", async () => {
		const repo = harness(twice(OLD), (pin) => ({
			dependencies: spec(pin),
			devDependencies: spec(OLD),
		}));
		const { code, stderr } = await script(repo.dir);
		expect(code).toBe(1);
		expect(stderr).toContain("devDependencies.harness");
	}, 20_000);
});
