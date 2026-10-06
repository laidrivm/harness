/**
 * The Bash `PreToolUse` hook command every consumer's `.claude/settings.json`
 * carries, character for character. It is the one piece of the harness a
 * consumer holds as text, because it has to run before the harness is
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
].join(" ");
