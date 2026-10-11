/**
 * The checking half of a consumer's bump, against a local stand-in for
 * GitHub's API and a real git repository. The install and the gate's
 * commands are injected, so no case reaches the network or runs a suite.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verify } from "./bump.ts";

const OLD = "eddf1fdd56642c48a3b222034ec6268c9b55971f";
const NEW = "9d321b61a74c70d4d3324d11e64fef488f2202a0";

/** What the stand-in serves: `main`'s head, and that commit's `test` runs. */
let head = NEW;
let runs: { conclusion: string | null }[] = [];
let server: ReturnType<typeof Bun.serve>;
const made: string[] = [];

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		fetch(request) {
			const path = new URL(request.url).pathname;
			if (path === "/repos/laidrivm/harness/commits/main")
				return Response.json({ sha: head });
			if (path === `/repos/laidrivm/harness/commits/${head}/check-runs`)
				return Response.json({ check_runs: runs });
			return new Response("not found", { status: 404 });
		},
	});
});

afterAll(() => {
	server.stop(true);
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const git = (dir: string, ...args: string[]) =>
	Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
		cwd: dir,
	})
		.stdout.toString()
		.trim();

/** A consumer pinned to `OLD`, every file a bump writes committed. */
function consumer(harness: Record<string, unknown> = { bumpTest: "bun test" }) {
	const dir = mkdtempSync(join(tmpdir(), "harness-bump-verify-"));
	made.push(dir);
	const files = {
		"package.json": `${JSON.stringify(
			{ dependencies: { harness: `github:laidrivm/harness#${OLD}` }, harness },
			null,
			"\t",
		)}\n`,
		"bun.lock": "lock\n",
		"harness/rules.md": "# rules\n",
		".claude/settings.json": "{}\n",
		"bunfig.toml": "[install]\n",
	};
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	git(dir, "init", "-q");
	git(dir, "add", "-A");
	git(dir, "commit", "-qm", "consumer");
	return dir;
}

/** An injected runner: each command's exit code by step, every call recorded. */
function runner(fail?: string) {
	const calls: { argv: string[]; cwd: string }[] = [];
	const step = (argv: string[]) =>
		argv[0] === "sh"
			? "bumpTest"
			: (argv.find((a) => a.endsWith(".ts"))?.match(/(\w+)\.ts$/)?.[1] ??
				"install");
	const run = (argv: string[], cwd: string) => {
		calls.push({ argv, cwd });
		return step(argv) === fail ? 1 : 0;
	};
	return { calls, steps: () => calls.map((c) => step(c.argv)), run };
}

const deps = (run: ReturnType<typeof runner>["run"]) => ({
	api: server.url.origin,
	run,
});

describe("choosing a target", () => {
	// spec: harness-updates/a-quiet-day-changes-nothing
	test.each([
		["still running", NEW, [{ conclusion: null }]],
		["failed", NEW, [{ conclusion: "failure" }]],
		["absent", NEW, []],
		["green but already pinned", OLD, [{ conclusion: "success" }]],
	])("a head whose test run is %s reports no target and changes nothing", async (_, sha, served) => {
		head = sha;
		runs = served;
		const dir = consumer();
		const before = readFileSync(join(dir, "package.json"), "utf8");
		const { run, calls } = runner();
		expect(await verify(dir, deps(run))).toEqual({ sha: "", tree: "" });
		expect(calls).toEqual([]);
		expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
	});
});

describe("the gate", () => {
	const green = () => {
		head = NEW;
		runs = [{ conclusion: "success" }];
	};

	// spec: harness-updates/a-bump-that-passes-reports-what-it-checked
	test("all passing runs install, sync, check, bumpTest in order and reports the tree", async () => {
		green();
		const dir = consumer();
		const { run, calls, steps } = runner();
		const result = await verify(dir, deps(run));
		expect(steps()).toEqual(["install", "sync", "check", "bumpTest"]);
		expect(calls.every((c) => c.cwd === dir)).toBe(true);
		expect(calls[3]?.argv).toEqual(["sh", "-c", "bun test"]);
		expect(result).toEqual({ sha: NEW, tree: git(dir, "write-tree") });
		expect(git(dir, "diff", "--cached", "--name-only")).toBe("package.json");
		expect(git(dir, "rev-list", "--count", "HEAD")).toBe("1");
	});

	// spec: harness-updates/a-bump-that-fails-the-consumer-s-checks-does-not-land
	test.each(["install", "sync", "check", "bumpTest"])(
		"a failing %s rejects naming it and runs nothing after it",
		async (fail) => {
			green();
			const dir = consumer();
			const { run, steps } = runner(fail);
			await expect(verify(dir, deps(run))).rejects.toThrow(`at ${fail}`);
			const all = ["install", "sync", "check", "bumpTest"];
			expect(steps()).toEqual(all.slice(0, all.indexOf(fail) + 1));
			expect(git(dir, "rev-list", "--count", "HEAD")).toBe("1");
		},
	);

	test("a consumer with no bumpTest fails naming the key before any call", async () => {
		green();
		const dir = consumer({});
		const { run, calls } = runner();
		await expect(verify(dir, deps(run))).rejects.toThrow("harness.bumpTest");
		expect(calls).toEqual([]);
	});
});
