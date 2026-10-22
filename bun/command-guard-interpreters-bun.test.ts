import { describe, expect, test } from "bun:test";
import { BUN_SUBCOMMANDS } from "./command-guard-interpreters.ts";

/** The interpreter check's `bun` subcommand constant, pinned to the installed bun. */

describe("the bun subcommands", () => {
	test("the constant matches the installed bun --help in both directions [17]", () => {
		const help = Bun.spawnSync(["bun", "--help"]).stdout.toString();
		const block = help.slice(help.indexOf("Commands:"), help.indexOf("Learn more"));
		const listed = new Set([
			...[...block.matchAll(/^ {2}([a-z]+)\s/gm)].map((m) => m[1]),
			...[...block.matchAll(/\(bun ([a-z]+)\)/g)].map((m) => m[1]),
		]);
		expect([...BUN_SUBCOMMANDS].sort()).toEqual([...listed].sort());
	});
});
