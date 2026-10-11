/**
 * The policy half of `sync.ts`: every value `settings.ts` compares exactly,
 * written into the consumer's `.claude/settings.json` and `bunfig.toml`, so a
 * harness change to a hook or a list lands with the pin rather than as a hand
 * edit in each consumer. What the check only refuses — an empty allow list,
 * `disableAllHooks` — stays the consumer's to fix, since no harness change
 * can introduce it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOOKS, MARK } from "./bootstrap.ts";
import { ASK, DENY, EDIT_ASK, EDIT_DENY, INSTALL } from "./settings.ts";

type Group = { matcher?: string; hooks?: { command?: unknown }[] };
type Settings = {
	permissions?: { deny?: string[]; ask?: string[] };
	hooks?: Record<string, Group[]>;
};

/**
 * Whether the harness wrote `command`: it ends with `MARK`, or it is a
 * current hook's text without it, as consumers copied it by hand before the
 * mark existed. A project hook calling a harness script by its path is
 * neither, so it survives.
 */
const ours = (command: unknown) =>
	typeof command === "string" &&
	(command.endsWith(MARK) ||
		HOOKS.some((hook) => hook.command === `${command} ${MARK}`));

const read = (file: string) =>
	existsSync(file) ? readFileSync(file, "utf8") : undefined;

/**
 * `list` with its `Bash(` entries replaced by `bash`, where the first of them
 * stood, and `file` appended when absent. The check compares the `Bash(`
 * subset whole, so the harness owns all of it; every other entry keeps its
 * place.
 */
function policyList(list: string[] = [], bash: string[], file: string) {
	const first = list.findIndex((entry) => entry.startsWith("Bash("));
	const rest = list.filter((entry) => !entry.startsWith("Bash("));
	const at = first === -1 ? rest.length : first;
	const out = [...rest.slice(0, at), ...bash, ...rest.slice(at)];
	return out.includes(file) ? out : [...out, file];
}

/** The settings file's new text: the harness's hooks and lists, the rest kept. */
function settingsText(text: string | undefined): string {
	let config: Settings;
	try {
		config = text === undefined ? {} : JSON.parse(text);
	} catch (error) {
		throw new Error(`.claude/settings.json: ${(error as Error).message}`);
	}
	const hooks = config.hooks ?? {};
	for (const [event, groups] of Object.entries(hooks)) {
		if (!Array.isArray(groups))
			throw new Error(`.claude/settings.json: hooks.${event} is not a list`);
		hooks[event] = groups.flatMap((group) => {
			if (group.hooks === undefined) return [group];
			const kept = group.hooks.filter((hook) => !ours(hook.command));
			return kept.length ? [{ ...group, hooks: kept }] : [];
		});
	}
	for (const { event, matcher, command } of HOOKS)
		(hooks[event] ??= []).push({
			...(matcher === undefined ? {} : { matcher }),
			hooks: [{ type: "command", command } as { command: string }],
		});
	// An event whose only hooks were a previous version's, and which the
	// harness no longer registers, would otherwise be left as an empty list.
	for (const [event, groups] of Object.entries(hooks))
		if (groups.length === 0) delete hooks[event];
	config.hooks = hooks;
	const permissions = config.permissions ?? {};
	permissions.deny = policyList(permissions.deny, DENY, EDIT_DENY);
	permissions.ask = policyList(permissions.ask, ASK, EDIT_ASK);
	config.permissions = permissions;
	const indent = text?.match(/\n([ \t]+)"/)?.[1] ?? "\t";
	return `${JSON.stringify(config, null, indent)}\n`;
}

/** JSON's spelling of a boolean, a number and a string array is TOML's too. */
const SECTION = [
	"[install]",
	...Object.entries(INSTALL).map(([k, v]) => `${k} = ${JSON.stringify(v)}`),
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function toml(text: string): Record<string, unknown> {
	try {
		return Bun.TOML.parse(text) as Record<string, unknown>;
	} catch (error) {
		throw new Error(`bunfig.toml: ${(error as Error).message}`);
	}
}

/**
 * `bunfig.toml`'s new text. An `[install]` that already equals `INSTALL` is
 * left byte for byte, so its comments survive. Otherwise its lines, up to the
 * next header, become the canonical ones. Bun parses TOML but cannot write
 * it, so that is a line scan, and the result is verified by parsing: a layout
 * the scan misreads throws rather than being written.
 */
function bunfigText(text: string | undefined): string {
	if (text === undefined) return `${SECTION.join("\n")}\n`;
	const before = toml(text);
	if (same(before.install, INSTALL)) return text;
	const lines = text.split("\n");
	const start = lines.findIndex((l) => /^\s*\[\s*install\s*\]\s*(#.*)?$/.test(l));
	let out: string[];
	if (start === -1) {
		const body = text.endsWith("\n") ? lines.slice(0, -1) : lines;
		out = [...body, ...(text.trim() ? [""] : []), ...SECTION, ""];
	} else {
		let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
		if (end === -1) end = lines.length;
		while (end > start + 1 && lines[end - 1]?.trim() === "") end--;
		out = [...lines.slice(0, start), ...SECTION, ...lines.slice(end)];
	}
	const result = out.join("\n");
	const after = toml(result);
	const tables = new Set([...Object.keys(before), ...Object.keys(after)]);
	tables.delete("install");
	if (
		!same(after.install, INSTALL) ||
		[...tables].some((table) => !same(before[table], after[table]))
	)
		throw new Error(
			`bunfig.toml: replacing [install] would not leave exactly ${JSON.stringify(INSTALL)} with every other table unchanged — set it by hand`,
		);
	return result;
}

/**
 * Writes the harness's policy into `root`'s two files. Both new texts are
 * computed, and the `bunfig.toml` one verified, before either is written, so
 * a throw leaves both as they were.
 */
export function syncSettings(root: string): void {
	const settingsFile = join(root, ".claude/settings.json");
	const bunfigFile = join(root, "bunfig.toml");
	const settings = read(settingsFile);
	const bunfig = read(bunfigFile);
	const writes = [
		[bunfigFile, bunfig, bunfigText(bunfig)],
		[settingsFile, settings, settingsText(settings)],
	] as const;
	for (const [file, was, now] of writes)
		if (was !== now) {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, now);
		}
}
