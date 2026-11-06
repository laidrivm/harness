/**
 * Preloaded by the harness's `bunfig.toml` after `git-env-guard.ts`, so a
 * refused run makes nothing: keeps a run's temporary directories under one
 * `harness-test-*` parent, which `process.env.TMPDIR` points at — bun reads it
 * at each `tmpdir()` — and a global `afterAll` removes (design of
 * one-tmpdir-per-test-run, decision 1). A `Bun.spawn` without `env` still
 * hands its child the starting `TMPDIR`.
 *
 * Before making it, sweeps the parents and claims other runs left unmodified
 * for an hour (decision 3): each is touched, then renamed to a new
 * `harness-swept-*` name, so of runs starting together one removes it, then
 * removed. No signal handler (decision 4): a killed run's parent waits for a
 * later run's sweep. No leftover fails a run: an entry another run claims
 * between two steps, or one that cannot be removed, is skipped.
 */
import { afterAll } from "bun:test";
import { lstatSync, mkdtempSync, readdirSync, renameSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOUR = 60 * 60 * 1000;
const start = tmpdir();

for (const name of readdirSync(start)) {
	if (!name.startsWith("harness-test-") && !name.startsWith("harness-swept-")) continue;
	const path = join(start, name);
	try {
		const stat = lstatSync(path);
		if (!stat.isDirectory() || Date.now() - stat.mtimeMs < HOUR) continue;
		const now = new Date();
		utimesSync(path, now, now);
		const claim = join(start, `harness-swept-${crypto.randomUUID()}`);
		renameSync(path, claim);
		rmSync(claim, { recursive: true, force: true });
	} catch {
		// Claimed by another run, or not removable: a later sweep tries again.
	}
}

const parent = mkdtempSync(join(start, "harness-test-"));
process.env.TMPDIR = parent;

afterAll(() => {
	try {
		rmSync(parent, { recursive: true, force: true });
	} catch {
		// What is left waits for a later run's sweep.
	}
});
