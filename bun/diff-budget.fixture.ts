/**
 * What the diff budget's test files need to drive it: a repository built for
 * one case, and the gate run over it with its output parsed.
 *
 * Every case runs against a repository built for it. Measuring the live branch
 * would change the verdict with every commit, which is the one property a test
 * of a threshold cannot have.
 *
 * Its own module because the cases split across three files and this
 * fabricates a repository rather than stubbing one — a second copy would drift
 * in what it builds while every file still passed. `afterAll` is not registered
 * here: a lifecycle hook belongs to the file it runs for, so each test file
 * registers `cleanup` itself.
 */
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The gate itself. Exported because the cases about how it is invoked — no
 * base argument, no repository at all — run it directly rather than through
 * `gate`, which always passes one.
 */
export const script = join(import.meta.dir, "diff-budget.sh");

const made: string[] = [];

/** Removes every repository fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** A tracked temporary directory with no repository in it. */
export const emptyDir = (prefix = "diff-budget-") => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	made.push(dir);
	return dir;
};

export const git = (cwd: string, ...args: string[]) => {
	const p = Bun.spawnSync(["git", ...args], { cwd });
	if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr}`);
};

/** `null` deletes the file; `Uint8Array` writes bytes, so a binary stays binary. */
type Tree = Record<string, string | Uint8Array | null>;

const put = (dir: string, tree: Tree) => {
	for (const [path, content] of Object.entries(tree)) {
		const full = join(dir, path);
		if (content === null) {
			unlinkSync(full);
			continue;
		}
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	}
};

export const repo = (base: Tree, head: Tree) => {
	const dir = emptyDir();
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "test@example.com");
	git(dir, "config", "user.name", "Test");
	put(dir, base);
	git(dir, "add", "-A");
	git(dir, "commit", "-qm", "base");
	git(dir, "checkout", "-qb", "feature");
	put(dir, head);
	git(dir, "add", "-A");
	git(dir, "commit", "-qm", "head", "--allow-empty");
	return dir;
};

export const gate = (dir: string, base = "main", body?: string) => {
	const p = Bun.spawnSync(["bash", script, base], {
		cwd: dir,
		// Always set, so a `PR_BODY` exported in the developer's own shell
		// cannot turn a case that expects FAIL into an OVERRIDE.
		env: { ...process.env, PR_BODY: body ?? "" },
	});
	return {
		line: p.stdout.toString().trim(),
		stderr: p.stderr.toString().trim(),
		code: p.exitCode,
		total: Number(p.stdout.toString().match(/— (\d+) lines/)?.[1]),
		source: Number(p.stdout.toString().match(/\((\d+) source/)?.[1]),
		test: Number(p.stdout.toString().match(/(\d+) test\)/)?.[1]),
	};
};

/** N distinct lines, so no pairing can occur by accident. */
export const lines = (n: number) =>
	`${Array.from({ length: n }, (_, i) => `line ${i}`).join("\n")}\n`;

export const tasks = (n: number, box: " " | "x") =>
	`${Array.from({ length: n }, (_, i) => `- [${box}] task ${i}`).join("\n")}\n`;
