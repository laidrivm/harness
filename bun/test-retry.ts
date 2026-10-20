/**
 * The consumer check that refuses a configured test retry (flaky-test-findings
 * D10), the tree-side half of the guard's `bunTestRetry`. A retry turns a
 * flaky test green without naming it, wherever it is configured:
 *
 * - a tracked `bunfig.toml`, at any depth, holding `test.retry`;
 * - a `retry` key on an options object handed straight to `test`, `it`,
 *   `describe` or a hook, through any chain of modifiers, in a source that
 *   imports `bun:test` or that `bun test` discovers by name;
 * - a command the tree holds — a `package.json` script or `simple-git-hooks`
 *   value, a workflow's `run:`, a file under `.githooks/` — that the guard
 *   would refuse.
 *
 * Scoped by what a file holds, never by a list of names (`core/rules.md`).
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { bunTestRetry, shellWords } from "./command-guard-exec.ts";
import { commands } from "./command-parse.ts";
import { invocations, SHELLS } from "./command-words.ts";
import { blank } from "./scan.ts";
import { tracked } from "./tracked.ts";

const SOURCE = /\.[cm]?[jt]sx?$/;
/** The names `bun test` collects as test files. */
const TEST_FILE = /[._](test|spec)\.[cm]?[jt]sx?$/;
/** Where `test`, `describe` and the hooks start a call, as a name not reached through a `.`. */
const CALLER = /(?<![\w$.])(test|it|describe|beforeAll|beforeEach|afterAll|afterEach)\b/g;
const CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/** The offset just past the bracket that closes the one at `open`, or -1. */
function closing(code: string, open: number): number {
	const stack: string[] = [];
	for (let at = open; at < code.length; at++) {
		const char = code[at] ?? "";
		if (char in CLOSE) stack.push(CLOSE[char] ?? "");
		else if (char === ")" || char === "]" || char === "}") {
			if (stack.pop() !== char) return -1;
			if (!stack.length) return at + 1;
		}
	}
	return -1;
}

/** The offsets of the direct entries of the bracketed list opening at `open`. */
function entries(code: string, open: number, end: number): number[] {
	const starts = [open + 1];
	for (let at = open + 1; at < end - 1; at++) {
		const char = code[at] ?? "";
		if (char in CLOSE) at = closing(code, at) - 1;
		else if (char === ",") starts.push(at + 1);
		if (at < 0) break;
	}
	return starts;
}

/** Where an object literal opening at `open` carries a direct `retry` key. */
function retryKey(code: string, open: number): number | undefined {
	const end = closing(code, open);
	for (const start of entries(code, open, end)) {
		const key = /^\s*retry\s*(?=[:,}])/.exec(code.slice(start, end - 1) + "}");
		if (key) return start + key[0].indexOf("retry");
	}
	return undefined;
}

/** Every `retry` key on an options object handed to a test call in `code`. */
function retries(code: string): number[] {
	const found: number[] = [];
	for (const call of code.matchAll(CALLER)) {
		let at = call.index + call[0].length;
		// Any chain of member accesses and calls: `.each(rows)(…)`, `.concurrent.failing(…)`.
		for (;;) {
			const next = /^\s*(\.\s*[\w$]+|\()/.exec(code.slice(at));
			if (!next) break;
			if (next[1]?.startsWith(".")) {
				at += next[0].length;
				continue;
			}
			const open = at + next[0].length - 1;
			const end = closing(code, open);
			if (end < 0) break;
			for (const start of entries(code, open, end)) {
				const brace = /^\s*\{/.exec(code.slice(start));
				const key = brace ? retryKey(code, start + brace[0].length - 1) : undefined;
				if (key !== undefined) found.push(key);
			}
			at = end;
		}
	}
	return found;
}

/** Whether the code of `source`, at a `from` or `import(`, names `bun:test`. */
function importsBunTest(source: string, code: string): boolean {
	// The specifier is a string the scan blanked, so it is read from the source at the offset the scan reached.
	for (const word of code.matchAll(/\b(from|import)\b/g))
		if (/^\s*\(?\s*(["'])bun:test\1/.test(source.slice(word.index + word[0].length))) return true;
	return false;
}

const line = (text: string, offset: number) => text.slice(0, offset).split("\n").length;

/** Each command line of `text` that the guard refuses for a retry. */
function retried(text: string): boolean {
	let parts: string[][];
	try {
		parts = commands(text, () => {
			throw new Error("unparseable");
		});
	} catch {
		// shortcut: a command the guard's parser refuses is not read for a retry; read it if one ever hides one.
		return false;
	}
	// A `sh -c` program and an `eval`'s words are read as the guard reads them.
	return parts.some((part) =>
		invocations(part).some(([name, rest]) => {
			if (bunTestRetry(name, rest)) return true;
			const shell = SHELLS.has(name) ? shellWords(rest) : null;
			if (shell?.command) return rest.slice(shell.start).some(retried);
			return name === "eval" && retried(rest.join(" "));
		}),
	);
}

/** `parse` of a tracked file, its failure naming the file. */
function parsed<T>(path: string, parse: () => T): T {
	try {
		return parse();
	} catch (error) {
		throw new Error(`${path}: ${(error as Error).message}`);
	}
}

type Workflow = { jobs?: Record<string, { steps?: { run?: unknown }[] } | null> };

/** Every configured retry `root`'s tracked tree holds, as `path[:line]: …` lines. */
export function testRetry(root: string): string[] {
	const problems: string[] = [];
	const { files } = tracked(root);
	for (const path of files) {
		const read = () => readFileSync(join(root, path), "utf8");
		const name = basename(path);
		if (name === "bunfig.toml") {
			const config = parsed(path, () => Bun.TOML.parse(read())) as { test?: { retry?: unknown } };
			if (config.test?.retry !== undefined) problems.push(`${path}: [test] retry hides a flaky test`);
		} else if (SOURCE.test(name)) {
			const source = read();
			const code = blank(source, "ts");
			if (!TEST_FILE.test(name) && !importsBunTest(source, code)) continue;
			for (const key of retries(code)) problems.push(`${path}:${line(source, key)}: a test retry hides a flaky test`);
		} else if (name === "package.json") {
			const json = (parsed(path, () => JSON.parse(read())) ?? {}) as Record<string, unknown>;
			for (const field of ["scripts", "simple-git-hooks"])
				for (const [key, value] of Object.entries((json[field] ?? {}) as Record<string, unknown>))
					if (typeof value === "string" && retried(value)) problems.push(`${path}: ${field} ${key} runs bun with --retry`);
		} else if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) {
			const jobs = (parsed(path, () => Bun.YAML.parse(read())) as Workflow | null)?.jobs ?? {};
			for (const [job, body] of Object.entries(jobs))
				for (const step of body?.steps ?? [])
					if (typeof step?.run === "string" && retried(step.run)) problems.push(`${path}: job ${job} runs bun with --retry`);
		} else if (path.startsWith(".githooks/") && retried(read())) {
			problems.push(`${path}: runs bun with --retry`);
		}
	}
	return problems;
}
