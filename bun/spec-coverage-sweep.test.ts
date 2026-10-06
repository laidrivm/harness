/**
 * What the sweep counts: which criteria are in scope and which are only
 * validated, what an identifier collision costs, and the tree the check has to
 * read without tripping over a directory it cannot open. How a citation is
 * read in the first place is in `spec-coverage.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	cited,
	cleanup,
	emptyDir,
	fabricate,
	ids,
	problems,
	spec,
	world,
} from "./spec-coverage.fixture.ts";
import { check, uncited } from "./spec-coverage.ts";
import { counted } from "./spec-criteria.ts";

afterAll(cleanup);

// spec: spec-test-traceability/a-criterion-renamed-under-its-test
describe("a criterion renamed under its test", () => {
	test("a citation matching no criterion names citation, file and line", () => {
		const dir = world(
			'const a = 1;\n// spec: capability/the-old-wording\ntest("acts", () => {});\n',
			"The new wording",
		);
		expect(problems(dir).join("\n")).toContain(
			"src/thing.test.ts:2: no criterion capability/the-old-wording",
		);
	});
});

// spec: spec-test-traceability/a-criterion-still-in-flight
describe("a criterion still in flight", () => {
	test("a citation to an active change's delta spec is valid", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md": spec("A settled thing"),
			"openspec/changes/in-flight/specs/capability/spec.md":
				spec("A proposed thing"),
			"src/thing.test.ts":
				'// spec: capability/a-proposed-thing\ntest("acts", () => {});\n',
		});
		expect(problems(dir)).toEqual([]);
		expect(ids(check(dir).criteria)).toEqual(["capability/a-settled-thing"]);
	});

	test("an archived change's delta spec is not in the validation set", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md": spec("A settled thing"),
			"openspec/changes/archive/2026-01-01-done/specs/capability/spec.md":
				spec("An archived thing"),
			"src/thing.test.ts":
				'// spec: capability/an-archived-thing\ntest("acts", () => {});\n',
		});
		expect(problems(dir).join("\n")).toContain("capability/an-archived-thing");
	});

	test("an empty changes directory leaves the two sets equal", () => {
		const dir = world(
			'// spec: capability/a-settled-thing\ntest("acts", () => {});\n',
			"A settled thing",
		);
		// git tracks no empty directory, so this one exists only on disk —
		// which is exactly the state a freshly archived change leaves behind.
		mkdirSync(join(dir, "openspec/changes"), { recursive: true });
		expect(problems(dir)).toEqual([]);
		expect(cited(dir)).toEqual(["capability/a-settled-thing"]);
	});

	test("an absent changes directory leaves the two sets equal", () => {
		const dir = world(
			'// spec: capability/a-settled-thing\ntest("acts", () => {});\n',
			"A settled thing",
		);
		expect(problems(dir)).toEqual([]);
		expect(cited(dir)).toEqual(["capability/a-settled-thing"]);
	});
});

/** Two requirements in one capability, each carrying the same heading. */
const twice = (heading: string) =>
	`# capability\n\n### Requirement: The first rule\n\n#### Scenario: ${heading}\n\n- **WHEN** a\n- **THEN** b\n\n### Requirement: The second rule\n\n#### Scenario: ${heading}\n\n- **WHEN** c\n- **THEN** d\n`;

// spec: spec-test-traceability/an-ambiguous-identifier-is-cited
describe("an ambiguous identifier is cited", () => {
	test("a cited slug matching two criteria names both requirements", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md": twice("A skipped minor"),
			"src/thing.test.ts":
				'// spec: capability/a-skipped-minor\ntest("acts", () => {});\n',
		});
		const said = problems(dir).join("\n");
		expect(said).toContain("The first rule");
		expect(said).toContain("The second rule");
	});
});

// spec: spec-test-traceability/an-ambiguous-identifier-nobody-cites
describe("an ambiguous identifier nobody cites", () => {
	test("a delta restating a criterion it modifies is not ambiguity", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md": spec("A modified thing"),
			"openspec/changes/in-flight/specs/capability/spec.md":
				spec("A modified thing"),
			"src/thing.test.ts":
				'// spec: capability/a-modified-thing\ntest("acts", () => {});\n',
		});
		expect(problems(dir)).toEqual([]);
		expect(cited(dir)).toEqual(["capability/a-modified-thing"]);
	});

	test("the same slug uncited passes", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md": twice("A skipped minor"),
			"src/thing.test.ts": 'test("acts", () => {});\n',
		});
		expect(problems(dir)).toEqual([]);
	});

	test("one heading in two capabilities is two identifiers, not ambiguity", () => {
		const dir = fabricate({
			"openspec/specs/one/spec.md": spec("A shared heading"),
			"openspec/specs/two/spec.md": spec("A shared heading"),
			"src/thing.test.ts":
				'// spec: one/a-shared-heading two/a-shared-heading\ntest("acts", () => {});\n',
		});
		expect(problems(dir)).toEqual([]);
		expect(cited(dir)).toEqual([
			"one/a-shared-heading",
			"two/a-shared-heading",
		]);
	});
});

describe("a tree the check cannot read straight through", () => {
	test("run from a subdirectory it still reads the whole repository", () => {
		const dir = world(
			'// spec: capability/a-settled-thing\ntest("acts", () => {});\n',
			"A settled thing",
		);
		const seen = check(join(dir, "src"));
		expect([...seen.cited]).toEqual(["capability/a-settled-thing"]);
		expect(seen.files).toEqual(["src/thing.test.ts"]);
	});

	test("outside a repository it throws rather than passing", () => {
		// The message matters, not merely that something threw: a typo in the
		// check would also throw and would pass a bare `toThrow()`. Rests on
		// `tmpdir()` sitting outside any work tree, which is what makes git
		// fail here rather than resolve upward to some enclosing repository.
		const dir = emptyDir("spec-coverage-bare-");
		expect(() => check(dir)).toThrow(/not a git repository/i);
	});

	test("a tracked test file deleted from the work tree is skipped", () => {
		const dir = world(
			'// spec: capability/a-settled-thing\ntest("acts", () => {});\n',
			"A settled thing",
		);
		rmSync(join(dir, "src/thing.test.ts"));
		expect(problems(dir)).toEqual([]);
		expect(cited(dir)).toEqual([]);
	});
});

describe("what the sweep reads", () => {
	test.each(["ts", "tsx", "js", "jsx", "cts", "cjs", "mts", "mjs"])(
		"a citation in a .%s test is read",
		(ext) => {
			const dir = fabricate({
				"openspec/specs/capability/spec.md": spec("A settled thing"),
				[`src/thing.test.${ext}`]:
					'// spec: capability/a-settled-thing\ntest("acts", () => {});\n',
			});
			expect(cited(dir)).toEqual(["capability/a-settled-thing"]);
		},
	);

	test.each(["ctsx", "cjsx", "mtsx", "mjsx"])(
		"a citation in a .%s test is not, because Bun does not run one",
		(ext) => {
			const dir = fabricate({
				"openspec/specs/capability/spec.md": spec("A settled thing"),
				[`src/thing.test.${ext}`]:
					'// spec: capability/a-settled-thing\ntest("acts", () => {});\n',
			});
			expect(cited(dir)).toEqual([]);
		},
	);

	test("a test file under a dot-directory is not read", () => {
		// Bun does not run it, so a citation there would close a criterion no
		// test ever executes.
		const dir = fabricate({
			"openspec/specs/capability/spec.md": spec("A settled thing"),
			".vendor/thing.test.ts":
				'// spec: capability/a-settled-thing\ntest("acts", () => {});\n',
		});
		expect(cited(dir)).toEqual([]);
	});

	test("a scenario before any requirement heading keeps an empty requirement", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md":
				"# capability\n\n#### Scenario: An orphan\n\n- **WHEN** a\n- **THEN** b\n",
		});
		expect(counted(dir)).toMatchObject([
			{ id: "capability/an-orphan", requirement: "" },
		]);
	});

	test("every test file is scanned, whichever runner owns it", () => {
		const dir = fabricate({
			// Playwright owns `e2e/**` here, so bun test never runs it — and its
			// citations count all the same.
			"bunfig.toml": '[test]\npathIgnorePatterns = ["e2e/**"]\n',
			"openspec/specs/capability/spec.md": spec(
				"A first thing",
				"A second thing",
				"A third thing",
				"A fourth thing",
			),
			"src/thing.test.ts":
				'// spec: capability/a-first-thing\ntest("acts", () => {});\n',
			"e2e/thing.spec.ts":
				'// spec: capability/a-second-thing\ntest("acts", () => {});\n',
			"src/thing_test.ts":
				'// spec: capability/a-third-thing\ntest("acts", () => {});\n',
			"src/thing_spec.tsx":
				'// spec: capability/a-fourth-thing\ntest("acts", () => {});\n',
		});
		expect(cited(dir)).toEqual([
			"capability/a-first-thing",
			"capability/a-fourth-thing",
			"capability/a-second-thing",
			"capability/a-third-thing",
		]);
	});

	test("a tracked file under node_modules is not scanned", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md": spec("A first thing"),
			"node_modules/pkg/thing.test.ts": "// spec: capability/the-old-wording\n",
		});
		// Tracked is the premise: a global `core.excludesFile` ignoring
		// `node_modules` would leave it out of `git ls-files`, and both
		// assertions below would then pass without the scanner filtering
		// anything.
		expect(
			Bun.spawnSync(["git", "ls-files", "node_modules"], { cwd: dir })
				.stdout.toString()
				.trim(),
		).toBe("node_modules/pkg/thing.test.ts");
		expect(check(dir).files).toEqual([]);
		expect(problems(dir)).toEqual([]);
	});

	test("a tree with no citations counts every criterion as uncited", () => {
		const dir = world(
			'test("acts", () => {});\n',
			"A first thing",
			"A second thing",
		);
		expect(uncited(dir)).toBe(2);
	});

	test("a citation indented inside a describe block counts", () => {
		const dir = world(
			'describe("outer", () => {\n\t// spec: capability/a-first-thing\n\ttest("acts", () => {});\n});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual(["capability/a-first-thing"]);
		expect(problems(dir)).toEqual([]);
	});
});
