/**
 * The agent permission policy, read from the consumer's tracked
 * `.claude/settings.json` and `bunfig.toml`: what is refused, what prompts,
 * what is pre-approved, the hook that catches what a permission pattern
 * cannot express, and the turn gate's two registrations. The same for every consumer — strictness is not a value a
 * project chooses.
 *
 * The deny and ask lists are compared whole. An exact list pins every word
 * boundary and rules out an entry that captures a command writing nothing, so
 * neither needs a check of its own.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BOOTSTRAP, TURN_MARK, TURN_STOP } from "./bootstrap.ts";

/** Every package manager a consumer does not use. */
const MANAGERS = ["npx", "npm", "pnpm", "yarn"];

/** The `gh` commands that publish text on the user's behalf. */
const GH_WRITES = ["gh pr comment", "gh issue comment", "gh pr review"];

/** Every form of bun that writes `package.json` or the lockfile. */
const MANIFEST_WRITES = [
	"bun add",
	"bun a",
	"bun install",
	"bun i",
	"bun remove",
	"bun rm",
	"bun r",
	"bun uninstall",
	"bun update",
	"bun up",
	"bun patch",
	"bun patch-commit",
	"bun pm pkg",
	"bun pm version",
	"bun pm trust",
];

/** The `[install]` section the release-age and exact-version gates rest on. */
const INSTALL = {
	exact: true,
	minimumReleaseAge: 259200,
	minimumReleaseAgeExcludes: [],
};

type Hook = {
	type?: string;
	if?: string;
	command?: string;
	args?: unknown;
	async?: unknown;
	asyncRewake?: unknown;
};

/**
 * Whether a hook runs its command in the foreground through a shell, the one
 * form whose exit code can refuse: `async` and `asyncRewake` run it in the
 * background, and `args` spawns `command` as an executable with no shell.
 */
const blocking = (hook: Hook) =>
	hook.args === undefined && !hook.async && !hook.asyncRewake;
type Settings = {
	permissions?: { deny?: string[]; ask?: string[]; allow?: string[] };
	hooks?: {
		PreToolUse?: { matcher?: string; hooks?: Hook[] }[];
		UserPromptSubmit?: { hooks?: Hook[] }[];
		Stop?: { hooks?: Hook[] }[];
	};
	disableAllHooks?: unknown;
};

// Built from a char code rather than written into a regex literal, where the
// escape is a literal control character — which Biome forbids.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** `bun <command> --help`, both streams, uncoloured. */
function help(command: string): string {
	const run = Bun.spawnSync(["bun", command, "--help"]);
	return (run.stdout.toString() + run.stderr.toString()).replace(ANSI, "");
}

/**
 * What the installed bun says about the gated forms: the alias it documents for
 * each must be gated too, and every top-level form must still be a manifest
 * write. Read from the binary, so an upgrade that renames one fails here.
 */
function bunForms(ask: string[]): string[] {
	const problems: string[] = [];
	const commands = new Set(
		ask
			.map((entry) => /^Bash\(bun (\S+)/.exec(entry)?.[1])
			.filter((command) => command !== undefined),
	);
	let aliases = 0;
	for (const command of commands) {
		const text = help(command);
		const alias = text.match(/^Alias: bun (\S+)$/m)?.[1];
		if (alias !== undefined) {
			aliases++;
			if (!ask.includes(`Bash(bun ${alias} *)`))
				problems.push(
					`bun ${alias}, the alias of bun ${command}, is not asked`,
				);
		}
		if (
			!/^Usage: bun (add|install|remove|update|patch|patch-commit|pm) /m.test(
				text,
			)
		)
			problems.push(`bun ${command} no longer resolves to a manifest write`);
	}
	// A bun that stopped printing aliases would pass every check above.
	if (aliases === 0) problems.push("bun --help documents no alias to check");
	return problems;
}

/**
 * Whitespace-separated tokens of a rule's argument that begin a path at the
 * filesystem root or at home, after a quote, `=` or a redirection.
 */
function absoluteTokens(entry: string): string[] {
	const open = entry.indexOf("(");
	return (open === -1 ? "" : entry.slice(open + 1, -1))
		.split(/\s+/)
		.filter((token) => /(?:^|[=<>])["']?(\/|~\/)/.test(token));
}

/** Every way `root`'s settings depart from the policy. */
export function settings(root: string): string[] {
	const file = ".claude/settings.json";
	const parsed = JSON.parse(readFileSync(join(root, file), "utf8")) as Settings;
	const deny = parsed.permissions?.deny ?? [];
	const ask = parsed.permissions?.ask ?? [];
	const allow = parsed.permissions?.allow ?? [];
	const problems: string[] = [];
	const say = (problem: string) => problems.push(`${file}: ${problem}`);

	const bash = (list: string[]) => list.filter((e) => e.startsWith("Bash("));
	const expectDeny = [...MANAGERS, ...GH_WRITES].map((c) => `Bash(${c} *)`);
	const expectAsk = MANIFEST_WRITES.map((c) => `Bash(${c} *)`);
	if (JSON.stringify(bash(deny)) !== JSON.stringify(expectDeny))
		say(`the Bash deny list is not ${expectDeny.join(", ")}`);
	if (JSON.stringify(bash(ask)) !== JSON.stringify(expectAsk))
		say(`the Bash ask list is not ${expectAsk.join(", ")}`);
	problems.push(...bunForms(bash(ask)));

	const hooks = (parsed.hooks?.PreToolUse ?? [])
		.filter((entry) => entry.matcher === "Bash")
		.flatMap((entry) => entry.hooks ?? []);
	if (parsed.disableAllHooks)
		say(
			"disableAllHooks turns every hook off, the guard and turn gate included",
		);
	if (hooks.length !== 1) say(`${hooks.length} Bash hooks, not one`);
	for (const hook of hooks) {
		if (hook.type !== "command") say("the Bash hook is not a command");
		// A permission pattern matches the command word literally, so
		// `command gh` would walk around a hook narrowed by one.
		if (hook.if !== undefined) say("the Bash hook is narrowed by `if`");
		if (!blocking(hook)) say("the Bash hook cannot block: `async` or `args`");
		if (hook.command !== BOOTSTRAP)
			say(
				"the Bash hook is not the harness bootstrap — copy it from bootstrap.ts",
			);
	}

	// Presence, not sole occupancy: a second prompt or stop hook cannot undo
	// this one, since any `Stop` hook exiting 2 refuses. A match under another
	// type, behind `if`, or in a form that cannot block does not count.
	for (const [event, text] of [
		["UserPromptSubmit", TURN_MARK],
		["Stop", TURN_STOP],
	] as const) {
		const runs = (parsed.hooks?.[event] ?? [])
			.flatMap((entry) => entry.hooks ?? [])
			.some(
				(h) =>
					h.type === "command" &&
					h.if === undefined &&
					blocking(h) &&
					h.command === text,
			);
		if (!runs)
			say(
				`the ${event} hook is not the harness turn gate — copy it from bootstrap.ts`,
			);
	}

	if (!deny.includes("Edit(.npmrc)")) say("Edit(.npmrc) is not denied");
	if (!ask.includes("Edit(bunfig.toml)")) say("Edit(bunfig.toml) is not asked");
	if (deny.includes("Edit(bunfig.toml)"))
		say("Edit(bunfig.toml) is denied, so its ask entry is unreachable");
	for (const entry of [...deny, ...ask, ...allow])
		if (/^(Write|NotebookEdit|Glob)\(/.test(entry))
			say(`${entry} never matches — a file rule is written Edit(...)`);
	for (const entry of [...deny, ...ask])
		if (allow.includes(entry)) say(`${entry} is gated and allowed back`);

	if (allow.length === 0) say("the allow list is empty");
	for (const entry of allow) {
		if (absoluteTokens(entry).length)
			say(`${entry} carries a path a clone does not have`);
		const path = entry.match(/^(?:Read|Edit)\((.+)\)$/)?.[1];
		const base = resolve(root); // a trailing `/` on root would double the prefix's
		if (path !== undefined && !resolve(base, path).startsWith(`${base}/`))
			say(`${entry} reaches outside the repository`);
	}

	const bunfig = Bun.TOML.parse(
		readFileSync(join(root, "bunfig.toml"), "utf8"),
	) as { install?: unknown };
	if (JSON.stringify(bunfig.install) !== JSON.stringify(INSTALL))
		problems.push(
			`bunfig.toml: [install] is not exactly ${JSON.stringify(INSTALL)}`,
		);

	// Both pathspecs: `**/.npmrc` matches at depth and not at the root.
	const npmrc = Bun.spawnSync(
		["git", "ls-files", "--", "**/.npmrc", ".npmrc"],
		{
			cwd: root,
		},
	);
	if (npmrc.exitCode !== 0) throw new Error(npmrc.stderr.toString());
	for (const path of npmrc.stdout.toString().split("\n").filter(Boolean))
		problems.push(`${path}: tracked, and bun reads it as a registry source`);

	return problems;
}
