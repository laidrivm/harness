/**
 * What `bun/mutation-run.ts`'s plan and stored-file cases build a checkout out of. Its own module because those cases
 * split across two files to stay under the cap, and a copy of the tree each builds would drift from the other.
 */
import type { Tree } from "./mutation-checkout.ts";
import { fingerprint, modules, plan, testsOf } from "./mutation-run.ts";
import { trim } from "./mutation-stored.ts";

export const mutant = (id: string, status: string) => ({
	id,
	mutatorName: "BooleanLiteral",
	location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
	replacement: "false",
	status,
});

export const versions = { "@hughescr/stryker-bun-runner": "1.6.0", "@stryker-mutator/core": "10.0.0" };

/** A checkout whose working tree, index and `HEAD` all hold `files`, every module a test matches on the list. */
export const tree = (files: Record<string, string>): Tree => {
	const paths = Object.keys(files);
	return {
		tracked: paths,
		blobs: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, Bun.hash(text).toString()])),
		text: files,
		stored: {},
		dirty: [],
		listed: modules(paths).filter((m) => testsOf(m, paths).length),
		options: { testRunner: "bun" },
		versions,
	};
};

/** `t` with `path` committed as `text`, or deleted where `text` is undefined; the list stays as it was. */
export function commit(t: Tree, path: string, text?: string): Tree {
	const files = { ...t.text };
	if (text === undefined) delete files[path];
	else files[path] = text;
	return { ...tree(files), stored: t.stored, listed: t.listed, options: t.options, versions: t.versions };
}

/** `t` with every module that has tests measured against it, one survivor each, and its test files' sources. */
export function measured(t: Tree): Tree {
	const stored: Record<string, string> = {};
	for (const module of plan(t, { all: true, force: false }).runs.map((run) => run.module)) {
		const testFiles = Object.fromEntries(
			testsOf(module, t.tracked).map((path) => [path, { source: t.text[path] ?? "", tests: [] }]),
		);
		const report = {
			schemaVersion: "1.0",
			testFiles,
			files: { [module]: { source: t.text[module] ?? "", mutants: [mutant("0", "Survived")] } },
		};
		stored[`mutation/${module.slice(4, -3)}.json`] = JSON.stringify(trim(report, fingerprint(module, t)));
	}
	return { ...t, stored };
}

export const base = tree({
	"bunfig.toml": '[test]\npreload = ["./bun/guard.ts"]\n',
	"bun/guard.ts": "export {};\n",
	"bun/guard.test.ts": "test('a', () => {});\n",
	"bun/pre-pr.ts": "export const a = 1;\n",
	"bun/pre-pr.test.ts": "test('a', () => {});\n",
	"bun/pre-pr-steps.ts": "export const b = 1;\n",
	"bun/pre-pr-steps.test.ts": "test('b', () => {});\n",
	"bun/pre-pr-steps-run.test.ts": "test('b', () => {});\n",
	"bun/command-parse.ts": "export const c = 1;\n",
	"bun/command-parse.test.ts": 'import { run } from "./command-guard.fixture.ts";\n',
	"bun/command-guard.ts": "export const d = 1;\n",
	"bun/command-guard.test.ts": 'import { run } from "./command-guard.fixture.ts";\n',
	"bun/command-guard.fixture.ts": "export const run = 1;\n",
	"bun/board.ts": "export const e = 1;\n",
	"bun/board.test.ts": "test('e', () => {});\n",
	"bun/root.ts": "export const root = '.';\n",
	"bun/diff-budget.sh": "exit 0\n",
});
export const current = () => measured(base);
