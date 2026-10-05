/**
 * The permission policy over a fabricated consumer: one that keeps it passes,
 * and each way of departing from it is named. What a real consumer's settings
 * say is that consumer's check to report.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BOOTSTRAP } from "./bootstrap.ts";
import { settings } from "./settings.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const policy = () => ({
	permissions: {
		deny: [
			"Bash(npx *)",
			"Bash(npm *)",
			"Bash(pnpm *)",
			"Bash(yarn *)",
			"Bash(gh pr comment *)",
			"Bash(gh issue comment *)",
			"Bash(gh pr review *)",
			"Edit(.npmrc)",
		],
		ask: [
			"Bash(bun add *)",
			"Bash(bun a *)",
			"Bash(bun install *)",
			"Bash(bun i *)",
			"Bash(bun remove *)",
			"Bash(bun rm *)",
			"Bash(bun r *)",
			"Bash(bun uninstall *)",
			"Bash(bun update *)",
			"Bash(bun up *)",
			"Bash(bun patch *)",
			"Bash(bun patch-commit *)",
			"Bash(bun pm pkg *)",
			"Bash(bun pm version *)",
			"Bash(bun pm trust *)",
			"Edit(bunfig.toml)",
		],
		allow: ["Bash(bun test *)", "Read(docs/**)"],
	},
	hooks: {
		PreToolUse: [
			{
				matcher: "Bash",
				hooks: [{ type: "command", command: BOOTSTRAP } as object],
			},
		],
	},
});

const BUNFIG =
	"[install]\nexact = true\nminimumReleaseAge = 259200\nminimumReleaseAgeExcludes = []\n";

/** A consumer tracking `config` as its settings, plus `files`. */
function consumer(
	config: ReturnType<typeof policy>,
	files: Record<string, string> = {},
): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-settings-"));
	made.push(dir);
	const all = {
		".claude/settings.json": JSON.stringify(config),
		"bunfig.toml": BUNFIG,
		...files,
	};
	for (const [path, text] of Object.entries(all)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
	return dir;
}

/** The policy with `change` applied to a fresh copy. */
const changed = (change: (config: ReturnType<typeof policy>) => void) => {
	const config = policy();
	change(config);
	return config;
};

describe("a consumer keeping the policy", () => {
	test("reports nothing", () => {
		expect(settings(consumer(policy()))).toEqual([]);
	});
});

describe("the bootstrap hook", () => {
	test("a copy one character off is named", () => {
		const config = changed((c) => {
			const [entry] = c.hooks.PreToolUse;
			if (entry) entry.hooks = [{ type: "command", command: `${BOOTSTRAP} ` }];
		});
		expect(settings(consumer(config)).join("\n")).toContain(
			"not the harness bootstrap",
		);
	});

	test("a hook narrowed by if is named", () => {
		const config = changed((c) => {
			const [entry] = c.hooks.PreToolUse;
			if (entry)
				entry.hooks = [
					{ type: "command", command: BOOTSTRAP, if: "Bash(git *)" },
				];
		});
		expect(settings(consumer(config)).join("\n")).toContain("narrowed by `if`");
	});

	test("a second Bash hook is named", () => {
		const config = changed((c) => {
			const [entry] = c.hooks.PreToolUse;
			entry?.hooks.push({ type: "command", command: "true" });
		});
		expect(settings(consumer(config)).join("\n")).toContain(
			"2 Bash hooks, not one",
		);
	});
});

describe("the permission lists", () => {
	test("a denied manager dropped is named", () => {
		const config = changed((c) => {
			c.permissions.deny = c.permissions.deny.filter(
				(e) => e !== "Bash(npm *)",
			);
		});
		expect(settings(consumer(config)).join("\n")).toContain(
			"the Bash deny list is not",
		);
	});

	test("an ask entry dropped is named", () => {
		const config = changed((c) => {
			c.permissions.ask = c.permissions.ask.filter(
				(e) => e !== "Bash(bun r *)",
			);
		});
		expect(settings(consumer(config)).join("\n")).toContain(
			"the Bash ask list is not",
		);
	});

	test("a gated entry allowed back is named", () => {
		const config = changed((c) => c.permissions.allow.push("Bash(bun add *)"));
		expect(settings(consumer(config)).join("\n")).toContain(
			"Bash(bun add *) is gated and allowed back",
		);
	});

	test("a file rule in the form that never matches is named", () => {
		const config = changed((c) => c.permissions.deny.push("Write(.npmrc)"));
		expect(settings(consumer(config)).join("\n")).toContain(
			"Write(.npmrc) never matches",
		);
	});

	test("an allowed path a clone does not have is named", () => {
		const config = changed((c) =>
			c.permissions.allow.push("Read(//Users/someone/notes/**)"),
		);
		expect(settings(consumer(config)).join("\n")).toContain(
			"carries a path a clone does not have",
		);
	});

	test("an allowed path outside the repository is named", () => {
		const config = changed((c) =>
			c.permissions.allow.push("Edit(../secrets/**)"),
		);
		expect(settings(consumer(config)).join("\n")).toContain(
			"reaches outside the repository",
		);
	});
});

describe("the supply-chain files", () => {
	test("a weakened release-age gate is named", () => {
		const dir = consumer(policy(), {
			"bunfig.toml": BUNFIG.replace("259200", "0"),
		});
		expect(settings(dir).join("\n")).toContain("bunfig.toml: [install]");
	});

	test("an .npmrc tracked below the root is named", () => {
		const dir = consumer(policy(), {
			"pkg/.npmrc": "registry=https://x.test\n",
		});
		expect(settings(dir)).toContain(
			"pkg/.npmrc: tracked, and bun reads it as a registry source",
		);
	});
});
