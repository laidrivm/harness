#!/usr/bin/env bun
/**
 * Stryker's `buildCommand`, run once in its sandbox before the dry run. The sandbox sits under the checkout and holds
 * no `.git`, so git found the checkout from it, and a mutant that ran `sync.ts`'s main block in a test wrote the
 * checkout's `harness/` and `bunfig.toml`. A repository of the sandbox's own stops git at the sandbox; it is committed,
 * so a test reading `HEAD` reads the sandbox's, and remade when an earlier attempt left it without one. The `-c` values
 * keep the user's identity, signing and hooks out of it.
 *
 * Its git runs without the variables git names as local, though `bun/mutation-run.ts` already starts Stryker without
 * them: an inherited `GIT_DIR` or `GIT_WORK_TREE` outranks the sandbox's `.git` and would commit in the checkout.
 */
import { realpathSync, rmSync } from "node:fs";
import { unlocal } from "./git-local.ts";

// The identity variables too: they outrank `-c user.name`, and would put the caller's identity on the sandbox commit.
const identity = /^GIT_(AUTHOR|COMMITTER)_(NAME|EMAIL)$/;
const env = Object.fromEntries(Object.entries(unlocal(process.env)).filter(([key]) => !identity.test(key)));
const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { env, stdout: "pipe", stderr: "inherit" });
const fail = (step: string) => {
	console.error(`mutation-sandbox: git ${step} failed`);
	process.exit(1);
};

// The top level first: with no `.git` here, or one git does not accept, git answers from the checkout around it.
const top = git("rev-parse", "--show-toplevel").stdout.toString().trim();
if (top !== realpathSync(".") || git("rev-parse", "-q", "--verify", "HEAD").exitCode !== 0) {
	rmSync(".git", { recursive: true, force: true });
	if (git("init", "-q").exitCode !== 0) fail("init");
	if (git("add", "-A").exitCode !== 0) fail("add");
	// `author.*` and `committer.*` too: a global one outranks `user.*` given on the command line.
	const values = ["user", "author", "committer"].flatMap((who) => [
		"-c",
		`${who}.name=stryker`,
		"-c",
		`${who}.email=stryker@sandbox`,
	]);
	values.push("-c", "commit.gpgsign=false");
	if (git(...values, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "sandbox").exitCode !== 0) fail("commit");
}
