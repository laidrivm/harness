/**
 * What `sync.ts` writes into a consumer's `bunfig.toml`, and that running the
 * script from a consumer's root writes the policy at all. The settings file's
 * cases are in `sync-settings.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { INSTALL } from "./settings.ts";
import { syncSettings } from "./sync-settings.ts";
import {
	CANONICAL,
	cleanup,
	consumer,
	parsed,
	read,
	SETTINGS,
	STALE_BUNFIG,
	stale,
} from "./sync-settings.fixture.ts";

afterAll(cleanup);

describe("bunfig.toml", () => {
	const sync = (bunfig: string) => {
		const dir = consumer({ [SETTINGS]: "{}", "bunfig.toml": bunfig });
		syncSettings(dir);
		return read(dir, "bunfig.toml");
	};

	test("an [install] already equal to the harness's keeps every byte, comments included", () => {
		const commented =
			"[install]\n# why exact\nexact = true\n\nminimumReleaseAge = 259200 # 3 days\nminimumReleaseAgeExcludes = []\n\n[test]\nroot = \"src\"\n";
		expect(sync(commented)).toBe(commented);
	});

	// spec: harness-updates/the-project-s-own-settings-survive-a-sync
	test("a differing [install] is replaced up to the next table, which keeps its text", () => {
		const rest = '[serve.static]\nenv = "BUN_PUBLIC_*"\n\n';
		const tail = '\n[test]\n# kept\npathIgnorePatterns = ["e2e/**"]\n';
		const out = sync(`${rest}${STALE_BUNFIG}${tail}`);
		expect(out).toBe(`${rest}${CANONICAL}${tail}`);
		expect(Bun.TOML.parse(out)).toMatchObject({ install: INSTALL });
	});

	test("a header spaced inside its brackets is the section replaced", () => {
		expect(sync(STALE_BUNFIG.replace("[install]", "[ install ]"))).toBe(
			CANONICAL,
		);
	});

	test("a file that is not TOML fails naming bunfig.toml", () => {
		const dir = consumer({ [SETTINGS]: "{}", "bunfig.toml": "[install\n" });
		expect(() => syncSettings(dir)).toThrow("bunfig.toml");
	});

	test("a missing [install] is appended", () => {
		expect(sync('[test]\nroot = "src"\n')).toBe(
			`[test]\nroot = "src"\n\n${CANONICAL}`,
		);
	});

	test("a missing bunfig.toml is written with [install] alone", () => {
		const dir = consumer({ [SETTINGS]: "{}" });
		syncSettings(dir);
		expect(read(dir, "bunfig.toml")).toBe(CANONICAL);
	});

	// spec: harness-updates/an-install-section-the-rewrite-would-damage-is-left-untouched
	test.each([
		[
			"a subtable that would stay under [install]",
			`${STALE_BUNFIG}\n[install.scopes]\nx = "y"\n`,
		],
		[
			"an array line that reads as a header",
			"[install]\nexact = false\nminimumReleaseAgeExcludes = [\n[\"x\"],\n]\n",
		],
	])("%s fails naming bunfig.toml and writes neither file", (_, bunfig) => {
		const json = JSON.stringify(stale());
		const dir = consumer({ [SETTINGS]: json, "bunfig.toml": bunfig });
		expect(() => syncSettings(dir)).toThrow("bunfig.toml");
		expect(read(dir, "bunfig.toml")).toBe(bunfig);
		expect(read(dir, SETTINGS)).toBe(json);
	});
});

describe("sync.ts run from a consumer's root", () => {
	test("writes the rules copy and the policy", () => {
		const dir = consumer({ [SETTINGS]: JSON.stringify(stale()) });
		const script = join(import.meta.dir, "sync.ts");
		const run = Bun.spawnSync(["bun", script], { cwd: dir, timeout: 20_000 });
		expect(run.exitCode).toBe(0);
		expect(existsSync(join(dir, "harness/rules.md"))).toBe(true);
		expect(parsed(dir).permissions.deny).toContain("Bash(gh pr review *)");
	}, 30_000);
});
