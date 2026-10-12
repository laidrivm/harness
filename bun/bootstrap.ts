/**
 * The shell comment every command in `HOOKS` ends with: how `sync.ts` tells a
 * hook it wrote from a project's own, which may call the harness's scripts
 * through the same `node_modules/harness/` path.
 */
export const MARK = "# harness-managed";

/**
 * The Bash `PreToolUse` hook command every consumer's `.claude/settings.json`
 * carries, character for character, as `sync.ts` writes it there. The
 * consumer holds it as text because it has to run before the harness is
 * installed: `settings.ts` asserts it exactly, so a copy that drifts fails the
 * consumer's check instead of booting differently.
 *
 * With the package installed it hands every command to the guard. Without it,
 * only `bun install` or `bun i` runs, bare or with `--frozen-lockfile` — the
 * install a clone needs first — and everything else is blocked with that hint,
 * rather than every command failing alike on a guard that is not there.
 *
 * `|| exit 2` on both branches: a guard that cannot launch exits 1, which
 * Claude Code treats as non-blocking and runs the command anyway. Exit 2 is
 * the one code that blocks.
 */
export const BOOTSTRAP = [
	'g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/command-guard.ts";',
	'if [ -f "$g" ]; then bun "$g" || exit 2; exit 0; fi;',
	'bun -e \'const c = JSON.parse(await Bun.stdin.text()).tool_input?.command ?? "";',
	"if (/^bun (install|i)( --frozen-lockfile)?$/.test(c.trim())) process.exit(0);",
	'console.error("The harness is not installed: run bun install first.");',
	"process.exit(2)' || exit 2",
	MARK,
].join(" ");

/**
 * The turn gate's `UserPromptSubmit` and `Stop` registrations, held as text
 * for the same reason: `settings.ts` asserts each exactly.
 *
 * Without the package the `if` exits 0, which lets the prompt through and the
 * turn end. With it, the gate's own exit code is the hook's. No `|| exit 2`,
 * unlike the bootstrap: a gate that cannot launch must end the turn rather
 * than hold it, as the gate's own fail-open header says.
 */
const turnGate = (half: "mark" | "stop") =>
	`g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/turn-gate.ts"; if [ -f "$g" ]; then bun "$g" ${half}; fi ${MARK}`;
export const TURN_MARK = turnGate("mark");
export const TURN_STOP = turnGate("stop");

/**
 * The Notion update guard's `PreToolUse` registration. The matcher is a
 * regular expression, as Claude Code reads a hook's, so it reaches the tool
 * under any server name and no longer tool. Before the install every call goes
 * through; after it, the guard's exit code is the hook's. No `|| exit 2`, like
 * the turn gate: the guard is fail-open, as its header says.
 */
export const NOTION_MATCHER = "^mcp__.+__notion-update-page$";
export const NOTION_GUARD = `g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/notion-guard.ts"; if [ -f "$g" ]; then bun "$g"; fi ${MARK}`;

/**
 * The `SessionStart` notice: one line when the installed harness is not the
 * pinned one, as after a `git pull` that brought a bump, until `bun install`.
 * Claude Code adds a `SessionStart` hook's output to the session, so the
 * agent reads it too.
 *
 * Inline rather than a script in the package: a stale install is an older
 * package, which may predate any script, and a notice living there would be
 * missing in exactly the state it exists to name. Every path exits 0, and
 * `|| true` covers a bun that cannot start: a notice never stops a session.
 *
 * shortcut: the installed commit is read from `node_modules/harness/.bun-tag`,
 * which bun 1.4.2 writes as `<owner>-<repo>-<7 hex>` and documents nowhere; a
 * bun that changes it makes the notice fall silent rather than wrong. Upgrade
 * when bun documents where an installed git dependency's commit is recorded.
 */
export const NOTICE = [
	"bun -e 'const fs = require(\"node:fs\");",
	'const d = process.env.CLAUDE_PROJECT_DIR ?? ".";',
	'if (!fs.existsSync(d + "/node_modules/harness")) {',
	'console.log("The harness is not installed: run bun install."); process.exit(0); }',
	"try {",
	'const pin = (JSON.parse(fs.readFileSync(d + "/package.json", "utf8")).dependencies?.harness ?? "").match(/#([0-9a-f]{40})$/)?.[1];',
	'const tag = fs.readFileSync(d + "/node_modules/harness/.bun-tag", "utf8").trim().match(/-([0-9a-f]{7,40})$/)?.[1];',
	"if (pin && tag && !pin.startsWith(tag))",
	'console.log("The installed harness is " + tag + ", the pin " + pin.slice(0, 7) + ": run bun install.");',
	"} catch {}' || true",
	MARK,
].join(" ");

/**
 * Every hook the harness registers in a consumer's settings: what
 * `settings.ts` asserts and `sync.ts` writes, so the two cannot disagree on
 * which hooks there are. A hook the harness adds is one entry here, and its
 * command ends with `MARK`. `sole` makes `settings.ts` refuse any
 * other hook under the same matcher; without it the hook need only be present.
 */
export const HOOKS: {
	event: string;
	matcher?: string;
	command: string;
	name: string;
	sole?: true;
}[] = [
	{
		event: "PreToolUse",
		matcher: "Bash",
		command: BOOTSTRAP,
		name: "harness bootstrap",
		sole: true,
	},
	{
		event: "PreToolUse",
		matcher: NOTION_MATCHER,
		command: NOTION_GUARD,
		name: "harness Notion update guard",
	},
	{ event: "UserPromptSubmit", command: TURN_MARK, name: "harness turn gate" },
	{ event: "Stop", command: TURN_STOP, name: "harness turn gate" },
	{ event: "SessionStart", command: NOTICE, name: "harness stale-install notice" },
];
