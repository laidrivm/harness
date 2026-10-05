#!/usr/bin/env bun
/**
 * Fails when the number of mutants surviving in `src/model.ts` differs from the
 * floor declared below. Reads Stryker's JSON report; it runs no tool, so a
 * Stryker that crashed is a non-zero exit its own invoker already surfaced, and
 * this check never has to tell that apart from an exceeded floor.
 *
 * The invoker also deletes the previous report before the run — see
 * `.github/workflows/mutation.yml`. A reader cannot tell a stale report from a
 * fresh one; an absent one already fails here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./root.ts";
import { comments } from "./scan.ts";

/** Statuses meaning the tests let the mutant through. */
const SURVIVING = ["Survived", "NoCoverage"];

/**
 * Statuses meaning something other than that. `NoCoverage` sits above rather
 * than here because no test ran against such a mutant at all; it should not
 * arise under the command runner, which performs no coverage analysis, and
 * counting it is what makes its appearance visible instead of silent.
 *
 * The report schema carries an eighth status, `Pending`, which neither list
 * names on purpose: it means the run did not finish, so both counting it and
 * ignoring it would report a number about a run that never happened. Any status
 * this check predates lands the same way — thrown, by name.
 */
const COUNTED_OUT = [
	"Killed",
	"Timeout",
	"Ignored",
	"CompileError",
	"RuntimeError",
];

type Mutant = { status?: unknown };
/**
 * As loose as `JSON.parse` leaves it: every field is optional and an entry may
 * be null, because the only thing checked before the cast is that `files` is an
 * object. Narrowing it here would describe a report nobody verified.
 */
type Report = { files: Record<string, { mutants?: Mutant[] } | null> };

/**
 * Stryker's report at `file`. Throws naming `file` when it is absent, truncated
 * or not a report, so none of the three can read as zero survivors.
 */
export function loadReport(file: string): Report {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch (cause) {
		throw new Error(`no mutation report at ${file}`, { cause });
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (cause) {
		throw new Error(`the mutation report at ${file} is not JSON`, { cause });
	}

	const files = (parsed as Report | null)?.files;
	// Arrays and null are objects too, and either would yield no mutants below
	// and so a count of zero from a file that is not a report.
	if (typeof files !== "object" || files === null || Array.isArray(files))
		throw new Error(`the mutation report at ${file} carries no files`);
	return parsed as Report;
}

/**
 * How many mutants in `report` survived. Throws when the report holds no mutant
 * at all — a mutated file with nothing to mutate means the scope is wrong, and
 * zero survivors is the answer that would hide it.
 */
export function survivors(report: Report): number {
	// `f?.` rather than a per-entry validator: a null entry contributes nothing,
	// and a report made entirely of them reaches the throw below rather than
	// reading as zero survivors.
	const mutants = Object.values(report.files).flatMap((f) => f?.mutants ?? []);
	if (mutants.length === 0)
		throw new Error("the mutation report holds no mutants");

	let count = 0;
	for (const { status } of mutants) {
		// Stringified rather than type-guarded: a mutant carrying no status, or
		// one carrying a number, matches neither list and so throws by name,
		// which is what a guard would have to do anyway.
		const name = String(status);
		if (SURVIVING.includes(name)) count++;
		else if (!COUNTED_OUT.includes(name))
			throw new Error(`unrecognised mutant status: ${name}`);
	}
	return count;
}

export const FLOOR = 66; // was 67: an injectivity case kills the role guard too

/**
 * The `FLOOR` declaration in `source`, or `""` when it holds none — a floor
 * nobody can find states no reason either, and both fail the same way.
 *
 * Anchored to the start of a line, which is why the malformed declarations the
 * tests pass in, all of them indented arguments, are not mistaken for it.
 */
export function floorLine(source: string): string {
	return /^export const FLOOR = \d+;.*$/m.exec(source)?.[0] ?? "";
}

/**
 * What a count owes its floor. Both directions fail: a rise admits a mutant
 * nothing kills, and a floor left above reality stops being a measurement.
 *
 * The reason is demanded on every run rather than only on a rise, because
 * telling a rise from a drop needs the previously committed value, and reading
 * git history to decide whether to ask is more machinery than one comment.
 */
export function gauge(
	count: number,
	floor: number,
	declaration: string,
): string[] {
	const problems: string[] = [];
	// Anchored to the semicolon: a reason is the comment trailing the
	// declaration, never a `//` quoted elsewhere on the line. The gap is spaces
	// and tabs rather than `\s`, which would let a reason on the *next* line
	// satisfy a check whose whole point is that it sits on this one.
	if (!/;[ \t]*\/\/.*\S/.test(declaration))
		problems.push(
			`the floor states no reason: ${declaration.trim()} — write why on that line`,
		);
	if (count !== floor) {
		const gap = `${count} surviving mutants against a floor of ${floor}`;
		problems.push(
			count > floor
				? `${gap} — kill one, or raise the floor with the reason on its line`
				: `${gap} — write ${count} as the floor, so the gain is recorded`,
		);
	}
	return problems;
}

/**
 * A `Stryker disable` directive, matched against a comment's text rather than a
 * line, because Stryker runs its own matcher over every comment Babel hands it
 * — a block-comment directive is one it honours, and one a line-leading scan
 * would never see.
 *
 * Deliberately looser than Stryker's `^\s?Stryker`, which allows a single
 * leading space: a directive written with two is one Stryker ignores in
 * silence, and failing on it is what tells the author so.
 */
// Unanchored at the end, like Stryker's own: a block comment's text runs past
// the directive's line, and `$` would refuse every multi-line one.
const DISABLE = /^\s*Stryker disable\b(.*)/;

/**
 * The one accepted tail: `next-line <Mutator>[,<Mutator>…]: <reason>`. A list
 * is accepted because one line can carry two mutants equivalent for the same
 * reason, and rejecting it would push the author towards `all`.
 */
const ADMITTED = /^\s+next-line\s+([A-Za-z]+(?:\s*,\s*[A-Za-z]+)*)\s*:(.*)$/;

/**
 * Every disable comment in `source` that is not the accepted form. Stryker
 * silently ignores a malformed one, so an author who mistypes it believes a
 * mutant is admitted while it still counts — this is what turns that into a
 * failure.
 *
 * `// Stryker restore` and an ignore-plugin are not checked for: a `restore`
 * with no matching `disable` changes nothing, and a plugin is a new file and a
 * new dependency, both of which a reviewer sees.
 */
export function exemptions(source: string): string[] {
	const lines = source.split("\n");
	const problems: string[] = [];
	for (const { text, line, block } of comments(source, "ts")) {
		const marker = DISABLE.exec(text);
		if (!marker) continue;
		const at = `${MODEL_NAME}:${line}: ${lines[line - 1]?.trim()}`;
		// A directive in a block comment fails however well it is formed:
		// Stryker honours both spellings, and one spelling in the codebase is
		// what keeps a reader from having to know that.
		const tail = block ? null : ADMITTED.exec(marker[1] ?? "");
		if (!tail)
			problems.push(
				`${at} — write \`// Stryker disable next-line <Mutator>: <reason>\``,
			);
		else if (tail[1]?.split(",").some((name) => name.trim() === "all"))
			problems.push(
				`${at} — names \`all\`, which would also silence a mutant added to that line later`,
			);
		else if (!tail[2]?.trim()) problems.push(`${at} — states no reason`);
	}
	return problems;
}

/**
 * Resolved from this file rather than from the working directory, so the check
 * reads the same report and the same model whichever directory it runs from.
 */
export const REPORT = join(root, "reports", "mutation", "mutation.json");

/** The one file Stryker mutates, and so the only one the scan is scoped to. */
const MODEL_NAME = "src/model.ts";
const MODEL = join(root, MODEL_NAME);

if (import.meta.main) {
	const problems = [
		...gauge(
			survivors(loadReport(REPORT)),
			FLOOR,
			floorLine(readFileSync(import.meta.path, "utf8")),
		),
		...exemptions(readFileSync(MODEL, "utf8")),
	];
	for (const problem of problems) console.error(problem);
	if (problems.length) process.exit(1);
}
