/**
 * Which acceptance criteria the tests close. A test cites one in a `// spec:`
 * comment directly above it; what a criterion is and where they are read from
 * is `spec-criteria.ts`'s.
 *
 * The check still ships as a test — CI already runs `bun test`, so it is
 * blocking with no workflow edit — and this file is only where it is written:
 * the shape `no-suppressions.ts` and `mutation-floor.ts` already have.
 */

import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { counted, validated } from "./spec-criteria.ts";

/**
 * A citation identifier. Anchored at both ends, so `capability/A Thing` is a
 * malformed citation the check reports rather than one silently matching
 * nothing.
 */
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A `test`, `it` or `describe` call, member forms — `test.each` — included. */
const CALL = /^\s*(?:test|it|describe)(?:\.\w+)*\s*[(`]/;

/**
 * A line-leading `// spec:` comment. Anything with code before it on the line
 * is not one, which is what keeps a single-line string literal out.
 *
 * ponytail: line-based, so a `// spec:` line inside a multi-line template
 * literal reads as a citation. Costs a TypeScript parser to fix, and the
 * failure is loud — a false citation either names a real criterion, wrongly
 * crediting one this file's fixtures never assert, or names none and fails the
 * check. Write fixtures with `\n` rather than as multi-line templates.
 */
const CITATION = /^\s*\/\/\s*spec:(.*)$/;

/** Blank, or any comment line: what may sit between a citation and its call. */
const SEPARATOR = /^\s*(?:\/\/|\/?\*|$)/;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

type Citation = { id: string; path: string; line: number };

/**
 * The citations one test file carries, and every way it got them wrong. A
 * citation is the `// spec:` line plus any comment line under it reading as
 * nothing but identifiers; the first comment line that does not is prose, and
 * prose may sit between the citation and the call it belongs to.
 */
function cite(path: string, text: string) {
	const lines = text.split("\n");
	const found: Citation[] = [];
	const wrong: string[] = [];
	// Whether each line begins inside a `/* … */` block. Without it a `// spec:`
	// line inside a commented-out block reads as a citation, and the `*/` under
	// it reads as a separator, so the block silently credits a criterion.
	//
	// ponytail: superseded, and knowingly left. `CLAUDE.md` replaced the rule
	// this implements — strip literals, then read delimiters per line — with a
	// left-to-right scan carrying string and comment state, after the per-line
	// form produced five holes in `scripts/mutation-floor.ts`. One is live here:
	// an escaped quote ends the literal early, so `"he said \"/*\""` leaves a
	// stray `/*`, `open` sticks true, and every citation below is dropped. The
	// count then rises and the floor fails, naming a breach rather than this.
	// The fix is to lift the scanner out of `mutation-floor.ts` — the rule of
	// two the `scan-lift` card carries — not to patch the expression below.
	let open = false;
	const enclosed = lines.map((line) => {
		const was = open;
		// String literals first: `const opener = "/*"` opens no comment, and
		// treating it as one would silently blind the scanner to every citation
		// below it.
		const bare = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "");
		for (const token of bare.match(/\/\*|\*\//g) ?? []) open = token === "/*";
		return was;
	});

	lines.forEach((line, index) => {
		if (enclosed[index]) return;
		const marker = CITATION.exec(line);
		if (!marker) return;
		const at = `${path}:${index + 1}`;
		const named = words(marker[1] ?? "");
		if (!named.length) wrong.push(`${at}: a spec comment naming no criterion`);
		for (const id of named) {
			if (IDENTIFIER.test(id)) found.push({ id, path, line: index + 1 });
			else wrong.push(`${at}: malformed identifier "${id}"`);
		}

		let next = index + 1;
		for (; next < lines.length; next++) {
			const comment = enclosed[next]
				? null
				: /^\s*\/\/(.*)$/.exec(lines[next] ?? "");
			const more = comment ? words(comment[1] ?? "") : [];
			if (!more.length || !more.every((id) => IDENTIFIER.test(id))) break;
			for (const id of more) found.push({ id, path, line: next + 1 });
		}
		// A line inside a block comment separates whatever its text looks like:
		// only the first line of `/* note` starts with a comment marker.
		while (
			next < lines.length &&
			(enclosed[next] || SEPARATOR.test(lines[next] ?? ""))
		)
			next++;
		if (!CALL.test(lines[next] ?? ""))
			wrong.push(`${at}: not directly above a test, it or describe call`);
	});
	return { found, wrong };
}

/**
 * Every tracked test file, whichever runner owns it. The extension set is
 * Bun's own, measured rather than inferred — twelve plausible spellings under
 * `bun test`, of which it discovers `.ts .tsx .js .jsx .cts .cjs .mts .mjs`
 * and not `.ctsx .cjsx .mtsx .mjsx`. An enumeration is right here for once:
 * the set is the runner's, not this project's, so widening it is a decision
 * about what Bun does. Admitting a spelling Bun never runs is the direction
 * that passes wrongly — a citation there closes a criterion no test executes.
 *
 * Deliberately not narrowed by `bunfig.toml`, whose `pathIgnorePatterns` hands
 * `e2e/**` to Playwright: an end-to-end test closes a criterion exactly as a
 * unit test does, and a scanner honouring that ignore list would make every
 * criterion only e2e can reach permanently uncitable.
 */
const TEST_FILE = /[._](?:test|spec)\.(?:[cm][jt]s|[jt]sx?)$/;

/** Tracked test files, listed at the repository root whatever `cwd` is. */
function tests(root: string): string[] {
	const ls = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
	if (ls.exitCode !== 0) throw new Error(ls.stderr.toString());
	return ls.stdout
		.toString()
		.split("\0")
		.filter(
			(path) =>
				TEST_FILE.test(path) &&
				!`/${path}`.includes("/node_modules/") &&
				// Bun does not discover a test under a dot-directory, so counting a
				// citation from one would mark a criterion closed by a test that
				// never runs — measured: `bun test` reports "0 test files matching"
				// for a suite under `.hidden/`.
				!path.split("/").some((segment) => segment.startsWith(".")),
		);
}

/** Everything the check knows about one repository. */
export function check(cwd?: string) {
	const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd });
	if (top.exitCode !== 0) throw new Error(top.stderr.toString());
	// Only the terminator git adds, not `trim()`: a repository whose path ends
	// in a space is unusual and not this check's to corrupt.
	const root = top.stdout.toString().replace(/\n$/, "");

	const criteria = counted(root);
	// Grouped rather than a set: three headings repeat under different
	// requirements today, and a slug matching two of them is an error only
	// once a test cites it — until then both simply count as uncited.
	const known = Map.groupBy(validated(root), (c) => c.id);
	const files = tests(root);
	const problems: string[] = [];
	const citations: Citation[] = [];
	for (const path of files) {
		const full = join(root, path);
		// The entry may be tracked but deleted from the work tree.
		if (!lstatSync(full, { throwIfNoEntry: false })?.isFile()) continue;
		const { found, wrong } = cite(path, readFileSync(full, "utf8"));
		citations.push(...found);
		problems.push(...wrong);
	}

	for (const { id, path, line } of citations) {
		const matched = known.get(id);
		if (!matched) {
			problems.push(`${path}:${line}: no criterion ${id}`);
			continue;
		}
		// Ambiguity is judged inside one spec file. A `## MODIFIED Requirements`
		// delta repeats the headings it modifies verbatim, so the same criterion
		// legitimately appears twice across the two sets — that is one criterion,
		// not two, and only two requirements in one file are the real clash.
		const clash = [...Map.groupBy(matched, (c) => c.source).values()].find(
			(list) => list.length > 1,
		);
		if (clash)
			problems.push(
				`${path}:${line}: ${id} is ambiguous, carried by ${clash
					.map((c) => `"${c.requirement}"`)
					.join(" and ")} — rename one heading`,
			);
	}

	return {
		criteria,
		files,
		problems,
		cited: new Set(citations.map((c) => c.id)),
	};
}

export const FLOOR = 395; // +2 stryker.config.json criteria whose tests a ponytail-review pass cut, +1 commit-gates/the-list-has-one-home whose THEN is a review verdict, +1 mutation-floor/the-gate-is-not-picked-up-by-the-suite, confirmed by probe because a test would restate which file the gate lives in, +2 agent-rulebook scenarios on where a prohibition's prose may stand, which nothing in the suite can cite because nothing parses prose, +1 change-slicing/the-second-pull-request-s-base, which no test can close: the second pull request carries the same diff whichever branch it opened from, so nothing distinguishes the criterion met from the criterion broken; 386 since proposal-slicing synced, and 385 since e2e/static-build.spec.ts closed app-shell/build-output-is-self-contained, which had waited for a deployment to serve dist from; 386 while draft-board/hero-missing-from-the-snapshot stood uncited, and 385 again once e2e/board.spec.ts closed it — the requirement had let such a tile be neither named nor hidden, so there was no one state to assert until that was corrected; 402 since notion-task-board synced: the two capabilities bring 33 counted criteria and 16 are cited, the other 17 being about a board this repository cannot read — a card's status and pointer, which board a card sits on, what a saved view shows, whether a stage moved its card — and the derivation those tests do cover reports nothing for any of them by design, so nothing in the tree can assert them without the connector the change's non-goals refuse to put in the suite; two that the tree can see were cited into tests that already closed them, task-board/the-directory-s-row-in-the-ownership-map onto repo-layout's documented-directory block and task-board/the-brief-still-open onto checks/workflow-boards.test.ts; 406 since board-lifecycle synced, which brings four more of that same kind — what a card reads after the option list is replaced, what a card short of done carries in its title, summary and links, the order a drag sets in a column, and what reaching done moves between the two saved views — each verified by a view read in the step that closed it, the drag by the user performing it, because the connector stays out of the suite for the reason above; 407 since retire-plan-md step 2 deleted PLAN.md and with it the one case citing context-budget/a-source-that-is-itself-a-task, a requirement that change removes — and 397 once its archive synced: context-budget went from 16 criteria, none cited, to 8 with two cited, the removed requirements taking ten uncited with them; of the six left, three are fence scenarios that were uncited before and three are verdicts on where a fact is written, which nothing in the suite parses; 395 once extract-harness step 3 cited repo-onboarding/a-fresh-clone and repo-onboarding/the-skills-repository-is-referenced from checks/readme-map.test.ts

/**
 * This file's own `FLOOR` line — the reason lives on it, so the check reads it
 * back. Anchored to the start of a line, `export` included, which is why the
 * malformed declarations the tests pass in, all of them indented arguments, are
 * not mistaken for it.
 */
export const DECLARATION =
	/^export const FLOOR = \d+;.*$/m.exec(
		readFileSync(import.meta.path, "utf8"),
	)?.[0] ?? "";

/**
 * How many criteria in `openspec/specs/` no test cites. Counted per criterion
 * rather than per identifier: two criteria sharing a slug are two uncited
 * criteria, which is what makes an ambiguous pair nobody cites cost two.
 */
export function uncited(cwd?: string): number {
	const { criteria, cited } = check(cwd);
	return criteria.filter((c) => !cited.has(c.id)).length;
}

/**
 * What a count owes its floor. Both directions fail: a rise admits a criterion
 * nothing asserts, and a floor left above reality stops being a measurement.
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
	// declaration, never a `//` quoted elsewhere on the line. Position is what
	// pins it — stripping string literals as well was measurably a no-op here,
	// because nothing may sit between the semicolon and the marker.
	//
	// The reason must carry a character that is neither a slash nor whitespace,
	// so `///` does not read as one; a reason may still begin with a slash.
	if (!/;\s*\/\/.*[^/\s]/.test(declaration))
		problems.push(
			`the floor states no reason: ${declaration.trim()} — write why on that line`,
		);
	if (count !== floor) {
		const gap = `${count} uncited criteria against a floor of ${floor}`;
		problems.push(
			count > floor
				? `${gap} — cite one, or raise the floor with the reason on its line`
				: `${gap} — write ${count} as the floor, so the gain is recorded`,
		);
	}
	return problems;
}
