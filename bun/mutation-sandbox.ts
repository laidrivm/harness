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
import { existsSync, rmSync } from "node:fs";
import { unlocal } from "./git-local.ts";

const env = unlocal(process.env);
const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { env, stdout: "ignore", stderr: "inherit" });
const fail = (step: string) => {
	console.error(`mutation-sandbox: git ${step} failed`);
	process.exit(1);
};

if (!existsSync(".git") || git("rev-parse", "-q", "--verify", "HEAD").exitCode !== 0) {
	rmSync(".git", { recursive: true, force: true });
	if (git("init", "-q").exitCode !== 0) fail("init");
	if (git("add", "-A").exitCode !== 0) fail("add");
	const identity = ["-c", "user.name=stryker", "-c", "user.email=stryker@sandbox", "-c", "commit.gpgsign=false"];
	if (git(...identity, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "sandbox").exitCode !== 0) fail("commit");
}
