/**
 * The permission policy over a fabricated consumer: one that keeps it passes,
 * and each way of departing from it is named. What a real consumer's settings
 * say is that consumer's check to report.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BOOTSTRAP, TURN_MARK, TURN_STOP } from "./bootstrap.ts";
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
		UserPromptSubmit: [
			{ hooks: [{ type: "command", command: TURN_MARK } as Hook] },
		] as { hooks: Hook[] }[] | undefined,
		Stop: [{ hooks: [{ type: "command", command: TURN_STOP } as Hook] }] as
			| { hooks: Hook[] }[]
			| undefined,
	},
});

type Hook = { type: string; command: string; if?: string };

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

	test("settings that turn every hook off are named", () => {
		const config = { ...policy(), disableAllHooks: true };
		expect(settings(consumer(config)).join("\n")).toContain("disableAllHooks");
	});

	test("a hook run in the background is named", () => {
		const config = changed((c) => {
			const [entry] = c.hooks.PreToolUse;
			if (entry) entry.hooks = [{ command: BOOTSTRAP, async: true }];
		});
		expect(settings(consumer(config)).join("\n")).toContain("cannot block");
	});
});

describe("the turn gate's registrations", () => {
	const report = (change: (c: ReturnType<typeof policy>) => void) =>
		settings(consumer(changed(change))).join("\n");
	const stop = (hook: Hook) => (c: ReturnType<typeof policy>) => {
		c.hooks.Stop = [{ hooks: [hook] }];
	};

	// spec: commit-gates/a-consumer-without-the-registrations
	test("no Stop registration is named [6]", () => {
		expect(report((c) => delete c.hooks.Stop)).toContain("the Stop hook");
	});

	test("no UserPromptSubmit registration is named [7]", () => {
		expect(report((c) => delete c.hooks.UserPromptSubmit)).toContain(
			"the UserPromptSubmit hook",
		);
	});

	test("a consumer's own prompt hook beside the harness's reports nothing [8]", () => {
		const extra = { type: "command", command: "echo hi" };
		expect(
			report((c) => c.hooks.UserPromptSubmit?.push({ hooks: [extra] })),
		).toBe("");
	});

	test("a Stop command one character off is named [9]", () => {
		const off = { type: "command", command: `${TURN_STOP} ` };
		expect(report(stop(off))).toContain("the Stop hook");
	});

	test("the two texts on each other's events are both named [10]", () => {
		const text = report((c) => {
			c.hooks.Stop = [{ hooks: [{ type: "command", command: TURN_MARK }] }];
			c.hooks.UserPromptSubmit = [
				{ hooks: [{ type: "command", command: TURN_STOP }] },
			];
		});
		expect(text).toContain("the Stop hook");
		expect(text).toContain("the UserPromptSubmit hook");
	});

	test.each([
		["under another hook type", { type: "prompt" }],
		["narrowed by if", { if: "Bash(x)" }],
		["run in the background", { async: true }],
		["run in the background, waking on exit", { asyncRewake: true }],
		["spawned without a shell", { args: [] }],
	])("a matching Stop command %s is named", (_, departure) => {
		const hook = { type: "command", command: TURN_STOP, ...departure };
		expect(report(stop(hook as Hook))).toContain("the Stop hook");
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

	test("a root passed with a trailing slash keeps its own paths inside", () => {
		const config = changed((c) => c.permissions.allow.push("Edit(src/**)"));
		expect(settings(`${consumer(config)}/`).join("\n")).not.toContain(
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
