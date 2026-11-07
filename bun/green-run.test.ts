/**
 * The rule both the bump and the deploy decide a head's `test` runs by, and
 * the script `deploy.sh` pipes the pages it read to.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { collect, green } from "./green-run.ts";

const ours = (id: number, conclusion: string | null) => ({ id, conclusion, app: { slug: "github-actions" } });

describe("green", () => {
	// spec: harness-updates/a-quiet-day-changes-nothing
	test.each([
		["no runs", []],
		["another app's success alone", [{ id: 1, conclusion: "success", app: { slug: "other" } }]],
		["a pending run", [ours(1, null)]],
		["a failed run", [ours(1, "failure")]],
	])("%s is not green", (_, runs) => {
		expect(green(runs)).toBe(false);
	});

	// spec: harness-updates/a-quiet-day-changes-nothing
	test("a successful run is green", () => {
		expect(green([ours(1, "success")])).toBe(true);
	});

	// spec: harness-updates/an-older-check-suite-s-success-does-not-make-the-head-green
	test.each([
		["failure", "first"],
		["failure", "last"],
		[null, "first"],
		[null, "last"],
	])("an older success with a newer %s run listed %s is not green", (newer, order) => {
		const runs = [ours(5, "success"), ours(9, newer)];
		expect(green(order === "first" ? runs.toReversed() : runs)).toBe(false);
	});

	// spec: harness-updates/a-newer-check-suite-s-success-makes-the-head-green
	test.each(["first", "last"])("an older failure with a newer success listed %s is green", (order) => {
		const runs = [ours(5, "failure"), ours(9, "success")];
		expect(green(order === "first" ? runs.toReversed() : runs)).toBe(true);
	});

	test("another app's newer failure leaves the newest github-actions run deciding", () => {
		expect(green([ours(5, "success"), { id: 9, conclusion: "failure", app: { slug: "other" } }])).toBe(true);
	});
});

const page = (total: number, ...runs: unknown[]) => ({ total_count: total, check_runs: runs });

describe("collect", () => {
	// spec: harness-updates/test-runs-on-more-than-one-page
	test("no pages want the first", () => {
		expect(collect([])).toBe("more");
	});

	// spec: harness-updates/test-runs-on-more-than-one-page
	test("pages short of the first's total_count want another", () => {
		expect(collect([page(3, ours(1, "success"), ours(2, "success"))])).toBe("more");
	});

	// spec: harness-updates/test-runs-on-more-than-one-page
	test("pages that reach the count answer their runs together", () => {
		const [a, b, c] = [ours(1, "success"), ours(2, "failure"), ours(3, null)];
		expect(collect([page(3, a, b), page(3, c)])).toEqual([a, b, c]);
		expect(collect([page(0)])).toEqual([]);
	});

	// spec: harness-updates/test-runs-on-more-than-one-page
	test.each([
		["a first body with no total_count", [{ check_runs: [ours(1, "success")] }]],
		["a later body with no total_count", [page(2, ours(1, "success")), { check_runs: [ours(2, "success")] }]],
		["a body with no check_runs", [{ total_count: 1 }]],
		["a run with no id", [page(1, { conclusion: "success", app: { slug: "github-actions" } })]],
		["a last page with no runs while the count is short", [page(2, ours(1, "success")), page(2)]],
		["a first page with no runs while the count is short", [page(1)]],
	])("%s throws", (_, pages) => {
		expect(() => collect(pages)).toThrow();
	});
});

const script = join(import.meta.dir, "green-run.ts");
const run = (stdin: string) =>
	Bun.spawnSync([process.execPath, script], { stdin: Buffer.from(stdin), stderr: "pipe" }).exitCode;

describe("run as a script", () => {
	// spec: orchestrator/check-runs-on-more-than-one-page
	test.each([
		["green", [page(1, ours(1, "success"))], 0],
		["not green", [page(2, ours(1, "success")), page(2, ours(2, "failure"))], 1],
		["another page wanted", [page(2, ours(1, "success"))], 3],
		["unreadable pages", [page(2, ours(1, "success")), page(2)], 2],
		["no array", page(1, ours(1, "success")), 2],
	])("%s exits as deploy.sh reads it", (_, pages, code) => {
		expect(run(JSON.stringify(pages))).toBe(code);
	});

	test("standard input that is not JSON exits 2", () => {
		expect(run("{")).toBe(2);
	});
});
