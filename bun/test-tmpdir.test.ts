/**
 * `test-tmpdir.ts`, the preload that keeps a run's temporary directories
 * under one parent. Each case writes a small project preloading it by
 * absolute path and runs `bun test` there against a `TMPDIR` of its own, so
 * no case reads or writes the `TMPDIR` other runs share (design, decision 5).
 * The fixture's test writes `tmpdir()`, the parent, to the file `OUT` names.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PRELOAD = join(import.meta.dir, "test-tmpdir.ts");
const HOURS_2 = 2 * 60 * 60 * 1000;
const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	made.push(dir);
	return dir;
}

/** What a fixture's test does after making its directory and writing the parent down. */
const BODIES = {
	pass: "",
	fail: "expect(1).toBe(2);",
	exit: "process.exit(0);",
	hang: "await new Promise(() => {});",
	locked:
		'const locked = join(made, "locked"); mkdirSync(locked); writeFileSync(join(locked, "f"), ""); chmodSync(locked, 0o500); appendFileSync(process.env.OUT ?? "", `${locked}\\n`);',
};

const fixture = (body: string) => `import { expect, test } from "bun:test";
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("makes a directory", async () => {
	const made = mkdtempSync(join(tmpdir(), "fixture-"));
	appendFileSync(process.env.OUT ?? "", \`\${tmpdir()}\\n\`);
	${body}
	expect(made.length).toBeGreaterThan(0);
});
`;

/** A project whose test files run `bodies`, one file each, and an empty `TMPDIR` for it. */
function project(...bodies: (keyof typeof BODIES)[]): { dir: string; tmp: string; out: string } {
	const dir = scratch("test-tmpdir-project-");
	writeFileSync(join(dir, "bunfig.toml"), `[test]\npreload = [${JSON.stringify(PRELOAD)}]\n`);
	bodies.forEach((body, i) => {
		writeFileSync(join(dir, `t${i}.test.ts`), fixture(BODIES[body]));
	});
	const out = join(dir, "out");
	writeFileSync(out, "");
	return { dir, tmp: scratch("test-tmpdir-tmp-"), out };
}

const env = (tmp: string, out: string) => ({ ...process.env, TMPDIR: tmp, OUT: out });

function run(p: { dir: string; tmp: string; out: string }): { code: number; lines: string[] } {
	// Below each case's 30 s, so a slow nested run reads as this limit, not as one bun could not fire.
	const r = Bun.spawnSync([process.execPath, "test"], { cwd: p.dir, env: env(p.tmp, p.out), timeout: 20_000 });
	return { code: r.exitCode ?? -1, lines: readFileSync(p.out, "utf8").split("\n").filter(Boolean) };
}

/** Sets `path`'s modification time two hours back. */
function backdate(path: string): void {
	const when = new Date(Date.now() - HOURS_2);
	utimesSync(path, when, when);
}

/** A directory under `tmp`, holding one file, last modified two hours ago, or a minute ago if `recent`. */
function aged(tmp: string, name: string, recent = false): string {
	const path = join(tmp, name);
	mkdirSync(path);
	writeFileSync(join(path, "f"), "");
	if (recent) {
		const when = new Date(Date.now() - 60_000);
		utimesSync(path, when, when);
	} else backdate(path);
	return path;
}

describe("the harness's own suite", () => {
	// spec: test-temp-dir/a-fixture-s-temporary-directory-lands-in-the-parent
	test("runs under a harness-test-* parent, so its bunfig.toml preloads the module", () => {
		expect(basename(tmpdir())).toStartWith("harness-test-");
	});
});

// Root ignores permission bits, so a directory it cannot write to never exists for it.
const ROOT_USER = process.getuid?.() === 0;

describe("a run's parent", () => {
	// spec: test-temp-dir/a-fixture-s-temporary-directory-lands-in-the-parent
	test("a test's tmpdir() is a harness-test-* directory directly under the run's TMPDIR", () => {
		const p = project("pass");
		const { code, lines } = run(p);
		const parent = lines[0] ?? "";
		expect([code, dirname(parent), basename(parent).startsWith("harness-test-")]).toEqual([0, p.tmp, true]);
	}, 30_000);

	// spec: test-temp-dir/test-files-of-one-run-share-the-parent
	test("two test files, each making a directory, pass under one parent", () => {
		const { code, lines } = run(project("pass", "pass"));
		expect([code, lines.length, new Set(lines).size]).toEqual([0, 2, 1]);
	}, 30_000);

	// spec: test-temp-dir/a-run-that-ends-leaves-nothing
	test("after a passing run the parent it made is gone", () => {
		const p = project("pass");
		const { code, lines } = run(p);
		expect([code, lines.length, existsSync(lines[0] ?? p.tmp)]).toEqual([0, 1, false]);
	}, 30_000);

	// spec: test-temp-dir/a-run-whose-tests-fail-leaves-nothing
	test("after a failing run the parent it made is gone", () => {
		const p = project("fail");
		const { code, lines } = run(p);
		expect([code === 0, lines.length, existsSync(lines[0] ?? p.tmp)]).toEqual([false, 1, false]);
	}, 30_000);

	// spec: test-temp-dir/a-parent-that-cannot-be-removed-at-the-end
	test.skipIf(ROOT_USER)(
		"a passing run whose test leaves an unwritable non-empty directory exits 0 (skipped as root)",
		() => {
			const p = project("locked");
			try {
				const { code, lines } = run(p);
				// The lock still there shows the removal failed, so the exit code is the catch's.
				expect([code, existsSync(lines[1] ?? "")]).toEqual([0, true]);
			} finally {
				for (const line of readFileSync(p.out, "utf8").split("\n"))
					if (line.endsWith("/locked") && existsSync(line)) chmodSync(line, 0o755);
			}
		},
		30_000,
	);

	// spec: test-temp-dir/a-run-killed-mid-test
	test("a run killed with SIGKILL once its test made a directory leaves the parent it made", async () => {
		const p = project("hang");
		const child = Bun.spawn([process.execPath, "test"], { cwd: p.dir, env: env(p.tmp, p.out) });
		const deadline = Date.now() + 20_000;
		while (readFileSync(p.out, "utf8") === "" && Date.now() < deadline) await Bun.sleep(50);
		child.kill("SIGKILL");
		await child.exited;
		const parent = readFileSync(p.out, "utf8").trim();
		expect([dirname(parent), existsSync(parent), readdirSync(p.tmp)]).toEqual([p.tmp, true, [basename(parent)]]);
	}, 30_000);

	// spec: test-temp-dir/a-run-stopped-by-a-test-s-process-exit
	test("a run whose test calls process.exit(0) leaves the parent it made", () => {
		const p = project("exit");
		const { code, lines } = run(p);
		const parent = lines[0] ?? "";
		expect([code, dirname(parent), existsSync(parent), readdirSync(p.tmp)]).toEqual([
			0,
			p.tmp,
			true,
			[basename(parent)],
		]);
	}, 30_000);

	// spec: test-temp-dir/a-refused-run-makes-no-parent
	test("the harness's own suite refused under GIT_DIR makes no parent", () => {
		const tmp = scratch("test-tmpdir-tmp-");
		const r = Bun.spawnSync([process.execPath, "test", "bun/tracked.test.ts"], {
			cwd: ROOT,
			env: { ...process.env, TMPDIR: tmp, GIT_DIR: join(tmp, "..", "no-such-repository") },
			timeout: 60_000,
		});
		expect([r.exitCode === 0, r.stderr.toString().includes("GIT_DIR"), readdirSync(tmp)]).toEqual([false, true, []]);
	}, 90_000);
});

describe("the sweep at start", () => {
	// spec: test-temp-dir/a-later-run-removes-an-abandoned-parent
	test("a harness-test-* directory two hours old is gone, and no harness-swept-* entry is left", () => {
		const p = project("pass");
		aged(p.tmp, "harness-test-old");
		expect([run(p).code, readdirSync(p.tmp)]).toEqual([0, []]);
	}, 30_000);

	// spec: test-temp-dir/a-later-run-removes-an-abandoned-claim
	test("a harness-swept-* directory two hours old is gone", () => {
		const p = project("pass");
		aged(p.tmp, "harness-swept-old");
		expect([run(p).code, readdirSync(p.tmp)]).toEqual([0, []]);
	}, 30_000);

	// spec: test-temp-dir/runs-starting-together-sweep-one-parent-once
	test("four runs started together against one abandoned parent all exit 0 and leave nothing", async () => {
		const p = project("pass");
		aged(p.tmp, "harness-test-old");
		const runs = [0, 1, 2, 3].map(() => Bun.spawn([process.execPath, "test"], { cwd: p.dir, env: env(p.tmp, p.out) }));
		const codes = await Promise.all(runs.map((r) => r.exited));
		expect([codes, readdirSync(p.tmp)]).toEqual([[0, 0, 0, 0], []]);
	}, 30_000);

	// spec: test-temp-dir/a-later-run-keeps-a-parent-in-use
	test("a harness-test-* directory a minute old is still there", () => {
		const p = project("pass");
		aged(p.tmp, "harness-test-recent", true);
		expect([run(p).code, readdirSync(p.tmp)]).toEqual([0, ["harness-test-recent"]]);
	}, 30_000);

	// spec: test-temp-dir/other-entries-are-left-alone
	test("a directory of another name and a regular file named harness-test-x, two hours old, are still there", () => {
		const p = project("pass");
		aged(p.tmp, "other-old");
		const file = join(p.tmp, "harness-test-x");
		writeFileSync(file, "");
		backdate(file);
		expect([run(p).code, readdirSync(p.tmp).sort()]).toEqual([0, ["harness-test-x", "other-old"]]);
	}, 30_000);

	// spec: test-temp-dir/an-abandoned-parent-that-cannot-be-removed
	test.skipIf(ROOT_USER)(
		"an abandoned parent holding an unwritable non-empty directory leaves the run exiting 0 (skipped as root)",
		() => {
			const p = project("pass");
			const old = aged(p.tmp, "harness-test-old");
			const locked = join(old, "locked");
			mkdirSync(locked);
			writeFileSync(join(locked, "f"), "");
			chmodSync(locked, 0o500);
			backdate(old);
			try {
				const { code, lines } = run(p);
				// One claim holding the lock: the sweep reached the removal and it failed.
				const left = readdirSync(p.tmp);
				const claimed = left.filter((n) => n.startsWith("harness-swept-") && existsSync(join(p.tmp, n, "locked")));
				expect([code, lines.length, left.length, claimed.length]).toEqual([0, 1, 1, 1]);
			} finally {
				// The sweep renamed the parent before its removal failed, so the lock is wherever it now sits.
				for (const name of readdirSync(p.tmp))
					if (existsSync(join(p.tmp, name, "locked"))) chmodSync(join(p.tmp, name, "locked"), 0o755);
			}
		},
		30_000,
	);
});
