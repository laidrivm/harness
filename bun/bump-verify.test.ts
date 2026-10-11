/**
 * The checking half of a consumer's bump, against a local stand-in for
 * GitHub's API and a real git repository. The install and the gate's
 * commands are injected, so no case reaches the network or runs a suite.
 */
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CHECK, verify } from "./bump.ts";

const OLD = "eddf1fdd56642c48a3b222034ec6268c9b55971f";
const NEW = "9d321b61a74c70d4d3324d11e64fef488f2202a0";

/** What the stand-in serves: `main`'s head, and that commit's `test` runs. */
let head = NEW;
let runs: { conclusion: string | null }[] = [];
let broken = false;
const seen: (string | null)[] = [];
let server: ReturnType<typeof Bun.serve>;
const made: string[] = [];

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		fetch(request) {
			const path = new URL(request.url).pathname;
			seen.push(request.headers.get("authorization"));
			if (broken) return new Response("down", { status: 500 });
			if (path === "/repos/laidrivm/harness/commits/main")
				return Response.json({ sha: head });
			if (path === `/repos/laidrivm/harness/commits/${head}/check-runs`)
				return Response.json({ check_runs: runs });
			return new Response("not found", { status: 404 });
		},
	});
});

beforeEach(() => {
	broken = false;
	seen.length = 0;
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

describe("what verify stages and asks", () => {
	test("a file the test run leaves behind stays out of the tree", async () => {
		head = NEW;
		runs = [{ conclusion: "success" }];
		const dir = consumer();
		const { run: base } = runner();
		const run = (argv: string[], cwd: string) => {
			if (argv[0] === "sh") writeFileSync(join(cwd, "coverage.txt"), "x\n");
			return base(argv, cwd);
		};
		const { tree } = await verify(dir, deps(run));
		expect(git(dir, "ls-tree", "-r", "--name-only", tree)).not.toContain(
			"coverage.txt",
		);
	});

	test("a token given is sent as a Bearer header on every request", async () => {
		head = OLD;
		runs = [{ conclusion: "success" }];
		await verify(consumer(), { ...deps(runner().run), token: "t0k" });
		expect(seen).toEqual(["Bearer t0k", "Bearer t0k"]);
	});

	test("an API answer that is not OK rejects naming the path", async () => {
		broken = true;
		const { run, calls } = runner();
		await expect(verify(consumer(), deps(run))).rejects.toThrow(
			"commits/main: 500",
		);
		expect(calls).toEqual([]);
	});
});

describe("bump.ts run as a script", () => {
	/** The script in `dir`, asynchronously so the stand-in can answer it. */
	async function script(dir: string, env: Record<string, string> = {}) {
		const child = Bun.spawn(["bun", join(import.meta.dir, "bump.ts"), "verify"], {
			cwd: dir,
			env: { ...process.env, GITHUB_API_URL: server.url.origin, ...env },
			stderr: "pipe",
		});
		return { code: await child.exited, stderr: await new Response(child.stderr).text() };
	}

	test("appends its outputs to GITHUB_OUTPUT when set", async () => {
		head = OLD;
		runs = [{ conclusion: "success" }];
		const dir = consumer();
		const output = join(dir, "output");
		expect((await script(dir, { GITHUB_OUTPUT: output })).code).toBe(0);
		expect(readFileSync(output, "utf8")).toBe("sha=\ntree=\n");
	}, 20_000);

	test("exits 1 and prints why when verify fails", async () => {
		broken = true;
		const { code, stderr } = await script(consumer());
		expect(code).toBe(1);
		expect(stderr).toContain("commits/main: 500");
	}, 20_000);
});

describe("the check a bump waits for", () => {
	// A check run is named by its job's `name`, or by the job's key without one.
	test("the harness's own CI has a job of that name, run on a push to main", () => {
		const workflow = Bun.YAML.parse(
			readFileSync(join(import.meta.dir, "../.github/workflows/test.yml"), "utf8"),
		) as {
			on: { push?: { branches?: string[] } };
			jobs: Record<string, { name?: string }>;
		};
		const names = Object.entries(workflow.jobs).map(([key, job]) => job.name ?? key);
		expect(names).toContain(CHECK);
		expect(workflow.on.push?.branches).toContain("main");
	});
});
