#!/usr/bin/env bun
/**
 * The pre-push hook's skip, `bun bun/push-proven.ts || bash .githooks/gates.sh`:
 * exits 0 with a line saying the gates were skipped when the push updates no
 * tag and every commit it lands — each record's local sha, a ref's tip, never
 * the commits below it — has a passing pre-PR record of
 * `project-checks` made in this checkout and none that failed or erred;
 * otherwise prints why the gates run and exits 1. A lightweight tag's sha is
 * its commit's, so a tag is told by its remote ref, a deleted one included.
 * The ledger is read once and written never; an unreadable one, no commit, or
 * any other exit — `root.ts` throwing outside a repository — runs the gates.
 * Its name and lines live here because the hook's text may hold no `pre-pr`.
 */
import { readFileSync } from "node:fs";
import { ledgerFile, ran } from "./gate-ledger.ts";
import { pushRefs } from "./push-refs.ts";
import { root } from "./root.ts";

const refs = pushRefs(await Bun.stdin.text());
const shas = refs.filter((r) => !r.deletion).map((r) => r.sha);
const named = (list: string[]) => list.map((sha) => sha.slice(0, 7)).join(", ");

/** Why the gates run, or nothing when every commit is proven. */
function reason(): string | undefined {
	if (!shas.length) return "the push lands no commit";
	if (refs.some((r) => r.ref.startsWith("refs/tags/"))) return "the push updates a tag";
	let ledger: string;
	try {
		ledger = readFileSync(ledgerFile(), "utf8");
	} catch {
		return `the gate ledger ${ledgerFile()} cannot be read`;
	}
	const proven = (sha: string) =>
		ran(sha, root, "pass", ledger, "project-checks") &&
		!ran(sha, root, "fail", ledger, "project-checks") &&
		!ran(sha, root, "error", ledger, "project-checks");
	const unproven = shas.filter((sha) => !proven(sha));
	if (unproven.length)
		return `no passing pre-PR record of project-checks for ${named(unproven)} here, or a failing one beside it`;
}

const why = reason();
if (why) {
	process.stderr.write(`pre-push: running the gates — ${why}\n`);
	process.exit(1);
}
process.stderr.write(
	`pre-push: gates skipped — a passing pre-PR record of project-checks names ${named(shas)} here; bash .githooks/gates.sh runs them by hand\n`,
);
