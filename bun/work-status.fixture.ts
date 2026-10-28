/**
 * What `work.ts status`'s two test files share: the command run as a session
 * runs it, against `standIn()` with the ask settings of `work-take.fixture.ts`,
 * a `git` that logs each call, its own `TMPDIR` and ledger; and a clone of a
 * bare `origin` whose `main` a seed repository advances after the clone.
 */
import { expect } from "bun:test";
import { chmodSync, existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir, git, put, repo } from "./diff-budget.fixture.ts";
import { records } from "./goal-check.fixture.ts";
import { CARD, standIn, TOKEN } from "./notion-bot.fixture.ts";
import { home } from "./work-take.fixture.ts";

export { CARD };
type Tree = Record<string, string | null>;

/** A whole change `slug`, its `tasks.md` reading `tasks`. */
export const change = (slug: string, tasks = "## 1. One\n\n- [x] 1.1 a\n"): Tree => ({
	[`openspec/changes/${slug}/proposal.md`]: "# p\n",
	[`openspec/changes/${slug}/design.md`]: "# d\n",
	[`openspec/changes/${slug}/tasks.md`]: tasks,
	[`openspec/changes/${slug}/specs/x/spec.md`]: "# x\n",
});

/** `slug` archived under `date`, its active directory removed when `active` holds it. */
export const archived = (slug: string, date = "2026-10-27", active = false): Tree => ({
	...(active ? Object.fromEntries(Object.keys(change(slug)).map((path) => [path, null])) : {}),
	[`openspec/changes/archive/${date}-${slug}/proposal.md`]: "# p\n",
});

/** Commits `tree` in `dir`, and pushes it to `origin`'s `main` when `push`. */
export function commit(dir: string, tree: Tree, push = false) {
	put(dir, tree);
	git(dir, "add", "-A");
	git(dir, "commit", "-qm", "next");
	if (push) git(dir, "push", "-q", "origin", "main");
}

/** A seed on `main` holding `tree` and a `package.json` naming `demo`, its bare `origin`, and a clone (`--single-branch` of `feature` when `single`). */
export function clone(tree: Tree = {}, single = false) {
	const seed = repo({ "package.json": JSON.stringify({ name: "demo" }), ...tree }, {});
	const bare = join(emptyDir("work-status-origin-"), "demo.git");
	git(seed, "init", "-q", "--bare", bare);
	git(seed, "remote", "add", "origin", bare);
	git(seed, "push", "-q", "origin", "main", "feature");
	git(seed, "checkout", "-q", "main");
	const dir = join(emptyDir("work-status-clone-"), "c");
	git(seed, "clone", "-q", ...(single ? ["--single-branch", "-b", "feature"] : []), bare, dir);
	git(dir, "config", "user.email", "test@example.com");
	git(dir, "config", "user.name", "Test");
	return { seed, dir };
}

/** The card as the stand-in answers it, the board's card count, and the run's surroundings. */
export type Run = {
	args: string[];
	cwd?: string;
	page?: { status?: string; pointer?: string; parent?: object; answer?: string };
	cards?: number;
	more?: boolean;
	fail?: Record<string, number>;
	env?: Record<string, string>;
	config?: string;
};

/** `bun bun/work.ts …args` and what it did; it throws when a printed line holds the token. */
export async function status({ args, cwd = emptyDir(), page = {}, cards = 0, more = false, fail = {}, env, config = home() }: Run) {
	const notion = standIn();
	Object.assign(notion.state, page, { cards: Array.from({ length: cards }, (_, i) => ({ id: `c${i}` })), more, fail });
	const bin = emptyDir("work-status-bin-");
	const log = join(bin, "git.log");
	writeFileSync(join(bin, "git"), `#!/bin/sh\necho "$1" >> '${log}'\nexec '${Bun.which("git")}' "$@"\n`);
	chmodSync(join(bin, "git"), 0o755);
	symlinkSync(Bun.which("tar") ?? "/usr/bin/tar", join(bin, "tar"));
	const [tmp, ledger] = [emptyDir("work-status-tmp-"), emptyDir("work-status-state-")];
	const child = Bun.spawn([process.execPath, join(import.meta.dir, "work.ts"), ...args], {
		cwd,
		env: { PATH: bin, HOME: config, XDG_CONFIG_HOME: config, XDG_STATE_HOME: ledger, TMPDIR: tmp, HARNESS_NOTION_API_URL: notion.server.url.origin, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	notion.server.stop(true);
	if ((out + err).includes(TOKEN)) throw new Error("the token was printed");
	const gitRan = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
	const last = out.trim().split("\n").at(-1) ?? "";
	return { out, err, code, last, seen: notion.state.seen, bodies: notion.state.bodies, refusals: records(ledger, "status"), git: gitRan, left: readdirSync(tmp) };
}

export const PAGE = `GET /v1/pages/${CARD}`;
export const PATCH = `PATCH /v1/pages/${CARD}`;

/** A refusal: exit 1, no write, one `status` record under `rule`. */
export function refused(run: Awaited<ReturnType<typeof status>>, rule: string) {
	expect(run.last).toStartWith("status: refused — ");
	expect([run.code, run.seen.includes(PATCH), run.refusals.map((r) => r.rule)]).toEqual([1, false, [rule]]);
}
