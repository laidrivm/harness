import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, verdict } from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses of a `bunx`, or a `bun x`, that would
 * install what it runs. The calls that keep running and the refusal's reason
 * are `command-guard-exec.test.ts`'s. Every line here is a string the guard
 * reads; none of them is ever run.
 */

afterAll(cleanup);

const installs = (command: string) => {
	const { code, rule } = verdict(command);
	expect({ code, rule }).toEqual({ code: 2, rule: "bunx-install" });
};

describe("a bunx that installs what it runs", () => {
	// spec: agent-permissions/a-package-fetched-to-run
	test("bunx cowsay hi blocks", () => installs("bunx cowsay hi"));

	// spec: agent-permissions/the-subcommand-spelling
	test("bun x cowsay hi blocks", () => installs("bun x cowsay hi"));

	test("the flag before bun's x is not bunx's", () => {
		installs("bun --no-install x cowsay");
	});

	// A word after one of bun's options may be its value, so it is passed over
	// on the way to the `x` — `bun --hot app.ts x` included, a refusal accepted.
	test.each([
		"bun --cwd /tmp x cowsay",
		"bun --cwd=/tmp x cowsay",
		"bun -c cfg x cowsay",
		"bun --hot app.ts x",
	])("%s blocks", (line) => installs(line));

	// The interpreter check refuses an option before bun's subcommand; not this one.
	test.each([
		"bun run --cwd x script",
		"bun --cwd /tmp test x.test.ts",
		"bun --cwd /tmp x --no-install tsc",
	])("%s is not refused as an install", (line) => expect(verdict(line).rule).not.toBe("bunx-install"));

	// spec: agent-permissions/the-flag-after-the-package
	test("the flag after the package blocks", () => {
		installs("bunx cowsay --no-install");
	});

	// spec: agent-permissions/a-package-named-by-p
	test("a package named by -p without the flag blocks", () => {
		installs("bunx -p renovate renovate-config-validator");
	});

	// spec: agent-permissions/a-wrapped-bunx
	test.each([
		"env FOO=1 bunx cowsay",
		"~/.bun/bin/bunx cowsay",
		'bash -c "bunx cowsay"',
	])("%s blocks", (line) => installs(line));
});
